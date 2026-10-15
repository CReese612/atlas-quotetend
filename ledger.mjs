import { randomUUID, createHash } from 'node:crypto';
import { CSV_COLUMNS, parseBackup, normalizeWorkspace, validDate, todayISO, recordContact, eligible, emailKey } from './domain.js';
import { followupResults, contactEvidence } from './results.js';

const key = id => String(id).trim().toLowerCase();
const fail = (message,status=400,code) => { const e=new Error(message); e.status=status; if(code)e.code=code; throw e; };
const snapshot = q => q ? { status:q.status, amount:q.amount_usd, followUp:q.next_follow_up_date, optedOut:q.do_not_contact, email:q.customer_email } : null;
const usd = n => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
const day = d => new Date(d+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
const FIELD_WORDS = { customer_name:'customer name', customer_email:'email', job_description:'job description', estimate_date:'estimate date', notes:'notes', customer_phone:'phone', address:'project address', trade:'trade' };
// Plain-language activity entry for an owner edit. Built only from the validated before/after records.
export function describeEdit(old, q) {
  const parts=[]; let type='update';
  if(old.status!==q.status) {
    if(['won','lost'].includes(q.status)) { parts.push('Estimate marked '+q.status); type='outcome'; }
    else parts.push(['won','lost'].includes(old.status) ? 'Estimate reopened as '+q.status : 'Status changed to '+q.status);
  }
  if(!old.do_not_contact && q.do_not_contact) { parts.push('Customer opted out; follow-ups stopped'); type='optout'; }
  if(old.do_not_contact && !q.do_not_contact) parts.push('Opt-out removed after review');
  if(old.amount_usd!==q.amount_usd) parts.push('Amount changed from '+usd(old.amount_usd)+' to '+usd(q.amount_usd));
  const closedOut = old.status!==q.status || old.do_not_contact!==q.do_not_contact;
  if((old.next_follow_up_date||'')!==(q.next_follow_up_date||'') && !(closedOut && !q.next_follow_up_date)) {
    parts.push(q.next_follow_up_date ? 'Next follow-up set for '+day(q.next_follow_up_date) : 'Next follow-up date cleared');
    if(parts.length===1) type='schedule';
  }
  const other=Object.keys(FIELD_WORDS).filter(k=>(old[k]??'')!==(q[k]??''));
  if(other.length) parts.push('Updated '+other.map(k=>FIELD_WORDS[k]).join(', '));
  return { text: parts.length ? parts.join('. ') : 'Estimate saved with no changes', type };
}
const clean = rows => {try { return parseBackup(JSON.stringify({version:1,quotes:rows})).map(q=>({...Object.fromEntries([...CSV_COLUMNS,'saved_draft','history'].map(k=>[k,q[k]]))})); } catch(e) {fail(e.message);} };

export function migrateLedger(db, path) {
  const version=db.prepare('PRAGMA user_version').get().user_version;
  if(version>3) fail('This database needs a newer QuoteTend version. No migration was applied.');
  if(version>=1) return;
  // Snapshot the old schema before adding anything. Existing quote JSON is never rewritten by migration.
  if(db.prepare('SELECT COUNT(*) AS n FROM businesses').get().n && path!==':memory:') {
    db.prepare('VACUUM INTO ?').run(path+'.pre-results-'+randomUUID()+'.sqlite');
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`CREATE TABLE measurement(business_id TEXT PRIMARY KEY REFERENCES businesses(id), started_at TEXT NOT NULL, epoch INTEGER NOT NULL);
      CREATE TABLE estimate_identity(business_id TEXT NOT NULL REFERENCES businesses(id), estimate_key TEXT NOT NULL,
        record_id TEXT NOT NULL UNIQUE, estimate_id TEXT NOT NULL, origin TEXT NOT NULL, PRIMARY KEY(business_id,estimate_key));
      CREATE TABLE events(sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, business_id TEXT NOT NULL REFERENCES businesses(id),
        record_id TEXT, estimate_id TEXT, epoch INTEGER NOT NULL, type TEXT NOT NULL, recorded_at TEXT NOT NULL, effective_date TEXT NOT NULL,
        actor_id TEXT NOT NULL, source TEXT NOT NULL, version INTEGER NOT NULL, data TEXT NOT NULL);
      CREATE INDEX event_business ON events(business_id,sequence);
      CREATE TABLE operations(business_id TEXT NOT NULL REFERENCES businesses(id), request_id TEXT NOT NULL, digest TEXT NOT NULL, revision INTEGER NOT NULL,
        PRIMARY KEY(business_id,request_id));
      CREATE TABLE safety_snapshots(id TEXT PRIMARY KEY, business_id TEXT NOT NULL REFERENCES businesses(id), recorded_at TEXT NOT NULL, payload TEXT NOT NULL);
      CREATE TABLE retained_optouts(business_id TEXT NOT NULL REFERENCES businesses(id), preference TEXT NOT NULL, PRIMARY KEY(business_id,preference));`);
    for(const row of db.prepare('SELECT id,quotes FROM businesses').all()) {
      db.prepare('INSERT INTO measurement VALUES(?,?,1)').run(row.id,new Date().toISOString());
      for(const q of JSON.parse(row.quotes)) db.prepare('INSERT INTO estimate_identity VALUES(?,?,?,?,?)').run(row.id,key(q.estimate_id),randomUUID(),q.estimate_id,'legacy');
    }
    db.exec('PRAGMA user_version=1; COMMIT');
  } catch(e) { db.exec('ROLLBACK'); throw e; }
}

export function attachLedger(store) {
  const db=store.db;
  const init = business => db.prepare('INSERT OR IGNORE INTO measurement VALUES(?,?,1)').run(business,new Date().toISOString());
  const meta = business => db.prepare('SELECT * FROM measurement WHERE business_id=?').get(business);
  const identities = business => db.prepare('SELECT record_id AS recordId, estimate_id AS estimateId, origin FROM estimate_identity WHERE business_id=?').all(business);
  const preferences = business => db.prepare('SELECT preference FROM retained_optouts WHERE business_id=?').all(business).map(r=>r.preference);
  const events = business => db.prepare('SELECT * FROM events WHERE business_id=? ORDER BY sequence').all(business).map(e=>({ sequence:e.sequence,id:e.id,businessId:e.business_id,
    recordId:e.record_id,estimateId:e.estimate_id,epoch:e.epoch,type:e.type,recordedAt:e.recorded_at,effectiveDate:e.effective_date,actorId:e.actor_id,source:e.source,version:e.version,data:JSON.parse(e.data) }));
  const oldWorkspace=store.workspace;
  store.workspace = business => { const w=oldWorkspace(business); if(!w)return w; const m=meta(business);
    return {...w,measurement:{startedAt:m.started_at,epoch:m.epoch},identities:identities(business),retainedOptOuts:preferences(business)}; };
  store.initLedger=init;
  store.events=events;
  store.results=(business,from,to)=>{const w=store.workspace(business);return followupResults({...w,events:events(business),startedAt:w.measurement.startedAt,epoch:w.measurement.epoch},from,to,todayISO());};
  store.snapshots=business=>db.prepare('SELECT id, recorded_at AS recordedAt FROM safety_snapshots WHERE business_id=? ORDER BY recorded_at DESC').all(business);
  store.snapshot=(business,id)=>{const r=db.prepare('SELECT payload FROM safety_snapshots WHERE business_id=? AND id=?').get(business,id);return r && JSON.parse(r.payload);};
  store.command=(owner, command)=>{
    const business=owner.business_id;
    if(!command || typeof command.requestId!=='string' || !/^[a-zA-Z0-9-]{16,80}$/.test(command.requestId) || !Number.isSafeInteger(command.revision) || command.revision<0) fail('A request ID and current workspace revision are required.');
    const digest=createHash('sha256').update(JSON.stringify(command)).digest('hex');
    db.exec('BEGIN IMMEDIATE');
    try {
      const previous=db.prepare('SELECT * FROM operations WHERE business_id=? AND request_id=?').get(business,command.requestId);
      if(previous) { if(previous.digest!==digest)fail('Request ID was already used for a different change.',409); db.exec('COMMIT');return {...store.workspace(business),replayed:true}; }
      const w=store.workspace(business); if(w.revision!==command.revision)fail('Another tab saved changes. Your changes were not applied. Copy unsaved text, reload, then try again.',409,'stale_revision');
      const at=new Date().toISOString(), today=todayISO(); let epoch=w.measurement.epoch;
      const date=command.effectiveDate||today; if(!validDate(date)||date>today)fail('Effective date must be a valid date no later than today.');
      let next=w.quotes.map(q=>({...q}));
      const identity = (q,origin='created') => {
        db.prepare('INSERT OR IGNORE INTO estimate_identity VALUES(?,?,?,?,?)').run(business,key(q.estimate_id),randomUUID(),q.estimate_id,origin);
        return db.prepare('SELECT record_id FROM estimate_identity WHERE business_id=? AND estimate_key=?').get(business,key(q.estimate_id)).record_id;
      };
      const emit=(type,q,data={},effective=date,source='owner_reported')=>{
        const id=randomUUID(); db.prepare('INSERT INTO events(id,business_id,record_id,estimate_id,epoch,type,recorded_at,effective_date,actor_id,source,version,data) VALUES(?,?,?,?,?,?,?,?,?,?,1,?)')
          .run(id,business,q?identity(q):null,q?.estimate_id||null,epoch,type,at,effective,owner.id,source,JSON.stringify(data));
        return id;
      };
      const addHistory=(q,text,type='update',effective=date)=>({...q,history:[...q.history,{type,text,at,date:effective}]});
      const target = () => {const q=next.find(q=>key(q.estimate_id)===key(command.estimateId));if(!q)fail('Estimate not found.',404);return q;};
      const replace=q=>{next=next.map(old=>key(old.estimate_id)===key(q.estimate_id)?q:old);};
      if(command.kind==='create') {
        const input=command.fields||{};
        const id=input.estimate_id || 'QT-'+randomUUID().slice(0,8).toUpperCase();
        if(next.some(q=>key(q.estimate_id)===key(id)))fail('Estimate ID already exists.',409);
        const q=clean([{...input,estimate_id:id,history:[],saved_draft:'',last_contact_date:''}])[0];
        identity(q); emit('estimate_created',q,{after:snapshot(q)},today,'manual_entry');
        if(q.status!=='draft')emit('status_changed',q,{before:null,after:snapshot(q)});
        if(q.next_follow_up_date)emit('followup_scheduled',q,{before:'',after:q.next_follow_up_date});
        if(q.do_not_contact)emit('opt_out_changed',q,{before:false,after:true,email:q.customer_email});
        next.push(addHistory(q,'Estimate added','created'));
      } else if(command.kind==='edit' || command.kind==='outcome') {
        const old=target();
        const allowed=CSV_COLUMNS.filter(k=>!['estimate_id','last_contact_date'].includes(k));
        const fields=command.kind==='outcome'?{status:command.status}:Object.fromEntries(Object.entries(command.fields||{}).filter(([k])=>allowed.includes(k)));
        let q=clean([{...old,...fields}])[0];
        if(date<q.estimate_date)fail('Effective date cannot precede the estimate date.');
        if(old.do_not_contact && (!q.do_not_contact || emailKey(q.customer_email)!==emailKey(old.customer_email))) {
          if(command.reviewedOptOut!==true)fail('Review the opt-out change explicitly before saving.');
          db.prepare('DELETE FROM retained_optouts WHERE business_id=? AND preference=?').run(business,old.customer_email?'email:'+emailKey(old.customer_email):'id:'+key(old.estimate_id));
        }
        if(old.status!==q.status) emit('status_changed',q,{before:snapshot(old),after:snapshot(q)});
        else if(command.kind==='outcome' && ['won','lost'].includes(q.status)) emit('outcome_corrected',q,{before:snapshot(old),after:snapshot(q)});
        if(old.amount_usd!==q.amount_usd) {
          emit('amount_changed',q,{before:old.amount_usd,after:q.amount_usd});
          if(old.status===q.status && ['won','lost'].includes(q.status)) {
            const prior=events(business).filter(e=>e.epoch===epoch && e.recordId===identity(q) && ['status_changed','outcome_corrected'].includes(e.type)).at(-1);
            if(prior)emit('outcome_corrected',q,{before:snapshot(old),after:snapshot(q),outcomeSequence:prior.data.outcomeSequence||prior.sequence},prior.effectiveDate);
          }
        }
        if(old.do_not_contact!==q.do_not_contact || old.customer_email!==q.customer_email)emit('opt_out_changed',q,{before:old.do_not_contact,after:q.do_not_contact,beforeEmail:old.customer_email,email:q.customer_email});
        if(old.next_follow_up_date!==q.next_follow_up_date)emit('followup_scheduled',q,{before:old.next_follow_up_date,after:q.next_follow_up_date});
        emit('estimate_edited',q,{changedFields:allowed.filter(k=>(old[k]??'')!==(q[k]??''))});
        const summary=command.kind==='outcome' && old.status===q.status ? {text:'Outcome confirmed: '+q.status+' (reported '+day(date)+')',type:'outcome'} : describeEdit(old,q);
        replace(addHistory(q,summary.text,summary.type));
      } else if(command.kind==='draft') {
        const q=target(); if(!eligible(q,next))fail('Drafts are paused for this estimate.');
        if(typeof command.text!=='string'||command.text.length>10000)fail('Draft must be at most 10,000 characters.');
        replace({...q,saved_draft:command.text}); emit('draft_saved',q,{length:command.text.length},today,'owner_action');
      } else if(command.kind==='contact') {
        const q=target(); const contact=command.contact||{};
        if(typeof contact.note!=='string'||contact.note.length>2000)fail('Contact note must be at most 2,000 characters.');
        let changed; try {changed=recordContact(q,contact,today,next);}catch(e){fail(e.message);}
        replace(changed); emit('contact_logged',q,{channel:contact.channel,amount:q.amount_usd,currency:'USD',nextDate:contact.nextDate,previousLastContact:q.last_contact_date,...(contact.result?{result:contact.result}:{})},contact.date);
        emit('followup_scheduled',q,{before:q.next_follow_up_date,after:contact.nextDate},contact.date);
      } else if(command.kind==='correct-contact') {
        const q=target(), own=events(business).filter(e=>e.epoch===epoch && e.recordId===identity(q));
        const original=own.find(e=>e.id===command.eventId && e.type==='contact_logged');
        if(!original)fail('Contact record not found in this reporting period.',404);
        const before=contactEvidence(own).find(e=>e.id===original.id);
        const correction=command.correction||{};
        if(typeof correction.reason!=='string' || !correction.reason.trim() || correction.reason.length>1000)fail('Explain the correction in 1–1,000 characters.');
        if(typeof correction.voided!=='boolean' || !validDate(correction.date) || correction.date<q.estimate_date || correction.date>today || !['Email','Phone','Text','Other'].includes(correction.channel))fail('Choose a valid contact date, method and correction type.');
        emit('contact_corrected',q,{eventId:original.id,before:{date:before.effectiveDate,channel:before.data.channel,voided:before.voided},after:{date:correction.date,channel:correction.channel,voided:correction.voided},reason:correction.reason.trim()},today);
        const all=events(business).filter(e=>e.epoch===epoch && e.recordId===identity(q));
        const remaining=contactEvidence(all).filter(e=>!e.voided).map(e=>e.effectiveDate);
        // Preserve explicitly captured pre-ledger summaries; never manufacture a contact event from one.
        const first=own.find(e=>e.type==='contact_logged');
        const origin=w.identities.find(i=>i.recordId===original.recordId)?.origin;
        const unknownBaseline=first && !Object.hasOwn(first.data,'previousLastContact') && origin!=='created';
        const baseline=unknownBaseline ? q.last_contact_date : first?.data.previousLastContact || '';
        const last=[baseline,...remaining].sort().at(-1)||'';
        replace(addHistory({...q,last_contact_date:last},(unknownBaseline?'Earlier last-contact summary retained as unverified. ':'')+'Contact '+(correction.voided?'voided':'corrected')+' ('+original.id.slice(0,8)+'): '+correction.reason.trim()+'; next follow-up unchanged','correction',today));
      } else if(command.kind==='import') {
        const rows=clean(command.quotes||[]);
        if(!rows.length)fail('No estimates selected for import.');
        for(const q of rows) {
          if(next.some(old=>key(old.estimate_id)===key(q.estimate_id)))fail('Import conflicts with an existing estimate. Preview again.',409);
          identity(q,'imported'); emit('estimate_imported',q,{after:snapshot(q),priorHistory:'unknown'},today,'csv_import');
          if(q.next_follow_up_date)emit('followup_scheduled',q,{before:null,after:q.next_follow_up_date},today,'csv_import');
          if(q.do_not_contact)emit('opt_out_changed',q,{before:null,after:true,email:q.customer_email},today,'csv_import');
          next.push(addHistory({...q,history:[],saved_draft:''},'Estimate imported; earlier activity is unverified','import',today));
        }
      } else if(command.kind==='restore') {
        if(command.confirmReplacement!==true)fail('Confirm replacement and the new measurement period.');
        const rows=clean(command.quotes||[]);
        const snapId=randomUUID();
        db.prepare('INSERT INTO safety_snapshots VALUES(?,?,?,?)').run(snapId,business,at,JSON.stringify({version:1,quotes:w.quotes,exported_at:at,measurement:w.measurement,retainedOptOuts:w.retainedOptOuts,notice:'Safety copy; restoring starts a new reporting period. Event evidence remains in the original database.'}));
        for(const q of [...w.quotes,...rows].filter(q=>q.do_not_contact))db.prepare('INSERT OR IGNORE INTO retained_optouts VALUES(?,?)').run(business,q.customer_email?'email:'+emailKey(q.customer_email):'id:'+key(q.estimate_id));
        next=rows; epoch+=1; db.prepare('UPDATE measurement SET started_at=?,epoch=? WHERE business_id=?').run(at,epoch,business);
        for(const q of next) {identity(q,'restored');db.prepare('UPDATE estimate_identity SET origin=? WHERE business_id=? AND estimate_key=?').run('restored',business,key(q.estimate_id));}
        emit('workspace_restored',null,{snapshotId:snapId,previousEpoch:w.measurement.epoch,count:next.length},today,'backup_restore');
      } else if(command.kind==='release-optout') {
        if(command.reviewedOptOut!==true || !preferences(business).includes(command.preference))fail('Choose and explicitly review a retained preference.');
        db.prepare('DELETE FROM retained_optouts WHERE business_id=? AND preference=?').run(business,command.preference);
        emit('retained_optout_released',null,{preference:command.preference},today);
      } else fail('Unknown account operation.');
      const retained=new Set(preferences(business));
      next=next.map(q=>{const blocked=retained.has('email:'+emailKey(q.customer_email))||retained.has('id:'+key(q.estimate_id));
        if(blocked&&!q.do_not_contact){emit('opt_out_retained',q,{before:false,after:true,reason:'preference retained across restore'},today,'restore_safeguard');return {...q,do_not_contact:true};}return q;});
      const beforeNormalization=new Map(next.map(q=>[key(q.estimate_id),q.next_follow_up_date]));
      next=normalizeWorkspace(next);
      for(const q of next) {
        const before=beforeNormalization.get(key(q.estimate_id));
        if(before && !q.next_follow_up_date)emit('followup_scheduled',q,{before,after:'',reason:'shared or retained opt-out normalization'},today);
      }
      if(next.length>5000 || Buffer.byteLength(JSON.stringify({version:1,quotes:next}))>4_800_000)fail('Account capacity reached (5,000 estimates / 4.8 MB). Export your data; this change was not saved.',413);
      // Internal snapshot persistence is retained; callers can no longer replace it through ordinary PUT.
      db.prepare('UPDATE businesses SET quotes=?,revision=revision+1 WHERE id=?').run(JSON.stringify(next),business);
      db.prepare('INSERT INTO operations VALUES(?,?,?,?)').run(business,command.requestId,digest,w.revision+1);
      db.exec('COMMIT');return store.workspace(business);
    } catch(e) {db.exec('ROLLBACK');throw e;}
  };
  return store;
}
