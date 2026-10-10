import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,basename} from 'node:path';
import {request} from 'node:http';
import {startServer} from '../server.mjs';
import {openAccounts} from '../account-store.mjs';
import {configuration} from '../production-config.mjs';
import {todayISO,followupState,metrics,optOutBlocks} from '../domain.js';
import {assertStagingTarget,seedStaging} from '../staging/seed-qa.mjs';
import {QA_BUSINESS_NAME,qaEstimates} from '../staging/qa-data.mjs';
const password='Fictional-staging-password-731!',email='qa-owner@example.test',today=todayISO();
// Open handles must close before the directory is removed (Windows refuses to delete a locked database).
const closers=new WeakMap();
const own=(t,close)=>{closers.get(t).push(close);};
function temp(t){const dir=mkdtempSync(join(tmpdir(),'quotetend-staging-test-'));closers.set(t,[]);t.after(async()=>{for(const close of closers.get(t).reverse())await close();if(dirname(dir)===tmpdir()&&basename(dir).startsWith('quotetend-staging-test-'))rmSync(dir,{recursive:true,force:true});});return dir;}
const env=dir=>({QUOTETEND_STAGING:'1',QUOTETEND_DB:join(dir,'quotetend-staging.sqlite'),QA_OWNER_EMAIL:email});
const hosted=dir=>({production:true,host:'127.0.0.1',origin:'https://staging.fictional.example',secret:'s'.repeat(64),backupDir:join(dir,'staging-backups'),noindex:true});
function client(running,host='staging.fictional.example'){
 return {cookie:'',async req(path,method='GET',body,extra={}){
  const headers={Host:host,Origin:'https://'+host,'Content-Type':'application/json','X-QuoteTend-Request':'1',Cookie:this.cookie,'X-Forwarded-Proto':'https',...extra};
  const result=await new Promise((resolve,reject)=>{const req=request({hostname:'127.0.0.1',port:running.port,path,method,headers},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>{let data;try{data=JSON.parse(text);}catch{data=text;}resolve({status:res.statusCode,data,headers:res.headers,text});});});req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));});
  if(result.headers['set-cookie'])this.cookie=result.headers['set-cookie'][0].split(';')[0];return result;
 }};
}
async function seeded(t){
 const dir=temp(t),dbPath=join(dir,'quotetend-staging.sqlite'),store=openAccounts(dbPath);
 const result=await seedStaging(store,{email});store.close();
 return {dir,dbPath,result};
}

test('staging config is separate from the pilot config and holds no secrets or production references',()=>{
 const staging=readFileSync(new URL('../staging/render.staging.yaml',import.meta.url),'utf8'),pilot=readFileSync(new URL('../render.yaml',import.meta.url),'utf8');
 const code=staging.split('\n').filter(l=>!l.trim().startsWith('#')).join('\n');
 const name=s=>s.match(/^\s*name: (quotetend-[\w-]+)\s*$/gm).map(l=>l.trim().replace('name: ',''));
 for(const n of name(code))assert.ok(!name(pilot).includes(n),'shares resource name '+n);
 assert.match(code,/QUOTETEND_DB\s+value: \/var\/data\/quotetend-staging\.sqlite/);
 assert.doesNotMatch(code,/accounts\.sqlite|quotetend-pilot|quotetend-data\b|\/var\/data\/backups/);
 assert.match(code,/key: SESSION_SECRET\s+sync: false/);assert.match(code,/key: PUBLIC_ORIGIN\s+sync: false/);
 assert.doesNotMatch(code,/key: (SESSION_SECRET|PUBLIC_ORIGIN|QA_OWNER_EMAIL)\s+value:/);
 assert.match(code,/autoDeployTrigger: off/);assert.match(code,/numInstances: 1/);assert.match(code,/plan: starter/);assert.match(code,/sizeGB: 1\b/);
 assert.ok(!/^\s*(previews|pullRequestPreviewsEnabled)/m.test(code),'no preview environments');
 assert.match(code,/QUOTETEND_NOINDEX\s+value: "1"/);
});
test('hosted configuration still fails closed; noindex is opt-in and only staging sets it',()=>{
 const base={NODE_ENV:'production',PUBLIC_ORIGIN:'https://staging.fictional.example',SESSION_SECRET:'a'.repeat(64),QUOTETEND_DB:'/var/data/quotetend-staging.sqlite',QUOTETEND_BACKUP_DIR:'/var/data/staging-backups',TRUST_PROXY_HOPS:'1'};
 assert.equal(configuration(base).noindex,false);assert.equal(configuration({...base,QUOTETEND_NOINDEX:'1'}).noindex,true);
 assert.equal(configuration(base).host,'0.0.0.0');
 for(const [key,value] of [['PUBLIC_ORIGIN','http://staging.fictional.example'],['SESSION_SECRET','x'.repeat(47)],['QUOTETEND_DB',''],['QUOTETEND_BACKUP_DIR',''],['TRUST_PROXY_HOPS','2']])assert.throws(()=>configuration({...base,[key]:value}));
});
test('seed guard refuses anything that is not an explicit staging database',t=>{
 const dir=temp(t),good=env(dir);
 assert.equal(assertStagingTarget(good).email,email);
 assert.throws(()=>assertStagingTarget({...good,QUOTETEND_STAGING:undefined}),/QUOTETEND_STAGING=1/);
 assert.throws(()=>assertStagingTarget({...good,QUOTETEND_DB:undefined}),/QUOTETEND_DB/);
 for(const file of ['accounts.sqlite','quotetend.sqlite','staging.sqlite','prod-quotetend-staging.sqlite','quotetend-staging.sqlite.bak'])assert.throws(()=>assertStagingTarget({...good,QUOTETEND_DB:join(dir,file)}),/quotetend-staging/,file);
 assert.throws(()=>assertStagingTarget({...good,QA_OWNER_EMAIL:'not-an-email'}),/QA_OWNER_EMAIL/);
 assert.throws(()=>assertStagingTarget(good,{reset:true}),/QUOTETEND_STAGING_RESET/);
 assert.equal(assertStagingTarget({...good,QUOTETEND_STAGING_RESET:'reset-qa-data'},{reset:true}).email,email);
});
test('seed creates about 40 fictional estimates covering every required state, with no real-looking data',async t=>{
 const {dbPath,result}=await seeded(t);
 assert.equal(result.estimates,40);assert.ok(result.recoveryCode&&result.recoveryCode.length>=40);
 const store=openAccounts(dbPath);own(t,()=>store.close());
 const w=store.workspace(result.businessId),q=w.quotes,blocks=optOutBlocks(q),state=x=>followupState(x,today,blocks);
 assert.equal(w.businessName,QA_BUSINESS_NAME);
 for(const s of ['draft','sent','won','lost'])assert.ok(q.some(x=>x.status===s),s);
 for(const s of ['overdue','today','upcoming','unscheduled','paused'])assert.ok(q.some(x=>state(x)===s),s);
 assert.ok(q.some(x=>x.status==='sent'&&x.last_contact_date),'contacted');assert.ok(q.some(x=>x.status==='sent'&&!x.last_contact_date),'never contacted');
 assert.ok(q.some(x=>x.do_not_contact),'opt-out');assert.ok(q.some(x=>!x.do_not_contact&&state(x)==='paused'),'shared-email pause');
 for(const trade of ['Roofing','Siding','Gutters','Windows & doors','Exterior repairs'])assert.ok(q.filter(x=>x.trade===trade).length>=5,trade);
 assert.ok(q.some(x=>!x.customer_email)&&q.some(x=>!x.customer_phone)&&q.some(x=>!x.address),'incomplete details exist');
 for(const x of q){
  if(x.customer_email)assert.match(x.customer_email,/@example\.test$/);
  if(x.customer_phone)assert.match(x.customer_phone,/^\(541\) 555-01\d\d$/);
  if(x.address)assert.match(x.address,/ OR 00000$/);
  assert.ok(x.estimate_date<=today);
 }
 assert.ok(q.some(x=>x.notes)&&q.some(x=>x.history.some(h=>h.type==='contact')));
 const m=metrics(q,today);assert.equal(m.wonCount,q.filter(x=>x.status==='won').length);assert.ok(m.dueCount>0&&m.openCount>0);
 // Drafts carry no follow-up; closed records carry none either.
 assert.ok(q.filter(x=>['draft','won','lost'].includes(x.status)).every(x=>!x.next_follow_up_date));
 // Fixture dates are always relative to the seed day.
 const later=qaEstimates('2031-03-15');assert.equal(later.length,40);assert.ok(later.every(e=>e.fields.estimate_date<'2031-03-15'));
});
test('seed does not overwrite QA work on re-run; reset is explicit, keeps the password and only touches the QA business',async t=>{
 const {dbPath}=await seeded(t);
 const store=openAccounts(dbPath);own(t,()=>store.close());
 const owner=store.ownerByEmail(email),before=owner.password_hash;
 let w=store.workspace(owner.business_id);
 w=store.command(owner,{kind:'edit',estimateId:'QA-1003',requestId:'qa-edit-'+'0'.repeat(16),revision:w.revision,fields:{customer_name:'Edited By QA'}});
 await assert.rejects(()=>seedStaging(store,{email}),/already exists/);
 assert.equal(store.workspace(owner.business_id).quotes.find(x=>x.estimate_id==='QA-1003').customer_name,'Edited By QA');
 await assert.rejects(()=>seedStaging(store,{email:'someone-else@example.test'}),/already has accounts/);
 await assert.rejects(()=>seedStaging(store,{email:'someone-else@example.test',reset:true}),/Nothing to reset/);
 store.createOwner('other@example.test','x','Some Other Business');
 const other=store.ownerByEmail('other@example.test');
 await seedStaging(store,{email,reset:true});
 assert.equal(store.workspace(owner.business_id).quotes.find(x=>x.estimate_id==='QA-1003').customer_name,'Linus Penhallow');
 assert.equal(store.workspace(owner.business_id).quotes.length,40);
 assert.equal(store.ownerByEmail(email).password_hash,before);
 assert.equal(store.workspace(other.business_id).quotes.length,0);assert.equal(store.workspace(other.business_id).businessName,'Some Other Business');
 // Refuses to wipe a business that is not the QA seed business.
 store.db.prepare('UPDATE businesses SET name=? WHERE id=?').run('A Real Customer',owner.business_id);
 await assert.rejects(()=>seedStaging(store,{email,reset:true}),/not the QA seed business/);
 assert.equal(store.workspace(owner.business_id).quotes.length,40);
});
test('hosted staging: private data needs a session, self-registration needs an invitation, noindex, tenant isolation, persistence across restart, recovery-code password setup',async t=>{
 const {dir,dbPath,result}=await seeded(t);
 let run=await startServer({port:0,dbPath,config:hosted(dir),logger:()=>{}});own(t,async()=>{await run?.close();});
 const owner=client(run),anon=client(run);
 const robots=await anon.req('/robots.txt');assert.equal(robots.status,200);assert.match(robots.text,/Disallow: \//);
 for(const path of ['/signin','/account','/healthz','/api/me'])assert.match((await anon.req(path)).headers['x-robots-tag'],/noindex/,path);
 assert.equal((await anon.req('/api/me')).status,401);
 assert.equal((await anon.req('/api/workspaces/'+result.businessId)).status,401);
 assert.equal((await anon.req('/api/register','POST',{email:'walkin@example.test',businessName:'Walk In',password})).status,403);
 assert.equal((await anon.req('/api/login','POST',{email,password})).status,401,'no password exists until the owner sets one');
 assert.equal((await anon.req('/api/recover','POST',{email,code:'wrong-code',password})).status,400);
 assert.equal((await owner.req('/api/recover','POST',{email,code:result.recoveryCode,password})).status,200);
 assert.equal((await owner.req('/api/recover','POST',{email,code:result.recoveryCode,password:password+'x'})).status,400,'recovery code is one-use');
 const login=await owner.req('/api/login','POST',{email,password});assert.equal(login.status,200);
 assert.match(login.headers['set-cookie'][0],/Secure/);assert.match(login.headers['set-cookie'][0],/HttpOnly/);assert.match(login.headers['set-cookie'][0],/SameSite=Strict/);
 const ws=(await owner.req('/api/workspaces/'+result.businessId)).data;assert.equal(ws.quotes.length,40);
 // Responses never carry credentials, hashes or the session secret.
 const dump=JSON.stringify([ws,(await owner.req('/api/me')).data,(await owner.req('/api/workspaces/'+result.businessId+'/events')).data]);
 for(const secret of [password,'s'.repeat(64),result.recoveryCode,'$2a$','$2b$','password_hash'])assert.ok(!dump.includes(secret),'leaked '+secret.slice(0,6));
 // A second tenant (created directly; production registration is invitation-only) cannot reach the first.
 run.store.createOwner('second@example.test',run.store.ownerById(run.store.ownerByEmail(email).id).password_hash,'Second Test Business');
 const second=client(run);assert.equal((await second.req('/api/login','POST',{email:'second@example.test',password})).status,200);
 assert.equal((await second.req('/api/workspaces/'+result.businessId)).status,404);
 assert.equal((await second.req('/api/workspaces/'+result.businessId+'/commands','POST',{kind:'create',requestId:'cross-tenant-'+'0'.repeat(16),revision:0,fields:{}})).status,404);
 assert.equal((await second.req('/api/workspaces/'+(await second.req('/api/me')).data.businessId)).data.quotes.length,0);
 // Cross-origin and wrong-host writes are blocked.
 assert.equal((await owner.req('/api/logout','POST',{}, {Origin:'https://evil.example'})).status,403);
 assert.equal((await anon.req('/healthz','GET',undefined,{Host:'evil.example'})).status,403);
 // Persist a change, restart on the same file, and read it back after signing in again.
 let rev=ws.revision;
 const saved=(await owner.req('/api/workspaces/'+result.businessId+'/commands','POST',{kind:'create',requestId:'persist-check-'+'0'.repeat(16),revision:rev,fields:{estimate_id:'QA-PERSIST',customer_name:'Persistence Check',customer_email:'persist@example.test',job_description:'Persistence check job',amount_usd:123.45,estimate_date:today,status:'sent',next_follow_up_date:today,last_contact_date:'',do_not_contact:false,notes:'',customer_phone:'',address:'',trade:'Roofing'}}));
 assert.equal(saved.status,200);
 await run.close();run=await startServer({port:0,dbPath,config:hosted(dir),logger:()=>{}});
 const again=client(run);assert.equal((await again.req('/api/me')).status,401,'sessions are not shared by a new client');
 assert.equal((await again.req('/api/login','POST',{email,password})).status,200);
 const after=(await again.req('/api/workspaces/'+result.businessId)).data;
 assert.equal(after.quotes.length,41);assert.equal(after.quotes.find(x=>x.estimate_id==='QA-PERSIST').customer_name,'Persistence Check');
 assert.equal(run.store.db.prepare('PRAGMA user_version').get().user_version,3,'schema unchanged on reopen');
});
test('characterization (NOT a rule change): Won without a logged contact is not a Follow-up Result; Won after a logged contact is',async t=>{
 const {dbPath,result}=await seeded(t);const store=openAccounts(dbPath);own(t,()=>store.close());
 const r=store.results(result.businessId,'2000-01-01',today);
 const wonIds=store.workspace(result.businessId).quotes.filter(q=>q.status==='won').map(q=>q.estimate_id);
 const attributed=r.cohort.filter(c=>c.outcome==='won').map(c=>c.estimateId);
 assert.deepEqual(wonIds.sort(),['QA-1007','QA-1008','QA-1016','QA-1017','QA-1028','QA-1035']);
 assert.deepEqual(attributed.sort(),['QA-1007','QA-1017','QA-1028'],'only wins preceded by a logged contact are attributed');
 assert.equal(r.counts.won,3);
 assert.ok(!r.cohort.some(c=>['QA-1008','QA-1016','QA-1035'].includes(c.estimateId)),'no-contact wins are absent from the cohort entirely');
});
