import {backup,DatabaseSync} from 'node:sqlite';
import {mkdir,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
export function verifyBackup(path) {
 const db=new DatabaseSync(path,{readOnly:true});
 try {
 if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok' || db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Backup integrity failed.');
 return {version:db.prepare('PRAGMA user_version').get().user_version,businesses:db.prepare('SELECT COUNT(*) n FROM businesses').get().n};
 }finally{db.close();}
}
export async function makeBackup(db,directory) {
 await mkdir(directory,{recursive:true,mode:0o700});
 const final=join(directory,'quotetend-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID()+'.sqlite'),partial=final+'.partial';
 try {await backup(db,partial);verifyBackup(partial);await rename(partial,final);return final;}
 catch(e){await unlink(partial).catch(()=>{});throw e;}
}
export function scheduledBackups(db,directory,log=()=>{}) {
 let active=null,lastSuccess=null,failed=false;
 const run=()=>active || (active=makeBackup(db,directory).then(path=>{lastSuccess=Date.now();failed=false;log({event:'backup_complete'});return path;},e=>{failed=true;log({event:'backup_failed'});throw e;}).finally(()=>{active=null;}));
 const timer=setInterval(()=>run().catch(()=>{}),6*60*60*1000);timer.unref();
 return {run,healthy:()=>!failed && lastSuccess!==null && Date.now()-lastSuccess<8*60*60*1000,stop:async()=>{clearInterval(timer);if(active)await active.catch(()=>{});}};
}
