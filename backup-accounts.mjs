import {DatabaseSync} from 'node:sqlite';
import {existsSync,copyFileSync,constants} from 'node:fs';
import {resolve} from 'node:path';
import {defaultDatabase} from './account-store.mjs';
import {makeBackup,verifyBackup} from './backups.mjs';
const [action,first,second]=process.argv.slice(2);
if(action==='create' && first) {
 if(!existsSync(defaultDatabase()))throw new Error('Source database does not exist.');
 const db=new DatabaseSync(defaultDatabase(),{readOnly:true});
 try{console.log(await makeBackup(db,resolve(first)));}finally{db.close();}
} else if(action==='verify' && first)console.log(verifyBackup(resolve(first)));
else if(action==='restore-copy' && first && second) {
 if(resolve(first)===resolve(second)||existsSync(second))throw new Error('Restore requires a NEW isolated destination; no overwrite allowed.');
 verifyBackup(resolve(first));copyFileSync(resolve(first),resolve(second),constants.COPYFILE_EXCL);
 console.log(verifyBackup(resolve(second)));
}else throw new Error('Usage: node backup-accounts.mjs create BACKUP_DIRECTORY | verify FILE | restore-copy FILE NEW_DATABASE');
