import { resultsMarkup, supportingRows } from './results-view.js';
import { STATUSES, todayISO, addDays, eligible as isEligible, due as isDue, metrics, normalize, normalizeWorkspace, optOutSources, importOptOutBlockers, importCandidates, validateEstimate, draftMessage as makeDraft, recordContact, previewImport, exportCSV, demoData, parseBackup } from './domain.js';
import { accountMode, accountRequest, loadAccount, announceSessionChange } from './account-client.js';
import { FIELD_LABELS, REQUIRED_FIELDS, inspectSpreadsheet, statusesFor, previewSpreadsheet } from './import-mapping.js';

const KEY = 'quotetend.demo.v1';
const $ = s => document.querySelector(s);
const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(n);
const dateLabel = s => s ? new Date(`${s}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: s.slice(0, 4) !== todayISO().slice(0, 4) ? 'numeric' : undefined }) : 'Not scheduled';
const initials = s => s.split(' ').slice(0, 2).map(x => x[0]).join('');
let quotes = [], storageError = '', view = 'overview', search = '', filter = 'all', queueFilter = 'due', selectedId = null, importRows = null;
let sheet = null, columnMapping = null, importName = '', pastedCSV = '';
const eligible = q => isEligible(q, quotes);
const due = q => isDue(q, todayISO(), quotes);
const draftMessage = q => makeDraft(q, account?.businessName, quotes);
let account = null, saving = false;
if (accountMode) {
  try { account = await loadAccount(); quotes = account.quotes; }
  catch (error) {
    if (error.status === 401) { location.replace('/signin'); throw error; }
    storageError = 'Account could not be loaded. Reload to retry. The browser demo has not been opened or changed.';
  }
} else {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) quotes = parseBackup(raw);
    else { quotes = demoData(); localStorage.setItem(KEY, JSON.stringify({ version: 1, quotes })); }
  } catch { storageError = 'Browser storage is unavailable or contains unreadable data. Changes are blocked to protect saved data. Export what is visible, then reset the demo to recover.'; }
}
async function persist(next, command) {
  if (storageError) { toast('Changes are blocked. ' + storageError); return false; }
  if (saving) { toast('A save is in progress. Wait before making another change.'); return false; }
  saving = true;
  try {
    next = normalizeWorkspace(next);
    if (accountMode) {
      if (!command) throw new Error('Reload required: account operation unavailable.');
      const request = { ...command, revision: account.revision, requestId: crypto.randomUUID() };
      let saved;
      try { saved = await accountRequest('/workspaces/' + account.businessId + '/commands', 'POST', request); }
      catch(error) { if(error.status) throw error; saved = await accountRequest('/workspaces/' + account.businessId + '/commands', 'POST', request); }
      account = { ...account, ...saved }; quotes = saved.quotes;
    } else { localStorage.setItem(KEY, JSON.stringify({ version: 1, quotes: next })); quotes = next; }
    $('#save-error').hidden = true; document.querySelectorAll('.save-failure').forEach(el => el.remove()); return true;
  } catch (error) {
    const message = accountMode ? error.message : 'Could not save. Browser storage may be full or unavailable. Your changes were not applied.';
    // On stale state or an uncertain network result, require a reload rather than risk retrying an old snapshot.
    if (accountMode && ![400, 413].includes(error.status)) storageError = message;
    $('#save-error').textContent = message; $('#save-error').hidden = false;
    document.querySelectorAll('dialog[open]').forEach(dialog => {
      let notice = dialog.querySelector('.save-failure');
      if (!notice) { notice = document.createElement('p'); notice.className = 'form-error save-failure'; notice.setAttribute('role', 'alert'); (dialog.querySelector('.dialog-body') || dialog).prepend(notice); }
      notice.textContent = message;
    });
    toast(message); return false;
  } finally { saving = false; }
}
function update(q, command = {kind:'edit',estimateId:q.estimate_id,fields:q}) { return persist(quotes.map(x => x.estimate_id === q.estimate_id ? normalize(q) : x), command); }
let toastTimer;
function toast(text) { $('#toast').textContent = text; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 5000); }
function activity(q, text, type = 'update') { return { ...q, history: [...q.history, { type, text, at: new Date().toISOString() }] }; }
const badge = q => optOutSources(q, quotes).length ? `<span class="badge paused">${q.do_not_contact ? 'Do not contact' : 'Shared-email opt-out'}</span>` : `<span class="badge ${q.status}"><i></i>${{ draft: 'Draft', sent: 'Sent', won: 'Won', lost: 'Lost' }[q.status]}</span>`;
function timing(q) {
  if (!eligible(q)) return optOutSources(q, quotes).length ? '<span class="muted">Follow-ups paused</span>' : '<span class="muted">—</span>';
  if (!q.next_follow_up_date) return '<span class="unscheduled">Needs a date</span>';
  if (q.next_follow_up_date < todayISO()) { const days = Math.round((new Date(`${todayISO()}T12:00:00`) - new Date(`${q.next_follow_up_date}T12:00:00`)) / 86400000); return `<span class="overdue">${days}d overdue</span>`; }
  return q.next_follow_up_date === todayISO() ? '<span class="today">Due today</span>' : `<span>${dateLabel(q.next_follow_up_date)}</span>`;
}
function render() {
  // A navigation or workspace change requires a fresh preview against current records.
  if (sheet) importRows = null;
  const m = metrics(quotes);
  $('#estimate-count').textContent = quotes.length;
  $('#due-count').textContent = m.dueCount;
  document.querySelectorAll('[data-view]').forEach(el => { el.classList.toggle('active', el.dataset.view === view); if (el.dataset.view === view) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); });
  $('#page-crumb').textContent = { overview: 'Overview', estimates: 'All estimates', followups: 'Follow-ups', data: 'Import & export', results: 'Follow-up Results' }[view];
  const warning = storageError ? `<div class="notice danger" role="alert">${escape(storageError)}</div>` : '';
  $('#main').innerHTML = warning + ({ overview: overview, estimates: estimates, followups: followups, data: dataPage, results: resultsPage }[view])();
}
function heading(eyebrow, title, subtitle, actions = '') { return `<section class="page-heading"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p class="subtitle">${subtitle}</p></div><div class="heading-actions">${actions}</div></section>`; }
const addButton = '<button class="button primary" data-action="add"><span aria-hidden="true">＋</span> Add estimate</button>';
function overview() {
  const m = metrics(quotes), queue = quotes.filter(q => due(q)).sort((a, b) => a.next_follow_up_date.localeCompare(b.next_follow_up_date));
  const recent = quotes.flatMap(q => q.history.map(h => ({ ...h, q }))).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 4);
  return heading(new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase(), 'Good work starts with a follow-up.', 'A clear view of your estimates. A simple next step for each one.', addButton) +
  `<section class="stats" aria-label="Pipeline summary">
    <article class="stat"><div class="stat-label">Open pipeline <span>↗</span></div><strong>${money(m.openValue)}</strong><small>${m.openCount} sent estimates awaiting a decision</small></article>
    <article class="stat"><div class="stat-label">Follow-ups due <span>◷</span></div><strong>${m.dueCount}<span class="stat-unit"> estimates</span></strong><small><span class="warm-dot"></span> ${queue.filter(q => q.next_follow_up_date < todayISO()).length} overdue · ${queue.filter(q => q.next_follow_up_date === todayISO()).length} due today</small></article>
    <article class="stat"><div class="stat-label">Won estimates <span>✓</span></div><strong>${money(m.wonValue)}</strong><small>${m.wonCount} accepted · all recorded estimates</small></article>
  </section>
  <section class="focus-banner"><div class="focus-icon">✦</div><div><strong>${m.dueCount ? 'A few conversations worth picking back up.' : 'You’re all caught up on scheduled follow-ups.'}</strong><p>${m.dueCount ? `${m.dueCount} estimates are ready for a personal check-in. Review a draft and take it from there.` : 'Add a new estimate or plan your next check-in.'}</p></div><button class="button light" data-action="view" data-target="followups">${m.dueCount ? 'Review follow-ups' : 'Plan follow-ups'} <span>→</span></button></section>
  ${accountMode && !quotes.length ? '<section class="notice"><strong>Start your business workspace</strong><p>1. <a href="/security">Save a recovery code</a>. 2. Add an estimate or open Import & export. 3. Use Sent for estimates already shared outside QuoteTend and choose a next follow-up date. Review an editable draft, record a contact that actually happened, then record the outcome. Nothing is sent automatically.</p></section>' : ''}
  <div class="overview-grid"><section class="panel"><div class="panel-heading"><div><h2>Needs your attention <span class="count-chip">${queue.length}</span></h2><p>Small next steps to keep your estimates moving.</p></div><button class="text-button" data-action="view" data-target="followups">View all →</button></div>${queue.length ? queue.slice(0, 4).map(q => `<article class="attention-row"><span class="customer-avatar">${escape(initials(q.customer_name))}</span><div class="attention-person"><button class="customer-link" data-action="detail" data-id="${escape(q.estimate_id)}">${escape(q.customer_name)}</button><p>${escape(q.job_description)}</p><div class="row-meta">${timing(q)}<span>·</span><span>${money(q.amount_usd)}</span>${!q.customer_email ? '<span class="missing-email">No email</span>' : ''}</div></div><button class="button small" data-action="detail" data-id="${escape(q.estimate_id)}">Review <span>↗</span></button></article>`).join('') : empty('All clear for today', 'Your scheduled follow-ups will appear here when they’re due.')}</section>
  <aside class="panel pipeline-panel"><div class="panel-heading"><div><h2>Your pipeline</h2><p>Every estimate has a place.</p></div><span class="tiny-icon">◫</span></div><div class="pipeline-total"><strong>${quotes.length}</strong><span>total estimates</span></div><div class="pipeline-bar">${STATUSES.map(s => `<div class="segment ${s}" data-width="${quotes.length ? quotes.filter(q => q.status === s).length / quotes.length * 100 : 0}"></div>`).join('')}</div><div class="pipeline-legend">${STATUSES.map(s => { const list = quotes.filter(q => q.status === s); return `<button data-action="status-filter" data-status="${s}"><span class="legend-label"><i class="legend-dot ${s}"></i>${{ sent: 'Sent · awaiting decision', draft: 'Draft', won: 'Won', lost: 'Lost' }[s]}</span><strong>${list.length}</strong></button>`; }).join('')}</div><p class="pipeline-note">Won totals reflect recorded outcomes, not revenue attributed to QuoteTend.</p></aside></div>
  ${m.unscheduled ? `<button class="schedule-note" data-action="unscheduled"><span>◷</span><strong>${m.unscheduled} ${m.unscheduled === 1 ? 'estimate needs' : 'estimates need'} a follow-up date</strong><span>Plan the next check-in →</span></button>` : ''}
  <section class="panel activity-panel"><div class="panel-heading"><div><h2>Recent activity</h2><p>The latest steps in your workspace.</p></div><span class="eyebrow">LOCAL HISTORY</span></div>${recent.length ? recent.map(h => `<div class="activity-row"><span class="activity-dot"></span><div><button class="customer-link" data-action="detail" data-id="${escape(h.q.estimate_id)}">${escape(h.q.customer_name)}</button><span class="activity-text">${escape(h.text)}</span></div><time>${dateLabel(h.at.slice(0, 10))}</time></div>`).join('') : empty('A fresh start', 'Activity appears as you add and update estimates.')}</section>`;
}
function empty(title, desc) { return `<div class="empty"><span>◌</span><h3>${title}</h3><p>${desc}</p></div>`; }
function table(list) { return list.length ? `<div class="table-wrap"><table><thead><tr><th>Customer / estimate</th><th>Amount</th><th>Status</th><th>Next follow-up</th><th>Estimate date</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${list.map(q => `<tr><td><button class="customer-link" data-action="detail" data-id="${escape(q.estimate_id)}">${escape(q.customer_name)}</button><small>${escape(q.job_description)}</small><span class="id-label">${escape(q.estimate_id)}${!q.customer_email ? ' · No email' : ''}</span></td><td class="amount">${money(q.amount_usd)}</td><td>${badge(q)}</td><td>${timing(q)}</td><td>${dateLabel(q.estimate_date)}</td><td><button class="button small" data-action="detail" data-id="${escape(q.estimate_id)}" aria-label="Review ${escape(q.customer_name)}">Review ↗</button></td></tr>`).join('')}</tbody></table></div>` : empty('No estimates here yet', 'Try another filter or add an estimate to get started.'); }
function estimates() {
  return heading('YOUR WORK, ORGANIZED', 'All estimates', 'From the first quote to the final decision.', `<button class="button" data-action="export">↓ Export CSV</button>${addButton}`) + `<section class="panel"><div class="toolbar"><label class="search"><span aria-hidden="true">⌕</span><input id="search" type="search" placeholder="Search customers, jobs, or estimate IDs" aria-label="Search estimates" value="${escape(search)}"></label><label class="filter-label">Status<select id="status-filter"><option value="all">All statuses</option>${STATUSES.map(s => `<option value="${s}" ${filter === s ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}<option value="optout" ${filter === 'optout' ? 'selected' : ''}>Do not contact</option></select></label></div><div id="table-content">${filteredTable()}</div></section>`;
}
function filteredTable() { return table(quotes.filter(q => (filter === 'all' || filter === 'optout' && optOutSources(q, quotes).length > 0 || q.status === filter) && `${q.customer_name} ${q.job_description} ${q.estimate_id} ${q.customer_email}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => b.estimate_date.localeCompare(a.estimate_date))); }
function followups() {
  const candidates = quotes.filter(eligible);
  const counts = { due: candidates.filter(q => due(q)).length, upcoming: candidates.filter(q => q.next_follow_up_date > todayISO()).length, unscheduled: candidates.filter(q => !q.next_follow_up_date).length };
  const list = candidates.filter(q => queueFilter === 'due' ? due(q) : queueFilter === 'upcoming' ? q.next_follow_up_date > todayISO() : !q.next_follow_up_date).sort((a, b) => a.next_follow_up_date.localeCompare(b.next_follow_up_date));
  return heading('ONE CONVERSATION AT A TIME', 'Follow-ups', 'Review the details, make it personal, and record your next step.', addButton) + `<div class="notice"><span>✓</span> Only sent estimates are shown. Won, lost, draft, and opted-out estimates are excluded.</div><section class="panel"><div class="tabs" role="group" aria-label="Follow-up filters">${Object.entries({ due: 'Due & overdue', upcoming: 'Upcoming', unscheduled: 'Needs a date' }).map(([k, label]) => `<button data-action="queue-filter" data-filter="${k}" class="tab ${queueFilter === k ? 'selected' : ''}" aria-pressed="${queueFilter === k}">${label} <span>${counts[k]}</span></button>`).join('')}</div>${table(list)}</section>`;
}
function dataPage() { return heading('BRING YOUR PIPELINE WITH YOU', 'Import & export', 'Start with a CSV. Keep a copy of your work whenever you need it.') +
  `<div class="data-grid"><section class="panel data-card"><div class="data-icon">↑</div><h2>Bring your spreadsheet</h2><p>Export a spreadsheet as CSV, match its columns, then review the results. Conflicting versions of the same ID are held; existing estimates are never overwritten.</p><div class="import-drop"><label for="csv-file"><strong>Choose a CSV file</strong><span>Up to 2 MB · 5,000 estimates · fictional data only</span></label><input id="csv-file" type="file" accept=".csv,text/csv"></div><details><summary>Or paste CSV text</summary><label for="paste-csv" class="field-help">Include the header row. Use comma-separated CSV, not a copied spreadsheet grid.</label><textarea id="paste-csv" rows="5" maxlength="2000000" placeholder="Quote ID,Customer,Job,Total,Date">${escape(pastedCSV)}</textarea><button class="button" data-action="inspect-paste">Match pasted columns</button></details><button class="text-button" data-action="template">↓ Download example CSV</button><p class="field-help">Required: a stable estimate ID, customer, job, amount and estimate date. Keep IDs unchanged on repeat imports. Optional fields and unfamiliar statuses are reviewed in the next step. XLSX files must be exported as CSV first.</p><div id="import-error" class="form-error" role="alert"></div></section>
  <section class="panel data-card"><div class="data-icon">↓</div><h2>Your data, on hand</h2><p>Export estimate fields as CSV for a spreadsheet. Use a full backup to preserve activity history and saved message drafts too.</p><button class="button wide" data-action="export">Export ${quotes.length} estimates as CSV</button><button class="button wide" data-action="backup">Download full backup</button><label class="restore-label">Restore a full backup<input id="restore-file" type="file" accept=".json,application/json"></label></section></div>
${accountMode ? recoveryPanel() : ''}
  <section id="mapping-panel">${sheet ? mappingHTML() : ''}</section>
  <section id="import-preview">${importRows ? importPreviewHTML() : ''}</section>
  <section class="panel data-notes"><h2>About this first version</h2><div class="notes-grid"><div><strong>Manual follow-up workflow</strong><p>Demo examples are fictional; private accounts start empty. Message drafts use editable templates. There are no paid APIs or messaging connections.</p></div><div><strong>${accountMode ? 'Stored in your business account' : 'Stored in this browser'}</strong><p>${accountMode ? 'Saved to the server database for this business. Local preview uses this computer. Client details, estimates, drafts and history belong to this business only. Export before replacing a workspace.' : 'This separate demo uses browser storage. Clearing browser data removes demo work. Nothing is automatically copied to private accounts.'}</p></div><div><strong>You stay in control</strong><p>Copying a draft does not send it or mark it contacted. Log contact only after a conversation has happened outside QuoteTend.</p></div></div>${accountMode ? '' : `<div class="reset-row"><span>Want a clean start? Reset replaces this browser’s estimates with fresh fictional examples.</span><button class="button danger-outline" data-action="reset">Reset demo data</button></div>`}</section>`; }
function importPreviewHTML() {
  const valid = importRows.filter(r => !r.errors.length);
  const optOutBlocks = importOptOutBlockers(importRows, quotes);
  const counts = Object.fromEntries(['ready', 'held', 'conflict', 'repeat', 'existing', 'invalid'].map(k => [k, importRows.filter(r => r.outcome === k).length]));
  const future = [...quotes, ...valid.map(r => r.quote)];
  const blocked = quotes.filter(q => isEligible(q, quotes) && !isEligible(q, future));
  const summary = `${counts.ready} ready · ${counts.held} held within-file · ${counts.conflict} existing conflicts · ${counts.repeat + counts.existing} duplicates · ${counts.invalid} invalid`;
  return `<section class="panel import-results"><div class="panel-heading"><div><h2>Review your import</h2><p>${summary}. Nothing has been imported yet.</p><p>Held rows are not saved. Correct conflicting IDs in the source file and preview again.</p></div><button class="button primary" data-action="commit-import" ${!valid.length || optOutBlocks.length ? 'disabled' : ''}>Import ${valid.length} valid estimates</button></div>${optOutBlocks.length ? `<div class="notice import-block" role="alert"><strong>Import blocked: an opt-out would be discarded.</strong><p>No estimates or preferences have changed. Repair the listed rows and preview again. For an existing estimate, cancel this import and record its confirmed opt-out in All estimates first. Existing follow-ups are unchanged until you save that correction.</p><ul>${optOutBlocks.map(b => `<li>CSV record ${b.row}: ${escape(b.email)}${b.affectedIds.length ? ` — matching estimates: ${b.affectedIds.map(escape).join(", ")}` : ""}</li>`).join("")}</ul><p>Do not remove an opt-out just to bypass this check. Review the source preference.</p></div>` : ""}${blocked.length ? `<div class="notice">New opt-outs will pause ${blocked.length} existing estimate(s) and clear their follow-up dates: ${blocked.map(q => escape(q.estimate_id)).join(', ')}.</div>` : ''}<div class="table-wrap"><table><thead><tr><th>CSV record</th><th>Customer / ID</th><th>Amount / status</th><th>Result</th></tr></thead><tbody>${importRows.slice(0, 100).map(r => `<tr><td>${r.row}</td><td>${escape(r.quote.customer_name)}<small>${escape(r.quote.estimate_id)}</small></td><td>${Number.isFinite(r.quote.amount_usd) ? money(r.quote.amount_usd) : 'Invalid amount'}<small>${escape(r.quote.status)} · ${escape(r.quote.estimate_date)}</small></td><td><span class="${r.errors.length ? 'overdue' : 'success-text'}">${r.errors.length ? escape(r.errors.join('; ')) : 'Ready to add'}</span>${r.warnings.length ? `<small>${escape(r.warnings.join('; '))}</small>` : ''}</td></tr>`).join('')}</tbody></table></div><div class="panel-heading"><button class="text-button" data-action="import-report">Copy or download full validation report</button>${importRows.length > 100 ? '<p>Showing the first 100 records. The report includes every record.</p>' : ''}</div></section>`;
}
function mappingHTML() {
  return `<section class="panel mapping-card"><p class="eyebrow">STEP 2 · MATCH YOUR COLUMNS</p><h2>${escape(importName)} · ${sheet.rows.length} records</h2><p class="field-help">Suggested matches are starting points. Confirm each column below. Unmapped optional fields stay blank; missing status defaults to Draft.</p><div class="mapping-grid">${Object.entries(FIELD_LABELS).map(([key, label]) => `<label>${label}${REQUIRED_FIELDS.includes(key) ? ' *' : ' · optional'}<select data-map="${key}" aria-label="Map ${label}"><option value="">${REQUIRED_FIELDS.includes(key) ? 'Choose a source column' : key === 'status' ? 'Use default status' : key === 'do_not_contact' ? 'No opt-out column — review below' : 'Leave blank'}</option>${sheet.headers.map((h, i) => `<option value="${i}" ${columnMapping[key] === String(i) ? 'selected' : ''}>${escape(h)} · e.g. ${escape((sheet.rows[0][i] || '').slice(0, 55))}</option>`).join('')}</select></label>`).join('')}</div><div id="mapping-options">${mappingOptionsHTML()}</div><p class="field-help">Amounts accept plain USD numbers or $1,250.00. Opt-out values accept true/false, yes/no, or 1/0. Blank opt-out values in a mapped column are rejected. There is no contact sending.</p><div id="mapping-error" class="form-error" role="alert"></div><button class="button primary" data-action="preview-mapped">Preview mapped estimates</button><button class="text-button" data-action="cancel-import">Cancel import</button></section>`;
}
function mappingOptionsHTML() {
  const statuses = statusesFor(sheet, columnMapping);
  return `<div class="mapping-grid"><label>Date format<select id="import-date-format"><option value="iso">YYYY-MM-DD (ISO)</option><option value="mdy">MM/DD/YYYY (US)</option><option value="dmy">DD/MM/YYYY</option></select></label>${columnMapping.status === '' ? `<label>Status for every imported row<select id="default-status">${STATUSES.map(s => `<option value="${s}">${s}</option>`).join('')}</select></label>` : ''}</div>${statuses.length ? `<h3>Confirm status meanings</h3><div class="mapping-grid">${statuses.map((status, i) => `<label>${escape(status || '(blank status)')}<select data-status-map="${i}" aria-label="Map status ${escape(status || '(blank)')}"><option value="">Keep unchanged (invalid values will be rejected)</option>${STATUSES.map(s => `<option value="${s}" ${status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>`).join('')}</div><p class="field-help">Draft = not yet shared; Sent = awaiting a decision; Won = accepted; Lost = declined. Choose meanings based on your source data.</p>` : ''}${columnMapping.do_not_contact === '' ? '<label class="import-consent"><input id="optout-reviewed" type="checkbox"> This file has no opt-out column. I reviewed the source for opt-outs and understand missing values will be treated as false. Existing shared-email blocks remain active.</label>' : ''}`;
}
function beginImport(text, name) {
  sheet = null; columnMapping = null; importRows = null;
  $('#mapping-panel').innerHTML = ''; $('#import-preview').innerHTML = ''; $('#import-error').textContent = '';
  try { sheet = inspectSpreadsheet(text); columnMapping = { ...sheet.mapping }; importName = name; $('#mapping-panel').innerHTML = mappingHTML(); }
  catch (err) { $('#import-error').textContent = err.message; }
}
function showEditor(q = null) {
  const nextId = 'QT-' + (Math.max(1000, ...quotes.map(q => Number(q.estimate_id.match(/^QT-(\d+)$/)?.[1]) || 0)) + 1);
  const v = q || { estimate_id: nextId, customer_name: '', customer_email: '', job_description: '', amount_usd: '', estimate_date: todayISO(), status: 'sent', next_follow_up_date: addDays(todayISO(), 3), do_not_contact: false, notes: '' };
  $('#editor').innerHTML = `<form id="estimate-form"><div class="dialog-header"><div><p class="eyebrow">${q ? escape(q.estimate_id) : 'KEEP THE NEXT JOB MOVING'}</p><h2 id="editor-title">${q ? 'Edit estimate' : 'Add an estimate'}</h2></div><button type="button" class="close" data-action="close" aria-label="Close">×</button></div><div class="dialog-body"><p class="form-intro">Use fictional customer details while trying the demo.</p><div class="form-grid">
    <label>Customer name<input name="customer_name" required maxlength="150" value="${escape(v.customer_name)}" placeholder="e.g. Alex Monroe"></label>
    <label>Email <span class="optional">optional</span><input name="customer_email" type="email" maxlength="254" value="${escape(v.customer_email)}" placeholder="alex@example.com"></label>
    <label class="full">Job description<input name="job_description" required maxlength="500" value="${escape(v.job_description)}" placeholder="e.g. Living room repaint"></label>
    <label>Amount (USD)<input name="amount_usd" type="number" min="0" max="999999999.99" step="0.01" required value="${v.amount_usd}"></label>
    <label>Estimate date<input name="estimate_date" type="date" required value="${v.estimate_date}"></label>
    <label>Status<select name="status">${STATUSES.map(s => `<option value="${s}" ${v.status === s ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}</select></label>
    <label>Next follow-up <span class="optional">optional</span><input name="next_follow_up_date" type="date" value="${v.next_follow_up_date}"></label>
    <label class="checkbox full"><input name="do_not_contact" type="checkbox" ${v.do_not_contact ? 'checked' : ''}> Do not contact this customer</label><p class="field-help full" id="followup-help">Follow-ups are available only for sent estimates without an opt-out.</p>
    <label class="full">Notes <span class="optional">optional</span><textarea name="notes" rows="3" maxlength="10000" placeholder="Project details, preferences, or context…">${escape(v.notes)}</textarea></label>
    </div><div id="estimate-error" class="form-error" role="alert"></div></div><div class="dialog-footer"><button type="button" class="button" data-action="close">Cancel</button><button class="button primary" type="submit">${q ? 'Save changes' : 'Add estimate'}</button></div></form>`;
  const form = $('#estimate-form');
  const sync = () => { const candidate = { ...v, customer_email: form.elements.customer_email.value, status: form.elements.status.value, do_not_contact: form.elements.do_not_contact.checked }; const allowed = isEligible(candidate, [...quotes.filter(x => x.estimate_id !== v.estimate_id), candidate]); form.elements.next_follow_up_date.disabled = !allowed; $('#followup-help').textContent = allowed ? 'Set a date to bring this estimate into your follow-up queue.' : 'Follow-up date will be cleared. Draft, closed, and shared-email opted-out estimates stay out of the queue.'; };
  form.elements.status.addEventListener('change', sync); form.elements.do_not_contact.addEventListener('change', sync); form.elements.customer_email.addEventListener('input', sync); sync();
  form.addEventListener('submit', e => {
    e.preventDefault(); const f = new FormData(form);
    let item = { ...(q || { estimate_id: nextId, last_contact_date: '', history: [], saved_draft: '' }), ...Object.fromEntries(['customer_name', 'customer_email', 'job_description', 'estimate_date', 'status', 'next_follow_up_date', 'notes'].map(k => [k, String(f.get(k) || '').trim()])), amount_usd: Number(f.get('amount_usd')), do_not_contact: f.has('do_not_contact') };
    item = normalize(item); const errors = validateEstimate(item);
    if (errors.length) { $('#estimate-error').textContent = errors.join('. '); return; }
    const changes = q ? [q.status !== item.status ? `Status changed to ${item.status}` : '', q.do_not_contact !== item.do_not_contact ? (item.do_not_contact ? 'Customer opted out; follow-ups stopped' : 'Opt-out removed') : '', 'Estimate updated'].filter(Boolean).join('. ') : 'Estimate added';
    item = activity(item, changes);
    const save = async () => { if (await (q ? update(item, {kind:'edit',estimateId:q.estimate_id,fields:item,reviewedOptOut:!!(q.do_not_contact && (!item.do_not_contact || q.customer_email !== item.customer_email))}) : persist([...quotes, item], {kind:'create',fields:item}))) { $('#editor').close(); render(); if ($('#detail').open) showDetail(item.estimate_id); toast(q ? 'Estimate updated.' : 'Estimate added.'); } };
    if (q?.do_not_contact && (!item.do_not_contact || q.customer_email.trim().toLowerCase() !== item.customer_email.trim().toLowerCase())) {
      confirmAction('Change an opt-out?', 'Removing an opt-out or changing its email can release the shared-email block on other estimates. Continue only after reviewing the customer’s preference. Cleared follow-up dates will not be restored automatically.', 'Save reviewed change', save);
    } else save();
  });
  $('#editor').showModal();
}
function showDetail(id) {
  const q = quotes.find(q => q.estimate_id === id); if (!q) return; selectedId = id;
  const canContact = eligible(q);
  const sources = optOutSources(q, quotes);
  $('#detail').innerHTML = `<div class="dialog-header"><div><p class="eyebrow">${escape(q.estimate_id)} · ${dateLabel(q.estimate_date)}</p><h2 id="detail-title">${escape(q.customer_name)}</h2></div><button class="close" data-action="close" aria-label="Close">×</button></div><div class="dialog-body"><div class="detail-summary"><div><p>${escape(q.job_description)}</p><span class="muted">${escape(q.customer_email || 'No email address on file')}</span></div><strong>${money(q.amount_usd)}</strong></div><div class="detail-status">${badge(q)}${timing(q)}<button class="text-button" data-action="edit" data-id="${escape(q.estimate_id)}">Edit estimate</button></div>
    ${q.notes ? `<div class="quote-notes"><strong>Project notes</strong><p>${escape(q.notes)}</p></div>` : ''}
    <section class="detail-section"><h3>Record an outcome</h3>${accountMode ? `<label>Reported outcome date<input type="date" id="outcome-date" min="${q.estimate_date}" max="${todayISO()}" value="${todayISO()}"></label><p class="field-help">Owner-reported date. Correct closed outcomes explicitly; no sending or payment is verified.</p>` : ''}<div class="outcome-buttons">${accountMode && ['won','lost'].includes(q.status) ? '<button class="button" data-action="correct-outcome">Correct outcome date</button>' : ''}${q.status !== 'won' ? '<button class="button" data-action="won">✓ Mark won</button>' : ''}${q.status !== 'lost' ? '<button class="button" data-action="lost">Mark lost</button>' : ''}${!q.do_not_contact ? '<button class="text-button danger-text" data-action="optout">Do not contact</button>' : '<span class="muted">Opted out · edit estimate to change</span>'}</div></section>
    ${canContact ? `<section class="detail-section"><div class="section-title"><h3>Follow-up draft</h3><span class="mini-label">TEMPLATE · REVIEW FIRST</span></div>${!q.customer_email ? '<p class="notice compact">No email on file. Add an address in Edit estimate or use this as a phone conversation guide.</p>' : ''}<label for="draft" class="sr-only">Editable follow-up message</label><textarea id="draft" rows="9" maxlength="10000">${escape(q.saved_draft || draftMessage(q))}</textarea><div class="draft-actions"><button class="button" data-action="copy-draft">Copy draft</button><button class="button" data-action="save-draft">Save draft</button><button class="text-button" data-action="regenerate">Reset template</button></div><p class="field-help">Nothing is sent. Copying or saving does not record a contact.</p></section>
    <section class="detail-section"><h3>Log a contact</h3><p class="field-help">Record a conversation that already happened outside QuoteTend.</p><form id="contact-form"><div class="form-grid"><label>Contact date<input type="date" name="date" required min="${q.estimate_date}" max="${todayISO()}" value="${todayISO()}"></label><label>Method<select name="channel"><option>Email</option><option>Phone</option><option>Text</option><option>Other</option></select></label><label class="full">Next follow-up<input name="nextDate" type="date" required value="${addDays(todayISO(), 3)}"></label><label class="full">Contact note <span class="optional">optional</span><input name="note" maxlength="2000" placeholder="What did you discuss?"></label></div><div id="contact-error" class="form-error" role="alert"></div><button class="button primary" type="submit">Record contact & next step</button></form></section>` : `<div class="notice">${sources.length ? 'An opt-out blocks follow-ups and drafts for this estimate.' : q.status === 'draft' ? 'This estimate is a draft. Change its status to Sent after sharing it outside QuoteTend.' : 'This estimate is closed. It is excluded from all follow-up queues.'}</div>`}
    ${accountMode && account.identities?.find(i=>i.estimateId===q.estimate_id)?.origin!=='created' ? '<div class="notice">Earlier activity is imported, restored or legacy history and is not verified measurement evidence.</div>' : ''}<section class="detail-section"><h3>Activity history</h3>${q.last_contact_date ? `<p class="field-help">Last contact: ${dateLabel(q.last_contact_date)}</p>` : ''}<div class="history">${[...q.history].reverse().map(h => `<div><span class="activity-dot"></span><p>${escape(h.text)}<small>${dateLabel((h.date || h.at).slice(0, 10))}</small></p></div>`).join('') || '<p class="muted">No activity recorded yet.</p>'}</div></section></div>`;
  if (sources.length) {
    const notice = document.createElement('div'); notice.className = 'notice';
    notice.innerHTML = `Follow-ups and drafts are paused${q.customer_email ? ' for every estimate with this email' : ' for this estimate'}. Opt-out recorded on: ${sources.map(source => `<button class="text-button" data-action="detail" data-id="${escape(source.estimate_id)}">${escape(source.estimate_id)}</button>`).join(', ')}. Review the source estimate to correct an opt-out. Names and blank emails are never grouped.`;
    $('#detail .detail-summary').after(notice);
  }
  $('#contact-form')?.addEventListener('submit', async e => { e.preventDefault(); try { const current = quotes.find(item => item.estimate_id === id); const changed = recordContact(current, Object.fromEntries(new FormData(e.target)), todayISO(), quotes); if (await update(changed, {kind:'contact',estimateId:id,contact:Object.fromEntries(new FormData(e.target))})) { render(); showDetail(id); toast('Contact recorded. Next follow-up scheduled.'); } } catch (err) { $('#contact-error').textContent = err.message; } });
  if(accountMode)loadContactCorrections(id);
  if (!$('#detail').open) $('#detail').showModal();
}
function confirmAction(title, description, label, fn) {
  $('#confirm-dialog').innerHTML = `<div class="dialog-header"><h2 id="confirm-title">${title}</h2><button class="close" data-action="close" aria-label="Close">×</button></div><div class="dialog-body"><p>${description}</p></div><div class="dialog-footer"><button class="button" data-action="close">Cancel</button><button class="button primary" id="confirm-action">${label}</button></div>`;
  $('#confirm-action').onclick = () => { $('#confirm-dialog').close(); fn(); }; $('#confirm-dialog').showModal();
}
function download(name, text, type) {
  const dialog = $('#export-dialog');
  const url = URL.createObjectURL(new Blob([text], { type }));
  dialog.innerHTML = `<div class="dialog-header"><div><p class="eyebrow">YOUR DATA, READY TO KEEP</p><h2 id="export-title">${name.endsWith('.json') ? 'Full backup' : 'CSV export'}</h2></div><button class="close" data-action="close" aria-label="Close">×</button></div><div class="dialog-body"><p>Download the file below. If this browser does not support downloads, copy the contents into a text file named <strong>${escape(name)}</strong>.</p><label for="export-text" class="field-help">Export contents</label><textarea id="export-text" readonly rows="12" spellcheck="false">${escape(text)}</textarea><p class="field-help" id="export-status" role="status">Full backups preserve history and drafts. CSV files contain estimate fields only.</p></div><div class="dialog-footer"><button class="button" id="copy-export">Copy contents</button><a class="button primary" id="download-export" download="${escape(name)}">Download file</a></div>`;
  $('#download-export').href = url;
  $('#copy-export').onclick = async () => { try { await navigator.clipboard.writeText(text); $('#export-status').textContent = 'Contents copied. Paste into a text file and save with the filename above.'; } catch { $('#export-text').focus(); $('#export-text').select(); $('#export-status').textContent = 'Contents selected. Press Ctrl+C to copy, then paste into a text file.'; } };
  dialog.addEventListener('close', () => URL.revokeObjectURL(url), { once: true });
  dialog.showModal();
}
document.addEventListener('click', async e => {
  const nav = e.target.closest('[data-view]'); if (nav) { view = nav.dataset.view; render(); return; }
  const b = e.target.closest('[data-action]'); if (!b) return;
  const q = quotes.find(x => x.estimate_id === selectedId);
  switch (b.dataset.action) {
    case 'results-detail': if(resultsData) $('#results-detail').innerHTML=supportingRows(resultsData,b.dataset.group); break;
    case 'correct-outcome': if(q && await update(q,{kind:'outcome',estimateId:q.estimate_id,status:q.status,effectiveDate:$('#outcome-date').value})) {render();showDetail(q.estimate_id);toast('Outcome date corrected.');} break;
    case 'snapshots': {
      try {const rows=await accountRequest('/workspaces/'+account.businessId+'/snapshots'); $('#snapshot-list').innerHTML=rows.length?rows.map(r=>'<button class="button" data-action="snapshot-download" data-id="'+escape(r.id)+'">Download safety copy '+escape(r.recordedAt)+'</button>').join(''):'No account restores have been performed.';}catch(e){toast(e.message);} break;
    }
    case 'snapshot-download': try {const data=await accountRequest('/workspaces/'+account.businessId+'/snapshots/'+encodeURIComponent(b.dataset.id));download('quotetend-safety-copy.json',JSON.stringify(data,null,2),'application/json');}catch(e){toast(e.message);} break;
    case 'release-retained': confirmAction('Review retained opt-out?', 'Release this retained preference only after confirming the customer’s preference. Individual estimate opt-outs remain until explicitly edited.', 'Release reviewed preference', async()=>{if(await persist(quotes,{kind:'release-optout',preference:b.dataset.preference,reviewedOptOut:true})){render();toast('Retained preference released. Review individual source estimates.');}}); break;
    case 'view': view = b.dataset.target; render(); break;
    case 'add': showEditor(); break;
    case 'close': b.closest('dialog').close(); break;
    case 'detail': showDetail(b.dataset.id); break;
    case 'edit': showEditor(quotes.find(x => x.estimate_id === b.dataset.id)); break;
    case 'status-filter': filter = b.dataset.status; search = ''; view = 'estimates'; render(); break;
    case 'unscheduled': queueFilter = 'unscheduled'; view = 'followups'; render(); break;
    case 'queue-filter': queueFilter = b.dataset.filter; render(); break;
    case 'inspect-paste': pastedCSV = $('#paste-csv').value; beginImport(pastedCSV, 'Pasted spreadsheet'); break;
    case 'cancel-import': sheet = null; columnMapping = null; importRows = null; render(); break;
    case 'preview-mapped': {
      importRows = null; $('#import-preview').innerHTML = ''; $('#mapping-error').textContent = '';
      try {
        const statusMap = Object.fromEntries(statusesFor(sheet, columnMapping).map((value, index) => [value, $(`[data-status-map="${index}"]`).value || value]));
        importRows = previewSpreadsheet(sheet, columnMapping, { statusMap, dateFormat: $('#import-date-format').value, defaultStatus: $('#default-status')?.value || 'draft', optOutReviewed: $('#optout-reviewed')?.checked || false }, quotes);
        $('#import-preview').innerHTML = importPreviewHTML();
      } catch (err) { $('#mapping-error').textContent = err.message; }
      break;
    }
    case 'import-report': if (importRows) download('quotetend-import-review.txt', (importOptOutBlockers(importRows, quotes).length ? 'IMPORT BLOCKED: an opt-out on a rejected or conflicting row would be discarded. No data changed. Repair the source or record the confirmed opt-out on an existing estimate, then preview again.\n' + importOptOutBlockers(importRows, quotes).map(b => `Record ${b.row}: ${b.email} (matching IDs: ${b.affectedIds.join(', ') || 'none'})`).join('\n') + '\n\n' : '') + importRows.map(r => `Record ${r.row} | ${r.quote.estimate_id} | ${r.outcome}\n${[...r.errors, ...r.warnings].join('\n') || 'Ready to add'}`).join('\n\n'), 'text/plain'); break;
    case 'won': case 'lost': case 'optout': {
      const status = b.dataset.action;
      confirmAction(status === 'optout' ? 'Stop follow-ups?' : `Mark this estimate ${status}?`, status === 'optout' ? 'This estimate and all estimates sharing its email will be removed from follow-up queues. Their follow-up dates will be cleared. Blank emails are not grouped.' : `This records the estimate as ${status} and clears its follow-up date. You can change the status in Edit estimate.`, status === 'optout' ? 'Do not contact' : `Mark ${status}`, async () => {
        const changed = activity(status === 'optout' ? { ...q, do_not_contact: true } : { ...q, status }, status === 'optout' ? 'Customer opted out; follow-ups stopped' : `Estimate marked ${status}`);
        if (await update(changed, status === 'optout' ? {kind:'edit',estimateId:q.estimate_id,fields:{do_not_contact:true}} : {kind:'outcome',estimateId:q.estimate_id,status,effectiveDate:$('#outcome-date')?.value||todayISO()})) { render(); showDetail(q.estimate_id); toast('Outcome recorded.'); }
      }); break;
    }
    case 'save-draft': if (await update({ ...q, saved_draft: $('#draft').value }, {kind:'draft',estimateId:q.estimate_id,text:$('#draft').value})) toast(accountMode ? 'Draft saved to your business account.' : 'Draft saved in this browser.'); break;
    case 'copy-draft': try { await navigator.clipboard.writeText($('#draft').value); toast('Draft copied. Nothing was sent.'); } catch { $('#draft').focus(); $('#draft').select(); toast('Copy is unavailable here. The draft is selected; press Ctrl+C.'); } break;
    case 'regenerate': confirmAction('Reset this draft?', 'Replace the current message with the original template? Save it afterward if you want to keep it.', 'Reset template', () => { $('#draft').value = draftMessage(q); }); break;
    case 'export': download(`quotetend-estimates-${todayISO()}.csv`, exportCSV(quotes), 'text/csv;charset=utf-8'); break;
    case 'template': download('quotetend-example.csv', exportCSV([{ ...demoData()[0], estimate_id: 'EXAMPLE-001', customer_name: 'Alex Demo', customer_email: 'alex@example.com' }]), 'text/csv;charset=utf-8'); break;
    case 'backup': download(`quotetend-backup-${todayISO()}.json`, JSON.stringify({ version: 1, exported_at: new Date().toISOString(), quotes }, null, 2), 'application/json'); break;
    case 'commit-import': {
      if (!importRows) break;
      let valid;
      try { valid = importCandidates(importRows, quotes).map(q => activity(q, 'Estimate imported from CSV', 'import')); }
      catch (err) { toast(err.message); $('#import-preview').innerHTML = importPreviewHTML(); break; }
      if (await persist([...quotes, ...valid], {kind:'import',quotes:valid})) { importRows = null; sheet = null; columnMapping = null; pastedCSV = ''; render(); toast(`${valid.length} estimates imported. Shared-email opt-outs applied.`); } break;
    }
    case 'reset': if (accountMode) break; confirmAction('Reset demo data?', 'This replaces all estimates, history, and drafts in this browser. Download a full backup first if you want to keep your work.', 'Reset demo', () => {
      const next = demoData(); try { localStorage.setItem(KEY, JSON.stringify({ version: 1, quotes: next })); quotes = next; storageError = ''; importRows = null; render(); toast('Fresh fictional demo data is ready.'); } catch { toast('Browser storage is unavailable. Enable it to use the demo.'); }
    }); break;
  }
});
document.addEventListener('input', e => { if (e.target.id === 'search') { search = e.target.value; $('#table-content').innerHTML = filteredTable(); } });
document.addEventListener('change', async e => {
  if (e.target.matches('[data-map], [data-status-map], #default-status, #import-date-format, #optout-reviewed')) {
    importRows = null; $('#import-preview').innerHTML = '';
    if (e.target.dataset.map) { columnMapping[e.target.dataset.map] = e.target.value; $('#mapping-options').innerHTML = mappingOptionsHTML(); }
  }
  if (e.target.id === 'status-filter') { filter = e.target.value; $('#table-content').innerHTML = filteredTable(); }
  if (e.target.id === 'csv-file') {
    const file = e.target.files[0]; if (!file) return; importRows = null; sheet = null; $('#mapping-panel').innerHTML = ''; $('#import-preview').innerHTML = ''; $('#import-error').textContent = '';
    try { if (file.size > 2_000_000) throw new Error('Use a CSV smaller than 2 MB.'); beginImport(await file.text(), file.name); }
    catch (err) { $('#import-error').textContent = err.message; } finally { e.target.value = ''; }
  }
  if (e.target.id === 'restore-file') {
    const file = e.target.files[0]; if (!file) return;
    try {
      if (file.size > 5_000_000) throw new Error('Backup must be smaller than 5 MB.');
      const restored = parseBackup(await file.text());
      confirmAction('Restore this backup?', `Replace the ${quotes.length} estimates in ${accountMode ? escape(account?.businessName || 'unavailable account') + ' (this account)' : 'this browser demo'} with ${restored.length} estimates from the backup? Current history and drafts will be replaced too. ${accountMode ? 'A recovery snapshot will be saved. Existing opt-outs are retained, and reporting starts a new period; imported history is not verified evidence.' : ''}`, 'Restore backup', async () => { if (await persist(restored, {kind:'restore',quotes:restored,confirmReplacement:true})) { importRows = null; render(); toast('Backup restored.'); } });
    } catch (err) { toast(`Could not restore: ${err.message}`); } finally { e.target.value = ''; }
  }
});
// Keep independently opened tabs from overwriting each other's stale state.
window.addEventListener('storage', e => { if (!accountMode && e.key === KEY) location.reload(); });
document.querySelector('.brand').addEventListener('click', e => { e.preventDefault(); view = 'overview'; render(); });
new MutationObserver(() => document.querySelectorAll('[data-width]').forEach(el => { el.style.flexGrow = el.dataset.width; el.removeAttribute('data-width'); })).observe($('#main'), { childList: true, subtree: true });

if (accountMode) {
  document.querySelector('.workspace strong').textContent = account?.businessName || 'Account unavailable';
  document.querySelector('.breadcrumb').textContent = account?.businessName || 'Account unavailable';
  document.querySelector('.workspace small').textContent = account?.configuration?.production ? 'Private business workspace' : 'Private local business workspace';
  document.querySelector('.workspace-avatar').textContent = account ? initials(account.businessName) : '?';
  document.querySelector('.sidebar-footer').innerHTML = '<div><strong>Local owner account</strong><small id="owner-email"></small></div>';
  const securityLink=document.createElement('a');securityLink.href='/security';securityLink.textContent='Account security & recovery';document.querySelector('.sidebar-footer').append(securityLink);
  $('#owner-email').textContent = account?.email || '';
  document.querySelector('.demo-pill').textContent = account?.configuration?.production ? 'Private business account' : 'Private account · fictional data only';
  $('#results-nav').hidden = false; $('#account-link').hidden = true; $('#signout').hidden = false;
  document.querySelector('.main-footer > span:last-child').textContent = account?.configuration?.production ? 'Stored in your business account · no messages are sent' : 'Stored on this computer · no messages are sent';
  const topSecurity=document.createElement('a');topSecurity.href='/security';topSecurity.textContent='Account security';topSecurity.className='text-button';$('#signout').before(topSecurity);
  $('#signout').onclick = async () => {
    if (saving) { toast('Wait for the save to finish before signing out.'); return; }
    try { await accountRequest('/logout', 'POST', {}); announceSessionChange(); location.replace('/signin'); }
    catch (error) { toast('Could not sign out. ' + error.message); }
  };
  const sessionChannel = new BroadcastChannel('quotetend-account-session');
  sessionChannel.onmessage = () => location.replace('/signin');
  const checkSession = async () => {
    try {
      const me = await accountRequest('/me');
      if (account && me.businessId !== account.businessId) location.replace('/signin');
    } catch (error) { if (error.status === 401) location.replace('/signin'); }
  };
  window.addEventListener('focus', checkSession);
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  setInterval(checkSession, 30000);
}

let resultsData=null, resultsFrom=todayISO().slice(0,7)+'-01', resultsTo=todayISO(), resultRequest=0;
function recoveryPanel() {
 return '<section class="panel results-explanation"><h2>Restore safety copies</h2><p>Each account restore saves the previous workspace here. Download a copy and use Restore a full backup to recover it. Recovery starts a new reporting period and retains opt-outs.</p><button class="button" data-action="snapshots">Show recovery snapshots</button><div id="snapshot-list"></div><h3>Retained opt-outs</h3><p>Preferences retained across restores apply even if their source estimate is missing. Releasing one does not clear individual estimate opt-out flags.</p>'+((account?.retainedOptOuts||[]).map(p=>'<p>'+escape(p)+' <button class="text-button" data-action="release-retained" data-preference="'+escape(p)+'">Review retained preference</button></p>').join('')||'<p>No detached preferences retained.</p>')+'</section>';
}
function resultsPage() {
  queueMicrotask(loadResults);
  return heading('FOLLOW-UP RESULTS','See what happened after follow-up.','Owner-reported activity and recorded outcomes; no claim of caused or collected revenue.')+
    '<form id="results-filter" class="panel results-filter"><label>First contact / contact dates from<input type="date" name="from" required value="'+resultsFrom+'"></label><label>Through<input type="date" name="to" required max="'+todayISO()+'" value="'+resultsTo+'"></label><button class="button primary">Apply dates</button></form><div id="results-content" aria-live="polite">Loading recorded results…</div>';
}
async function loadResults() {
  if(view!=='results' || !accountMode)return;
  const request=++resultRequest;
  try {const result=await accountRequest('/workspaces/'+account.businessId+'/results?from='+encodeURIComponent(resultsFrom)+'&to='+encodeURIComponent(resultsTo));
    if(view==='results'&&request===resultRequest){resultsData=result;$('#results-content').innerHTML=resultsMarkup(result);}
  }catch(error){if(view==='results'&&request===resultRequest)$('#results-content').textContent=error.message;}
}
document.addEventListener('submit',e=>{if(e.target.id==='results-filter'){e.preventDefault();resultsFrom=e.target.elements.from.value;resultsTo=e.target.elements.to.value;loadResults();}});
render();


async function loadContactCorrections(id) {
 const section=document.createElement('section');section.className='detail-section';section.innerHTML='<h3>Correct a contact record</h3><p>Loading recorded contacts…</p>';
 $('#detail .dialog-body').append(section);
 try {
  const events=await accountRequest('/workspaces/'+account.businessId+'/events');
  const {contactEvidence}=await import('./results.js');
  const contacts=contactEvidence(events.filter(e=>e.epoch===account.measurement.epoch && e.estimateId===id));
  if(!section.isConnected)return;
  if(!contacts.length){section.innerHTML='<p class="field-help">No current-period server contact records to correct. Imported display history is not reporting evidence.</p>';return;}
  section.innerHTML='<h3>Correct a contact record</h3><p>Corrections retain the original evidence and recalculate results. Voided records are excluded. The next follow-up date stays unchanged; review it separately. Earlier unverified history stays unverified.</p><form id="correction-form"><label>Recorded contact<select name="eventId">'+contacts.map(e=>'<option value="'+escape(e.id)+'">'+escape(e.effectiveDate+' · '+e.data.channel+' · '+e.id.slice(0,8)+(e.voided?' · VOIDED':''))+'</option>').join('')+'</select></label><label>Correct contact date<input name="date" type="date" required></label><label>Correct method<select name="channel"><option>Email</option><option>Phone</option><option>Text</option><option>Other</option></select></label><label>Record treatment<select name="treatment"><option value="active">Keep as a corrected contact</option><option value="void">Void: contact did not happen / duplicate</option></select></label><label>Reason<input name="reason" required maxlength="1000"></label><p class="form-error" role="alert"></p><button class="button" type="submit">Save contact correction</button></form>';
  const form=section.querySelector('form');
  const sync=()=>{const c=contacts.find(e=>e.id===form.elements.eventId.value);form.elements.date.value=c.effectiveDate;form.elements.channel.value=c.data.channel;form.elements.treatment.value=c.voided?'void':'active';};
  form.elements.eventId.onchange=sync;sync();
  form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button');button.disabled=true;
   const f=Object.fromEntries(new FormData(form));
   try{if(await persist(quotes,{kind:'correct-contact',estimateId:id,eventId:f.eventId,correction:{date:f.date,channel:f.channel,voided:f.treatment==='void',reason:f.reason}})){render();showDetail(id);toast('Contact correction saved. Results recalculated.');}}
   catch(err){form.querySelector('[role=alert]').textContent=err.message;}finally{button.disabled=false;}
  };
 }catch(e){section.textContent='Contact records could not be loaded. '+e.message;}
}
