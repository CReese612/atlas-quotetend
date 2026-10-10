import { CSV_COLUMNS, STATUSES, parseCSV, previewImport } from './domain.js';

export const REQUIRED_FIELDS = ['estimate_id', 'customer_name', 'job_description', 'amount_usd', 'estimate_date'];
export const FIELD_LABELS = { estimate_id: 'Estimate ID', customer_name: 'Customer name', customer_email: 'Email', job_description: 'Job description', amount_usd: 'Amount (USD)', estimate_date: 'Estimate date', status: 'Status', next_follow_up_date: 'Next follow-up date', last_contact_date: 'Last contact date', do_not_contact: 'Do not contact', notes: 'Notes', customer_phone: 'Phone', address: 'Project address', trade: 'Trade / service' };
const aliases = {
  estimate_id: ['estimate id', 'quote id', 'quote number', 'estimate number', 'estimate invoice #', 'estimate #', 'quote #', 'id'],
  customer_name: ['customer name', 'client name', 'customer', 'client', 'name'],
  customer_email: ['customer email', 'client email', 'client email address', 'email', 'email address'],
  job_description: ['job description', 'job', 'description', 'title', 'project', 'project description'],
  amount_usd: ['amount usd', 'amount', 'total', 'quote total', 'estimate total'],
  estimate_date: ['estimate date', 'quote date', 'date issued', 'date'],
  status: ['status', 'quote status', 'estimate status'],
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
function convertDate(value, format) {
  if (format === 'iso' || !value) return value;
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (!match) return value;
  const [, a, b, year] = match;
  return `${year}-${(format === 'mdy' ? a : b).padStart(2, '0')}-${(format === 'mdy' ? b : a).padStart(2, '0')}`;
}
function convertAmount(value) {
  if (!/^\$?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value)) return value;
  return value.replace(/[$,]/g, '');
}
export function previewSpreadsheet(sheet, mapping, options = {}, existing = []) {
  const selected = CSV_COLUMNS.filter(k => mapping[k] !== '');
  for (const key of REQUIRED_FIELDS) if (mapping[key] === '' || mapping[key] === undefined) throw new Error(`Choose a column for ${FIELD_LABELS[key]}. Add it to the source spreadsheet if missing.`);
  if (selected.some(k => !/^\d+$/.test(String(mapping[k])) || Number(mapping[k]) >= sheet.headers.length)) throw new Error('A mapped column is unavailable. Choose the columns again.');
  if (new Set(selected.map(k => mapping[k])).size !== selected.length) throw new Error('Use each source column only once.');
  if (mapping.do_not_contact === '' && options.optOutReviewed !== true) throw new Error('Review the missing opt-out column notice before continuing.');
  if (!['iso', 'mdy', 'dmy'].includes(options.dateFormat || 'iso')) throw new Error('Choose a supported date format.');
  const defaultStatus = options.defaultStatus || 'draft';
  if (!STATUSES.includes(defaultStatus)) throw new Error('Choose a valid default status.');
  const csvCell = s => `"${String(s).replaceAll('"', '""')}"`;
  const canonical = [CSV_COLUMNS.join(',')];
  for (const [index, row] of sheet.rows.entries()) {
    if (row.length !== sheet.headers.length) throw new Error(`CSV record ${index + 2} has ${row.length} fields but ${sheet.headers.length} headings. Fix the source file before previewing.`);
    const q = Object.fromEntries(CSV_COLUMNS.map(k => [k, mapping[k] === '' ? '' : String(row[Number(mapping[k])] ?? '').trim()]));
    if (mapping.status === '') q.status = defaultStatus;
    else if (options.statusMap && Object.hasOwn(options.statusMap, q.status)) q.status = options.statusMap[q.status] || q.status;
    if (mapping.do_not_contact === '') q.do_not_contact = 'false';
    else { const flag = q.do_not_contact.toLowerCase(); q.do_not_contact = ['true', 'yes', '1'].includes(flag) ? 'true' : ['false', 'no', '0'].includes(flag) ? 'false' : flag; }
    for (const k of ['estimate_date', 'next_follow_up_date', 'last_contact_date']) q[k] = convertDate(q[k], options.dateFormat || 'iso');
    q.amount_usd = convertAmount(q.amount_usd);
    canonical.push(CSV_COLUMNS.map(k => csvCell(q[k])).join(','));
  }
  const result = previewImport(canonical.join('\r\n'), existing);
  for (const row of result) {
    if (mapping.status === '') row.warnings.push(`Missing status column: using your selected default (${defaultStatus})`);
    if (mapping.do_not_contact === '') row.warnings.push('No opt-out column provided; existing shared-email blocks still apply');
    if (row.quote.status === 'sent' && !row.quote.do_not_contact && !row.quote.next_follow_up_date) row.warnings.push('No follow-up date: schedule it from Needs a date');
  }
  return result;
}
