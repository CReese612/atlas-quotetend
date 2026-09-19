import {randomBytes} from 'node:crypto';
import {existsSync} from 'node:fs';
import {openAccounts,defaultDatabase} from './account-store.mjs';
import {tokenHash} from './account-security.mjs';
const email=(process.argv[2]||'').trim().toLowerCase();
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw new Error('Usage: node invite-owner.mjs verified-owner@example.com');
if(!existsSync(defaultDatabase()))throw new Error('Initialize the intended database first. Check QUOTETEND_DB.');
const store=openAccounts();
try{
 if(store.ownerByEmail(email))throw new Error('Owner already exists.');
 const code=randomBytes(32).toString('base64url');
 store.db.exec('BEGIN IMMEDIATE');
 try{store.db.prepare('DELETE FROM invitations WHERE email=? OR expires<=?').run(email,Date.now());store.db.prepare('INSERT INTO invitations VALUES(?,?,?)').run(tokenHash(code),email,Date.now()+48*60*60*1000);store.db.exec('COMMIT');}catch(e){store.db.exec('ROLLBACK');throw e;}
 console.log('One-use invitation, expires in 48 hours. Share only with the verified owner through an approved private channel.\n'+code);
}finally{store.close();}
