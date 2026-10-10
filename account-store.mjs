import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import session from 'express-session';
import { migrateLedger, attachLedger } from './ledger.mjs';
import { migrateSecurity, tokenHash } from './account-security.mjs';
import { CSV_COLUMNS, parseBackup, withOptionalFields } from './domain.js';

export const SCHEMA_VERSION = 3;
// Schema 3 adds optional phone, project address and trade fields inside the stored estimate JSON.
// No table or estimate is rewritten; the version bump stops older QuoteTend builds (which would drop
// those fields on their next save) from opening this database. A pre-migration copy is kept.
export function migrateDetailFields(db, path) {
  if (db.prepare('PRAGMA user_version').get().user_version >= 3) return;
  if (db.prepare('SELECT COUNT(*) n FROM businesses').get().n && path !== ':memory:') db.prepare('VACUUM INTO ?').run(path + '.pre-fields-' + randomUUID() + '.sqlite');
  db.exec('PRAGMA user_version=3');
}
export const defaultDatabase = () => process.env.QUOTETEND_DB || join(process.env.LOCALAPPDATA || join(homedir(), '.local', 'share'), 'QuoteTend', 'accounts.sqlite');
export function openAccounts(path = defaultDatabase()) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  if (db.prepare('PRAGMA user_version').get().user_version > SCHEMA_VERSION) { db.close(); throw new Error('This database needs a newer QuoteTend version. No changes applied.'); }
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS businesses (id TEXT PRIMARY KEY, name TEXT NOT NULL,
      quotes TEXT NOT NULL DEFAULT '[]', revision INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS owners (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, business_id TEXT NOT NULL UNIQUE REFERENCES businesses(id));
    CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL);`);
  db.prepare('INSERT OR IGNORE INTO metadata VALUES (?, ?)').run('session_secret', randomBytes(48).toString('hex'));
  db.prepare('DELETE FROM sessions WHERE expires <= ?').run(Date.now());
  try { migrateLedger(db, path); migrateSecurity(db,path); migrateDetailFields(db,path); } catch (error) { db.close(); throw error; }
  const secret = db.prepare('SELECT value FROM metadata WHERE key=?').get('session_secret').value;
  const ownerByEmail = email => db.prepare('SELECT * FROM owners WHERE email=?').get(email);
  const ownerById = id => db.prepare('SELECT * FROM owners WHERE id=?').get(id);
  const store = {
    db, secret, ownerByEmail, ownerById,
    suspended(id) {return !!db.prepare('SELECT 1 FROM metadata WHERE key=?').get('suspended_owner:'+id);},
    setSuspended(id,suspended) {
      if(!ownerById(id))throw new Error('Owner not found.');
      db.exec('BEGIN IMMEDIATE');try{
      if(suspended)db.prepare('INSERT OR REPLACE INTO metadata VALUES(?,?)').run('suspended_owner:'+id,new Date().toISOString());
      else db.prepare('DELETE FROM metadata WHERE key=?').run('suspended_owner:'+id);
      db.prepare("DELETE FROM sessions WHERE json_extract(data,'$.ownerId')=?").run(id);db.exec('COMMIT');
      }catch(e){db.exec('ROLLBACK');throw e;}
    },
    createOwner(email, passwordHash, name, invitation) {
      const id = randomUUID(), businessId = randomUUID();
      db.exec('BEGIN IMMEDIATE');
      try {
        if(invitation!==undefined) {
          const used=db.prepare('DELETE FROM invitations WHERE hash=? AND email=? AND expires>?').run(tokenHash(invitation),email,Date.now());
          if(!used.changes)throw new Error('Invalid invitation');
        }
        db.prepare('INSERT INTO businesses(id,name) VALUES (?,?)').run(businessId, name);
        db.prepare('INSERT INTO owners VALUES (?,?,?,?)').run(id, email, passwordHash, businessId);
        store.initLedger(businessId);
        db.exec('COMMIT'); return ownerById(id);
      } catch (err) { db.exec('ROLLBACK'); throw err; }
    },
    workspace(businessId) {
      const row = db.prepare('SELECT * FROM businesses WHERE id=?').get(businessId);
      // Older records lack the optional detail fields; present them as blank without rewriting stored JSON.
      return row && { businessId: row.id, businessName: row.name, revision: row.revision, quotes: JSON.parse(row.quotes).map(withOptionalFields) };
    },
    save(businessId, revision, quotes) {
      return db.prepare('UPDATE businesses SET quotes=?, revision=revision+1 WHERE id=? AND revision=?')
        .run(JSON.stringify(quotes), businessId, revision).changes === 1;
    },
    resetPassword(email, hash) {
      const owner = ownerByEmail(email); if (!owner) return false;
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('UPDATE owners SET password_hash=? WHERE id=?').run(hash, owner.id);
        db.prepare('DELETE FROM recovery_codes WHERE owner_id=?').run(owner.id);
        db.exec('DELETE FROM sessions'); db.exec('COMMIT'); return true;
      } catch (err) { db.exec('ROLLBACK'); throw err; }
    },
    close() { db.close(); }
  };
  return attachLedger(store);
}
export class SQLiteSessions extends session.Store {
  constructor(db) { super(); this.db = db; }
  get(sid, callback) {
    try {
      const row = this.db.prepare('SELECT data FROM sessions WHERE sid=? AND expires>?').get(sid, Date.now());
      callback(null, row ? JSON.parse(row.data) : null);
    } catch (err) { callback(err); }
  }
  set(sid, data, callback = () => {}) {
    try {
      this.db.prepare('DELETE FROM sessions WHERE expires <= ?').run(Date.now());
      this.db.prepare('INSERT OR REPLACE INTO sessions VALUES (?,?,?)').run(sid, JSON.stringify(data), new Date(data.cookie.expires).getTime());
      callback();
    } catch (err) { callback(err); }
  }
  destroy(sid, callback = () => {}) {
    try { this.db.prepare('DELETE FROM sessions WHERE sid=?').run(sid); callback(); }
    catch (err) { callback(err); }
  }
}
export function validateWorkspace(quotes) {
  if (!Array.isArray(quotes) || quotes.length > 5000) throw new Error('Use at most 5,000 estimates per account.');
  const parsed = parseBackup(JSON.stringify({ version: 1, quotes }));
  return parsed.map(q => ({ ...Object.fromEntries([...CSV_COLUMNS, 'saved_draft'].map(k => [k, q[k]])),
    history: q.history.map(h => ({ type: h.type, text: h.text, at: h.at, ...(h.date ? { date: h.date } : {}) })) }));
}
