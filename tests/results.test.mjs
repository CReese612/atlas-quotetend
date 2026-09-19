import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readdirSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,basename} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openAccounts} from '../account-store.mjs';
import {demoData,todayISO,addDays} from '../domain.js';
import {followupResults} from '../results.js';

const today=todayISO(), yesterday=addDays(today,-1), monthAgo=addDays(today,-30);
function fixture(t) {
  const dir=mkdtempSync(join(tmpdir(),'quotetend-results-test-')),path=join(dir,'accounts.sqlite');
  const store=openAccounts(path), owner=store.createOwner('fictional@example.com','not-a-login-fixture','Fictional Painting');
  t.after(()=>{store.close();if(dirname(dir)===tmpdir()&&basename(dir).startsWith('quotetend-results-test-'))rmSync(dir,{recursive:true,force:true});});
  const state=()=>store.workspace(owner.business_id);
  const command=(kind,args={})=>store.command(owner,{kind,requestId:crypto.randomUUID(),revision:state().revision,...args});
  const make=(id,extra={})=>({...demoData()[0],estimate_id:id,customer_name:'Fictional '+id,customer_email:id.toLowerCase()+'@example.com',
    estimate_date:monthAgo,status:'sent',next_follow_up_date:yesterday,last_contact_date:'',do_not_contact:false,amount_usd:100,history:[],saved_draft:'',...extra});
  const create=(id,extra={})=>command('create',{fields:make(id,extra)});
  const contact=(id,date=today)=>command('contact',{estimateId:id,contact:{date,nextDate:addDays(today,3),channel:'Phone',note:'SIMULATED'}});
  const report=()=>store.results(owner.business_id,monthAgo,today);
  return {store,owner,state,command,make,create,contact,report,path,dir};
}

test('legacy migration preserves quote bytes, creates no events and snapshots the old schema',t=>{
  const dir=mkdtempSync(join(tmpdir(),'quotetend-results-test-')),path=join(dir,'legacy.sqlite');
  let old=new DatabaseSync(path);
  old.exec("CREATE TABLE businesses(id TEXT PRIMARY KEY,name TEXT NOT NULL,quotes TEXT NOT NULL,revision INTEGER NOT NULL);CREATE TABLE owners(id TEXT PRIMARY KEY,email TEXT UNIQUE,password_hash TEXT,business_id TEXT UNIQUE REFERENCES businesses(id));");
  const bytes=JSON.stringify(demoData());old.prepare('INSERT INTO businesses VALUES(?,?,?,?)').run('old-business','Legacy fictional',bytes,12);old.close();
  const disposable=join(dir,'copy.sqlite');copyFileSync(path,disposable);
  const store=openAccounts(disposable);
  assert.equal(store.db.prepare('SELECT quotes FROM businesses').get().quotes,bytes);
  assert.equal(store.workspace('old-business').revision,12);assert.equal(store.events('old-business').length,0);
  assert.ok(store.workspace('old-business').identities.every(i=>i.origin==='legacy'));
  assert.equal(store.db.prepare('PRAGMA user_version').get().user_version,2);
  store.close();const reopened=openAccounts(disposable);assert.equal(reopened.events('old-business').length,0);reopened.close();
  assert.equal(readdirSync(dir).filter(f=>f.includes('.pre-results-')).length,1);
  old=new DatabaseSync(path);assert.equal(old.prepare('PRAGMA user_version').get().user_version,0);assert.equal(old.prepare('SELECT quotes FROM businesses').get().quotes,bytes);old.close();
  if(dirname(dir)===tmpdir()&&basename(dir).startsWith('quotetend-results-test-'))rmSync(dir,{recursive:true,force:true});
});

test('focused actions create server-owned events, stable IDs, sources and before/after data',t=>{
  const f=fixture(t);f.create('A');f.contact('A');
  f.command('edit',{estimateId:'A',fields:{amount_usd:250,notes:'Updated fictional job'}});
  f.command('outcome',{estimateId:'A',status:'won',effectiveDate:today});
  const events=f.store.events(f.owner.business_id);
  assert.equal(new Set(events.map(e=>e.recordId)).size,1);assert.equal(new Set(events.map(e=>e.id)).size,events.length);
  assert.ok(events.every(e=>e.actorId===f.owner.id&&e.version===1&&e.recordedAt));
  assert.deepEqual(events.find(e=>e.type==='amount_changed').data,{before:100,after:250});
  assert.equal(events.find(e=>e.type==='contact_logged').data.channel,'Phone');
  assert.equal(events.find(e=>e.type==='contact_logged').source,'owner_reported');
  assert.equal(events.at(-2).type,'followup_scheduled');
  assert.equal(f.report().values.won,250);
});

test('idempotent retries emit no duplicates and mismatched reuse or stale writes fail',t=>{
  const f=fixture(t);f.create('A');
  const cmd={kind:'contact',requestId:crypto.randomUUID(),revision:f.state().revision,estimateId:'A',contact:{date:today,nextDate:addDays(today,1),channel:'Email',note:''}};
  f.store.command(f.owner,cmd);const count=f.store.events(f.owner.business_id).length;
  const retry=f.store.command(f.owner,cmd);assert.equal(retry.replayed,true);assert.equal(f.store.events(f.owner.business_id).length,count);
  assert.throws(()=>f.store.command(f.owner,{...cmd,contact:{...cmd.contact,note:'different'}}),e=>e.status===409);
  assert.throws(()=>f.store.command(f.owner,{...cmd,requestId:crypto.randomUUID()}),e=>e.status===409);
  assert.equal(f.report().counts.contacts,1);
});

test('failure after event generation rolls back record, events and idempotency receipt atomically',t=>{
  const f=fixture(t);f.create('A');const before=f.state(),events=f.store.events(f.owner.business_id);
  f.store.db.exec("CREATE TRIGGER simulate_disk_failure BEFORE UPDATE ON businesses BEGIN SELECT RAISE(ABORT,'simulated storage failure'); END;");
  assert.throws(()=>f.contact('A'),/simulated storage failure/);
  assert.deepEqual(f.state(),before);assert.deepEqual(f.store.events(f.owner.business_id),events);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM operations').get().n,1);
});

test('repeated contacts count activity but cohort and value count an estimate once',t=>{
  const f=fixture(t);f.create('A');f.contact('A',yesterday);f.contact('A');
  f.command('outcome',{estimateId:'A',status:'won'});
  const r=f.report();assert.equal(r.counts.contacts,2);assert.equal(r.counts.followed,1);assert.equal(r.values.followed,100);assert.equal(r.values.won,100);
  const narrow=f.store.results(f.owner.business_id,today,today);assert.equal(narrow.counts.contacts,1);assert.equal(narrow.counts.followed,0);
});

test('amount corrections preserve won date/order; reopened outcomes stop counting as won',t=>{
  const f=fixture(t);f.create('A');f.contact('A',yesterday);f.command('outcome',{estimateId:'A',status:'won',effectiveDate:yesterday});
  f.command('edit',{estimateId:'A',fields:{amount_usd:175}});assert.equal(f.report().values.won,175);assert.equal(f.report().cohort[0].outcomeDate,yesterday);assert.equal(f.report().values.followed,100);
  f.command('edit',{estimateId:'A',fields:{status:'sent',next_follow_up_date:today}});assert.equal(f.report().counts.won,0);assert.equal(f.report().counts.open,1);
  f.command('outcome',{estimateId:'A',status:'lost'});assert.equal(f.report().counts.lost,1);
});

test('backdated outcomes before contact are uncertain; date correction uses explicit evidence',t=>{
  const f=fixture(t);f.create('A');f.contact('A');f.command('outcome',{estimateId:'A',status:'won',effectiveDate:yesterday});
  assert.equal(f.report().counts.won,0);assert.equal(f.report().counts.unknown,1);
  f.command('edit',{estimateId:'A',fields:{amount_usd:200}});assert.equal(f.report().counts.won,0);
  f.command('outcome',{estimateId:'A',status:'won',effectiveDate:today});assert.equal(f.report().counts.won,1);
});

test('imports keep prior dates and history unverified, and results use only new ledger contacts',t=>{
  const f=fixture(t);f.command('import',{quotes:[f.make('A',{last_contact_date:yesterday,history:[{type:'contact',text:'Unverified',at:new Date().toISOString()}]}),f.make('W',{status:'won'})]});
  assert.equal(f.report().counts.contacts,0);assert.equal(f.report().counts.won,0);assert.equal(f.report().incomplete,2);
  f.contact('A');f.command('outcome',{estimateId:'A',status:'won'});assert.equal(f.report().counts.won,1);
  assert.equal(f.store.events(f.owner.business_id).filter(e=>e.type==='estimate_imported').length,2);
});

test('restore retains orphan opt-outs, creates a recoverable snapshot and excludes previous periods',t=>{
  const f=fixture(t);f.create('A');f.contact('A');const oldCopy=f.state().quotes;
  f.command('edit',{estimateId:'A',fields:{do_not_contact:true}});
  const before=f.state(),beforeEvents=f.store.events(f.owner.business_id).length;
  f.command('restore',{quotes:[],confirmReplacement:true});
  assert.equal(f.state().quotes.length,0);assert.equal(f.report().counts.contacts,0);assert.equal(f.state().measurement.epoch,2);
  assert.ok(f.state().retainedOptOuts.includes('email:a@example.com'));
  const saved=f.store.snapshot(f.owner.business_id,f.store.snapshots(f.owner.business_id)[0].id);assert.deepEqual(saved.quotes,before.quotes);
  assert.equal(f.store.events(f.owner.business_id).length,beforeEvents+1);
  f.command('restore',{quotes:oldCopy,confirmReplacement:true});assert.equal(f.state().quotes[0].do_not_contact,true);assert.equal(f.state().quotes[0].next_follow_up_date,'');assert.equal(f.report().counts.contacts,0);
  assert.throws(()=>f.command('edit',{estimateId:'A',fields:{do_not_contact:false}}),/Review the opt-out/);
  f.command('edit',{estimateId:'A',fields:{do_not_contact:false},reviewedOptOut:true});assert.equal(f.state().quotes[0].do_not_contact,false);
});

test('restore failure/cancellation leave workspace, events, preferences and snapshots untouched',t=>{
  const f=fixture(t);f.create('A');const before=f.state();
  assert.throws(()=>f.command('restore',{quotes:[]}),/Confirm replacement/);
  assert.deepEqual(f.state(),before);assert.equal(f.store.snapshots(f.owner.business_id).length,0);
  f.store.db.exec("CREATE TRIGGER fail_restore BEFORE UPDATE ON businesses BEGIN SELECT RAISE(ABORT,'restore failed'); END;");
  assert.throws(()=>f.command('restore',{quotes:[],confirmReplacement:true}),/restore failed/);
  assert.deepEqual(f.state(),before);assert.equal(f.store.snapshots(f.owner.business_id).length,0);
});

test('current overdue excludes opted-out/closed records and stays independent of the cohort filter',t=>{
  const f=fixture(t);f.create('A');f.create('B',{do_not_contact:true});f.create('C',{status:'won'});
  const r=f.store.results(f.owner.business_id,today,today);assert.equal(r.values.overdue,100);assert.equal(r.overdue.length,1);assert.equal(r.counts.followed,0);
  assert.throws(()=>f.store.results(f.owner.business_id,'invalid',today),/valid date range/);
});

test('ordinary commands cannot forge client history, draft contacts or estimate identity',t=>{
  const f=fixture(t);f.create('A',{history:[{type:'contact',text:'Fake',at:new Date().toISOString()}]});
  f.command('edit',{estimateId:'A',fields:{estimate_id:'B',history:[],last_contact_date:today}});
  assert.equal(f.state().quotes[0].estimate_id,'A');assert.equal(f.state().quotes[0].last_contact_date,'');
  f.command('draft',{estimateId:'A',text:'A fictional draft'});assert.equal(f.report().counts.contacts,0);
});
