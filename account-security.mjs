import {createHash,randomBytes,randomUUID} from 'node:crypto';
// Only strings are tokens. A JSON array or object must never be coerced into a matching code (['code'] -> 'code').
export const tokenHash=value=>createHash('sha256').update(typeof value==='string'?value:'').digest('hex');
export function migrateSecurity(db,path) {
 const v=db.prepare('PRAGMA user_version').get().user_version;
 if(v>=2)return;
 if(db.prepare('SELECT COUNT(*) n FROM owners').get().n && path!==':memory:')db.prepare('VACUUM INTO ?').run(path+'.pre-security-'+randomUUID()+'.sqlite');
 db.exec('BEGIN IMMEDIATE');
 try {
 db.exec(`CREATE TABLE recovery_codes(owner_id TEXT PRIMARY KEY REFERENCES owners(id), hash TEXT NOT NULL);
 CREATE TABLE invitations(hash TEXT PRIMARY KEY, email TEXT NOT NULL, expires INTEGER NOT NULL);
 PRAGMA user_version=2; COMMIT;`);
 }catch(e){db.exec('ROLLBACK');throw e;}
}
export function revokeSessions(db,ownerId) {
 db.prepare("DELETE FROM sessions WHERE json_extract(data,'$.ownerId')=?").run(ownerId);
}
export function issueRecovery(db,ownerId) {
 const code=randomBytes(32).toString('base64url');
 db.prepare('INSERT OR REPLACE INTO recovery_codes VALUES(?,?)').run(ownerId,tokenHash(code));
 return code;
}
export function replacePassword(db,owner,hash,{previousHash,recoveryCode}={}) {
 db.exec('BEGIN IMMEDIATE');
 try {
 const current=db.prepare('SELECT password_hash FROM owners WHERE id=?').get(owner.id);
 const recovery=db.prepare('SELECT hash FROM recovery_codes WHERE owner_id=?').get(owner.id);
 if(previousHash ? current.password_hash!==previousHash : !recovery || recovery.hash!==tokenHash(recoveryCode)) {
 db.exec('ROLLBACK');return false;
 }
 db.prepare('UPDATE owners SET password_hash=? WHERE id=?').run(hash,owner.id);
 db.prepare('DELETE FROM recovery_codes WHERE owner_id=?').run(owner.id);
 revokeSessions(db,owner.id);
 db.exec('COMMIT');return true;
 }catch(e){db.exec('ROLLBACK');throw e;}
}
