import { eligible, validDate } from './domain.js';

// Apply amendments without deleting original evidence or changing recording order.
export function contactEvidence(events) {
 const rows=new Map(events.filter(e=>e.type==='contact_logged').map(e=>[e.id,{...e,data:{...e.data},voided:false}]));
 for(const e of events.filter(e=>e.type==='contact_corrected')){
  const row=rows.get(e.data.eventId);if(!row || row.recordId!==e.recordId)continue;
  row.effectiveDate=e.data.after.date;row.data.channel=e.data.after.channel;row.voided=e.data.after.voided;row.correctedAt=e.recordedAt;
 }
 return [...rows.values()];
}

// Pure reporting: chronological evidence comes only from server ledger entries.
export function followupResults({ quotes, events, identities, startedAt, epoch }, from, to, today) {
  if (!validDate(from) || !validDate(to) || from > to || to > today) throw new Error('Choose a valid date range ending no later than today.');
  const inRange = date => date >= from && date <= to;
  const current = new Map(quotes.map(q => [q.estimate_id.toLowerCase(), q]));
  const active = events.filter(e => e.epoch === epoch);
  const contacts = contactEvidence(active).filter(e=>!e.voided);
  const contactRows = contacts.filter(e => inRange(e.effectiveDate)).map(e => ({ estimateId: e.estimateId, eventId: e.id,
    name: current.get(e.estimateId.toLowerCase())?.customer_name || e.estimateId, date: e.effectiveDate, channel: e.data.channel,
    value: e.data.amount, recordedAt: e.recordedAt }));
  const cohort = [];
  for (const identity of identities) {
    const q = current.get(identity.estimateId.toLowerCase()); if (!q) continue;
    const own = active.filter(e => e.recordId === identity.recordId);
    // First reported date; sequence breaks same-day ties. Later backdated entries can move the cohort.
    const ownContacts = contacts.filter(e => e.recordId === identity.recordId).sort((a,b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.sequence-b.sequence);
    const first = ownContacts[0]; if (!first || !inRange(first.effectiveDate)) continue;
    const transitions = own.filter(e => ['status_changed', 'outcome_corrected'].includes(e.type));
    const last = transitions.at(-1);
    const qualifying = last && ownContacts.some(c => c.sequence < (last.data.outcomeSequence || last.sequence) && c.effectiveDate <= last.effectiveDate);
    const known = last && last.data.after.status === q.status;
    const outcome = ['won','lost'].includes(q.status) ? known && qualifying ? q.status : 'unknown' : 'open';
    cohort.push({ estimateId: q.estimate_id, recordId: identity.recordId, name: q.customer_name, firstContact: first.effectiveDate,
      followedValue: first.data.amount, outcome, outcomeDate: known ? last.effectiveDate : '',
      wonValue: outcome === 'won' ? last.data.after.amount : 0, origin: identity.origin });
  }
  const overdue = quotes.filter(q => eligible(q, quotes) && q.next_follow_up_date && q.next_follow_up_date < today)
    .map(q => ({ estimateId:q.estimate_id, name:q.customer_name, date:q.next_follow_up_date, value:q.amount_usd }));
  const sum = (rows,key) => rows.reduce((total,r) => total + Math.round(r[key]*100),0)/100;
  const won = cohort.filter(r=>r.outcome==='won');
  return { from,to,asOf:today,startedAt,epoch,contacts:contactRows,cohort,overdue,
    counts:{ contacts:contactRows.length, followed:cohort.length, won:won.length, lost:cohort.filter(r=>r.outcome==='lost').length,
      open:cohort.filter(r=>r.outcome==='open').length, unknown:cohort.filter(r=>r.outcome==='unknown').length },
    values:{ followed:sum(cohort,'followedValue'), won:sum(won,'wonValue'), overdue:sum(overdue,'value') },
    incomplete:identities.filter(i=>i.origin!=='created' && current.has(i.estimateId.toLowerCase())).length };
}
