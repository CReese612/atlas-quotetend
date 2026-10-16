import { CSV_COLUMNS, STATUSES, parseCSV, previewImport, validDate, todayISO } from './domain.js';

export const REQUIRED_FIELDS = ['estimate_id', 'customer_name', 'job_description', 'amount_usd', 'estimate_date'];
export const FIELD_LABELS = { estimate_id: 'Estimate ID', customer_name: 'Customer name', customer_email: 'Email', job_description: 'Job description', amount_usd: 'Amount (USD)', estimate_date: 'Estimate date', status: 'Status', next_follow_up_date: 'Next follow-up date', last_contact_date: 'Last contact date', do_not_contact: 'Do not contact', notes: 'Notes', customer_phone: 'Phone', address: 'Project address', trade: 'Trade / service' };
// Suggestions only: the owner confirms every match, and a heading that matches two fields (or two headings that match
// one field) is left for the owner to choose.
const aliases = {
  estimate_id: ['estimate id', 'quote id', 'quote number', 'estimate number', 'estimate invoice #', 'estimate #', 'quote #', 'estimate no', 'estimate no.', 'quote no', 'quote no.', 'id'],
  customer_name: ['customer name', 'client name', 'customer', 'client', 'name', 'homeowner', 'homeowner name', 'customer full name'],
  customer_email: ['customer email', 'client email', 'client email address', 'email', 'email address'],
  job_description: ['job description', 'job', 'description', 'title', 'project', 'project description', 'job name', 'scope', 'scope of work', 'work description'],
  amount_usd: ['amount usd', 'amount', 'total', 'quote total', 'estimate total', 'estimate amount', 'quote amount', 'bid amount', 'bid total', 'total price', 'grand total'],
  estimate_date: ['estimate date', 'quote date', 'date issued', 'date', 'date sent', 'sent date', 'created date', 'date created'],
  status: ['status', 'quote status', 'estimate status', 'stage', 'estimate stage'],
  next_follow_up_date: ['next follow up date', 'follow up date', 'next follow up', 'follow up'],
  last_contact_date: ['last contact date', 'last contact'],
  do_not_contact: ['do not contact', 'opt out', 'opted out', 'dnc'], notes: ['notes', 'note'],
  customer_phone: ['customer phone', 'client phone', 'phone', 'phone number', 'mobile', 'mobile phone', 'cell', 'cell phone', 'telephone'],
  address: ['address', 'project address', 'job address', 'job site', 'site address', 'property address', 'street', 'street address', 'service address', 'location'],
  trade: ['trade', 'service', 'service type', 'trade category', 'category', 'job type', 'work type', 'project type']
};
const headerKey = s => s.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
export function inspectSpreadsheet(text) {
  const [headers, ...rows] = parseCSV(text);
  if (headers.some(h => !h.trim())) throw new Error('Every spreadsheet column needs a header. Remove empty columns before exporting.');
  if (new Set(headers.map(headerKey)).size !== headers.length) throw new Error('Column headings must be unique. Rename duplicate headings before importing.');
  if (!rows.length) throw new Error('This file has headings but no estimate rows.');
  const mapping = Object.fromEntries(CSV_COLUMNS.map(k => {
    const matches = headers.map((h, i) => aliases[k].includes(headerKey(h)) ? i : -1).filter(i => i >= 0);
    return [k, matches.length === 1 ? String(matches[0]) : ''];
  }));
  return { headers, rows, mapping };
}
export function statusesFor(sheet, mapping) {
  return mapping.status === '' ? [] : [...new Set(sheet.rows.map(r => (r[Number(mapping.status)] || '').trim()))];
}
// Preselected meanings for status words whose meaning is unambiguous. The owner still sees and can change each one.
const STATUS_SUGGESTIONS = { accepted: 'won', sold: 'won', declined: 'lost', pending: 'sent' };
export function statusSuggestions(sheet, mapping) {
  return Object.fromEntries(statusesFor(sheet, mapping).map(s => [s, STATUSES.includes(s.toLowerCase()) ? s.toLowerCase() : STATUS_SUGGESTIONS[s.toLowerCase()] || '']));
}
export const DATE_FORMATS = { iso: { label: 'YYYY-MM-DD', example: '2026-10-15' }, mdy: { label: 'MM/DD/YYYY', example: '10/15/2026' }, dmy: { label: 'DD/MM/YYYY', example: '15/10/2026' } };
// Year-first dates are unambiguous, so 2026/10/15 is read under any choice. Day and month order is the owner's
// explicit choice; slashes, dashes and dots are accepted between the parts.
function convertDate(value, format) {
  if (!value) return value;
  const yearFirst = /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/.exec(value);
  if (yearFirst) return `${yearFirst[1]}-${yearFirst[2].padStart(2, '0')}-${yearFirst[3].padStart(2, '0')}`;
  if (format === 'iso') return value;
  const match = /^(\d{1,2})([/.-])(\d{1,2})\2(\d{4})$/.exec(value);
  if (!match) return value;
  const [, a, , b, year] = match;
  return `${year}-${(format === 'mdy' ? a : b).padStart(2, '0')}-${(format === 'mdy' ? b : a).padStart(2, '0')}`;
}
export const looksDayMonthYear = value => /^\d{1,2}([/.-])\d{1,2}\1\d{4}$/.test(value);
function convertAmount(value) {
  if (!/^\$?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value)) return value;
  return value.replace(/[$,]/g, '');
}
// Notes that sound like a contact preference. A prompt to check, never an opt-out by itself: QuoteTend cannot tell
// "asked us not to call again" from "don't call before 9".
const OPT_OUT_WORDS = /\b(?:do not|don['’]?t|not to|never|stop|no more|pause)\s+(?:contact(?:ing)?|call(?:s|ing)?|text(?:s|ing)?|e-?mail(?:s|ing)?|follow[- ]?ups?|reach(?:ing)? out)\b|\bopt(?:ed)?[- ]?out\b|\bunsubscribe\b|\bremove (?:me|them|him|her|us) from\b|\bDNC\b/i;

// Rewrites the generic validation messages for a spreadsheet row: names the field, quotes the cell as it appears in the
// file and says what would work. Rules are unchanged; only the explanation is.
function explain(errors, cell, options, mapping) {
  const format = DATE_FORMATS[options.dateFormat || 'iso'];
  const dateHint = (name, value) => {
    if (!value) return `${name} is blank.`;
    const why = /[a-z]/i.test(value) ? ' The month is spelled out; export dates as numbers.'
      : /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2}$/.test(value) ? ' The year has two digits; export four-digit years.'
        : options.dateFormat === 'iso' && looksDayMonthYear(value) ? ' Choose MM/DD/YYYY or DD/MM/YYYY under “Date format”.' : '';
    return `${name} “${value}” doesn’t match the date format you chose (${format.label}, e.g. ${format.example}).${why}`;
  };
  const badDate = errors.some(e => e.startsWith('Estimate date must be'));
  let amountDone = false;
  return errors.flatMap(e => {
    if (e.startsWith('Estimate date must be')) return [dateHint('Estimate date', cell('estimate_date'))];
    if (e.startsWith('next follow up date must be')) return [dateHint('Next follow-up date', cell('next_follow_up_date'))];
    if (e.startsWith('last contact date must be')) return [dateHint('Last contact date', cell('last_contact_date'))];
    if (badDate && / cannot precede the estimate date$/.test(e)) return [];   // follows from the unreadable estimate date
    if (e.startsWith('Amount must be')) {
      if (amountDone) return [];
      amountDone = true;
      return [cell('amount_usd') ? `Amount “${cell('amount_usd')}” isn’t a dollar amount QuoteTend can read. Use a number with at most two decimals, such as 1250, 1250.00 or $1,250.00.` : 'Amount is blank. Every estimate needs its dollar amount.'];
    }
    if (e === 'Do not contact must be true or false') return [cell('do_not_contact') ? `Opt-out value “${cell('do_not_contact')}” isn’t recognized. Use yes or no (true/false or 1/0 also work).` : 'Opt-out cell is blank. Enter yes or no so a customer’s preference is never guessed.'];
    if (e === 'Status must be draft, sent, won, or lost') return [mapping.status === '' ? e : cell('status') ? `Status “${cell('status')}” isn’t matched yet. Choose what it means under “Confirm what each status means”.` : 'Status is blank. Choose what a blank status means under “Confirm what each status means”.'];
    const blank = { 'estimate id is required': 'Estimate ID is blank. Each row needs its own ID that stays the same every time you export.', 'customer name is required': 'Customer name is blank.', 'job description is required': 'Job description is blank. Add a short description such as “Roof replacement”.' }[e];
    return [blank || e];
  });
}

export function previewSpreadsheet(sheet, mapping, options = {}, existing = []) {
  const selected = CSV_COLUMNS.filter(k => mapping[k] !== '');
  for (const key of REQUIRED_FIELDS) if (mapping[key] === '' || mapping[key] === undefined) throw new Error(key === 'estimate_id'
    ? 'Choose a column for Estimate ID. If the spreadsheet has no estimate or quote numbers, add an ID column there (E-1001, E-1002 …) and keep those IDs in later exports; QuoteTend uses them to recognize estimates it already has.'
    : `Choose a column for ${FIELD_LABELS[key]}. Add it to the source spreadsheet if missing.`);
  if (selected.some(k => !/^\d+$/.test(String(mapping[k])) || Number(mapping[k]) >= sheet.headers.length)) throw new Error('A mapped column is unavailable. Choose the columns again.');
  if (new Set(selected.map(k => mapping[k])).size !== selected.length) throw new Error('Use each source column only once.');
  if (mapping.do_not_contact === '' && options.optOutReviewed !== true) throw new Error('Review the missing opt-out column notice before continuing.');
  if (!['iso', 'mdy', 'dmy'].includes(options.dateFormat || 'iso')) throw new Error('Choose a supported date format.');
  const defaultStatus = options.defaultStatus || 'draft';
  if (!STATUSES.includes(defaultStatus)) throw new Error('Choose a valid default status.');
  // Optional first follow-up for sent rows that arrive without one, so a spreadsheet with no follow-up column still
  // produces a working queue. Blank keeps the existing behaviour (those rows wait in "Needs a date").
  const firstFollowUp = options.defaultFollowUp || '';
  if (firstFollowUp && (!validDate(firstFollowUp) || firstFollowUp < todayISO())) throw new Error('Choose today or a later date for the first follow-up, or leave it blank.');
  const csvCell = s => `"${String(s).replaceAll('"', '""')}"`;
  const canonical = [CSV_COLUMNS.join(',')];
  const scheduled = new Set();
  for (const [index, row] of sheet.rows.entries()) {
    if (row.length !== sheet.headers.length) throw new Error(`CSV record ${index + 2} has ${row.length} fields but ${sheet.headers.length} headings. Fix the source file before previewing.`);
    const q = Object.fromEntries(CSV_COLUMNS.map(k => [k, mapping[k] === '' ? '' : String(row[Number(mapping[k])] ?? '').trim()]));
    if (mapping.status === '') q.status = defaultStatus;
    else if (options.statusMap && Object.hasOwn(options.statusMap, q.status)) q.status = options.statusMap[q.status] || q.status;
    if (mapping.do_not_contact === '') q.do_not_contact = 'false';
    else { const flag = q.do_not_contact.toLowerCase(); q.do_not_contact = ['true', 'yes', '1'].includes(flag) ? 'true' : ['false', 'no', '0'].includes(flag) ? 'false' : flag; }
    for (const k of ['estimate_date', 'next_follow_up_date', 'last_contact_date']) q[k] = convertDate(q[k], options.dateFormat || 'iso');
    q.amount_usd = convertAmount(q.amount_usd);
    if (firstFollowUp && q.status === 'sent' && q.do_not_contact === 'false' && !q.next_follow_up_date && validDate(q.estimate_date) && firstFollowUp >= q.estimate_date) {
      q.next_follow_up_date = firstFollowUp; scheduled.add(index);
    }
    canonical.push(CSV_COLUMNS.map(k => csvCell(q[k])).join(','));
  }
  const result = previewImport(canonical.join('\r\n'), existing);
  for (const [index, row] of result.entries()) {
    const cell = k => mapping[k] === '' ? '' : String(sheet.rows[index][Number(mapping[k])] ?? '').trim();
    row.errors = explain(row.errors, cell, options, mapping);
    if (mapping.status === '') row.warnings.push(`Missing status column: using your selected default (${defaultStatus})`);
    if (mapping.do_not_contact === '') row.warnings.push('No opt-out column provided; existing shared-email blocks still apply');
    if (scheduled.has(index) && row.quote.next_follow_up_date) row.warnings.push(`No follow-up date in the file: first follow-up set to ${firstFollowUp}, as you chose`);
    if (row.quote.status === 'sent' && !row.quote.do_not_contact && !row.quote.next_follow_up_date) row.warnings.push('No follow-up date: schedule it from Needs a date');
    const notes = cell('notes');
    if (!row.quote.do_not_contact && OPT_OUT_WORDS.test(notes)) { row.notesMentionOptOut = true; row.warnings.push(`Notes may describe a contact preference (“${notes.length > 80 ? notes.slice(0, 77) + '…' : notes}”). Check before following up; mark the estimate Do not contact if the customer asked.`); }
  }
  return result;
}
