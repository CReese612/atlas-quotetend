// Disposable headless browser contexts; never attach to the user's browser/profile.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { startServer } from '../server.mjs';
import { demoData, todayISO, exportCSV } from '../domain.js';

const dir = await mkdtemp(join(tmpdir(), 'quotetend-browser-test-'));
const running = await startServer({ port: 0, dbPath: join(dir, 'accounts.sqlite') });
const browser = await chromium.launch({ channel: process.env.QUOTETEND_BROWSER || 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const base = `http://127.0.0.1:${running.port}`, errors = [];
page.on('pageerror', e => errors.push(e.message));
page.setDefaultTimeout(8000);
const password = 'Fictional-ui-password-982!';
const api = (path, method = 'GET', body) => page.evaluate(async ({ path, method, body }) => {
  const r = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json', 'X-QuoteTend-Request': '1' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: r.status, data: await r.json() };
}, { path, method, body });
const state = async () => { const me = await api('/me'); return (await api('/workspaces/' + me.data.businessId)).data; };
async function register(email, name) {
  await page.goto(base + '/signin'); await page.locator('#auth-toggle').click();
  await page.locator('[name=businessName]').fill(name); await page.locator('#auth-form [name=email]').fill(email); await page.locator('#auth-form [name=password]').fill(password);
  await page.locator('#auth-submit').click(); await page.waitForURL('**/account'); await page.locator('[data-action=add]').waitFor();
}
async function addCustomer(name) {
  await page.locator('[data-action=add]').click();
  await page.locator('#editor [name=customer_name]').fill(name);
  await page.locator('#editor [name=customer_email]').fill('fictional-client@example.com');
  await page.locator('#editor [name=job_description]').fill('Fictional hallway repaint');
  await page.locator('#editor [name=amount_usd]').fill('1250');
  await page.locator('#editor [name=status]').selectOption('sent');
  await page.locator('#editor [name=next_follow_up_date]').fill(todayISO());
  await page.locator('#editor button[type=submit]').click();
  await page.locator('#editor').waitFor({ state: 'hidden' });
}
async function pastePreview(csv) {
  await page.locator('[data-view=data]').click();
  await page.getByText('Or paste CSV text', { exact: true }).click();
  await page.locator('#paste-csv').fill(csv);
  await page.locator('[data-action=inspect-paste]').click();
  await page.locator('[data-action=preview-mapped]').click();
}
try {
  await page.goto(base + '/');
  await page.locator('[data-action=add]').waitFor();
  const demoBefore = await page.evaluate(() => localStorage.getItem('quotetend.demo.v1'));
  assert.equal(JSON.parse(demoBefore).quotes.length, 12);
  await register('ui-a@example.com', 'Fictional Cedar Painting');
  assert.equal((await state()).quotes.length, 0);
  assert.equal(await page.evaluate(() => localStorage.getItem('quotetend.demo.v1')), demoBefore);
  await addCustomer('Jordan Account Demo');
  await page.locator('[data-action=detail]').first().click();
  assert.match(await page.locator('#draft').inputValue(), /Fictional Cedar Painting/);
  await page.locator('#draft').fill('Fictional saved draft — nothing sent.'); await page.locator('[data-action=save-draft]').click();
  await page.waitForFunction(() => document.querySelector('#toast').textContent === 'Draft saved to your business account.');
  await page.locator('#contact-form [name=channel]').selectOption('Phone');
  await page.locator('#contact-form [name=note]').fill('DEMO ONLY simulated call');
  await page.locator('#contact-form button[type=submit]').click();
  await page.waitForFunction(() => document.querySelector('#toast').textContent.startsWith('Contact recorded.'));
  await page.locator('[data-action=won]').click(); await page.locator('#confirm-action').click();
  await page.waitForFunction(() => document.querySelector('#toast').textContent === 'Outcome recorded.');
  await page.locator('#detail [data-action=close]').click();
  let current = await state(); assert.equal(current.quotes[0].status, 'won'); assert.equal(current.quotes[0].saved_draft, 'Fictional saved draft — nothing sent.');
  assert.ok(current.quotes[0].history.some(h=>h.text.includes('simulated call')));
  console.log('PASS account registration, estimate, draft, simulated contact and won outcome');
  await page.locator('[data-view=results]').click();
  await page.locator('.result-card').first().waitFor();
  assert.match(await page.locator('#results-content').innerText(), /1 won/);
  assert.match(await page.locator('#results-content').innerText(), /1,250.00/);
  await page.locator('[data-group=won]').first().click();
  assert.match(await page.locator('#results-detail').innerText(), /Jordan Account Demo/);
  await page.locator('#results-detail [data-action=detail]').click(); await page.locator('#detail [data-action=close]').click();
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator('h1').click(); await page.evaluate(()=>window.scrollTo(0,0));
  await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/followup-results-mobile.png',fullPage:true});
  console.log('PASS desktop and mobile results, definitions, evidence and estimate drill-down');
  await page.goto(base+'/account');await page.locator('[data-action=detail]').first().click();await page.locator('#correction-form').waitFor();
  await page.locator('#correction-form [name=treatment]').selectOption('void');await page.locator('#correction-form [name=reason]').fill('FICTIONAL duplicate');
  await page.locator('#correction-form button').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent.startsWith('Contact correction saved.'));
  assert.equal((await api('/workspaces/'+current.businessId+'/results?from='+todayISO()+'&to='+todayISO())).data.counts.contacts,0);
  await page.locator('#correction-form').waitFor();await page.locator('#correction-form [name=treatment]').selectOption('active');await page.locator('#correction-form [name=reason]').fill('FICTIONAL correction reviewed');
  await page.locator('#correction-form button').click();
  await page.waitForFunction(()=>document.querySelector('#correction-form [name=treatment]')?.value==='active' && !document.querySelector('#correction-form [name=reason]')?.value);
  assert.equal((await api('/workspaces/'+current.businessId+'/results?from='+todayISO()+'&to='+todayISO())).data.counts.contacts,1);
  assert.equal(await page.locator('#detail').evaluate(e=>e.scrollWidth<=e.clientWidth),true);
  await page.locator('#correction-form button').scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/contact-correction-mobile.png',fullPage:false});await page.locator('#detail [data-action=close]').click();
  console.log('PASS mobile contact void/correction and results recalculation');

  const q = { ...demoData()[0], estimate_id: 'UI-IMPORT', customer_name: 'Imported Example', customer_email: 'shared@example.com', status: 'sent', do_not_contact: false, next_follow_up_date: todayISO() };
  await page.setViewportSize({ width: 390, height: 844 });
  await pastePreview(exportCSV([q, { ...q, estimate_id: 'UI-STOP', customer_name: 'Opted Out Example', do_not_contact: true, status: 'lost' }]));
  const previewSnapshot = await state();
  assert.equal(previewSnapshot.quotes.length, 1);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await mkdir('test-results', { recursive: true }); await page.screenshot({ path: 'test-results/account-import-mobile.png', fullPage: true });
  await page.locator('[data-action=cancel-import]').click(); assert.deepEqual(await state(), previewSnapshot);
  await pastePreview(exportCSV([q, { ...q, estimate_id: 'UI-STOP', customer_name: 'Opted Out Example', do_not_contact: true, status: 'lost' }]));
  await page.locator('[data-action=commit-import]').click();
  await page.waitForFunction(() => document.querySelector('#toast').textContent.startsWith('2 estimates imported.'));
  current = await state(); assert.equal(current.quotes.length, 3); assert.equal(current.quotes.find(q => q.estimate_id === 'UI-IMPORT').next_follow_up_date, '');
  await page.locator('[data-view=estimates]').click(); await page.locator('[data-action=detail][data-id=UI-IMPORT]').first().click();
  assert.equal(await page.locator('#draft').count(), 0); assert.match(await page.locator('#detail').innerText(), /opt-out blocks/);
  await page.locator('#detail [data-action=close]').click();
  console.log('PASS 390px CSV preview/cancel/commit and shared-email opt-out');
  const blockedBefore = await state();
  await pastePreview(exportCSV([{ ...q, estimate_id: 'NEW-GOOD', customer_email: 'risk@example.com' }, { ...q, estimate_id: 'NEW-INVALID', customer_email: 'risk@example.com', amount_usd: -1, do_not_contact: true }]));
  assert.equal(await page.locator('[data-action=commit-import]').isDisabled(), true);
  assert.match(await page.locator('#import-preview').innerText(), /Import blocked/);
  assert.deepEqual(await state(), blockedBefore);
  await page.locator('[data-action=cancel-import]').click(); assert.deepEqual(await state(), blockedBefore);
  console.log('PASS rejected-row opt-out blocks account import without preview/cancel writes');

  await page.locator('[data-view=data]').click(); assert.equal(await page.locator('[data-action=reset]').count(), 0);
  await page.locator('[data-action=backup]').click(); const backup = await page.locator('#export-text').inputValue();
  assert.deepEqual(JSON.parse(backup).quotes, current.quotes); await page.locator('#export-dialog [data-action=close]').click();
  const beforeRestore = await state();
  await page.locator('#restore-file').setInputFiles({ name: 'fictional-backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
  await page.locator('#confirm-dialog').waitFor({state:'visible'});
  assert.match(await page.locator('#confirm-dialog').innerText(), /Fictional Cedar Painting/);
  await page.locator('#confirm-dialog .dialog-footer [data-action=close]').click(); assert.deepEqual(await state(), beforeRestore);
  await page.locator('#restore-file').setInputFiles({ name: 'fictional-backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
  await page.locator('#confirm-action').click(); await page.waitForFunction(() => document.querySelector('#toast').textContent === 'Backup restored.');
  const restoredState=await state(); assert.equal(restoredState.quotes.length,current.quotes.length); assert.equal(restoredState.quotes.find(q=>q.estimate_id==='UI-IMPORT').do_not_contact,true);
  await page.reload(); await page.locator('[data-action=add]').waitFor(); assert.deepEqual((await state()).quotes, restoredState.quotes);
  console.log('PASS full account backup, cancellation, explicit restore and reload');
  await page.locator('[data-view=results]').click();await page.locator('.result-card').first().waitFor();
  assert.match(await page.locator('#results-content').innerText(),/Reporting period 2/);
  assert.equal(await page.locator('.result-card').first().locator('strong').innerText(),'0');
  await page.locator('[data-view=data]').click();await page.locator('[data-action=snapshots]').click();
  await page.locator('[data-action=snapshot-download]').first().click();
  const safety=JSON.parse(await page.locator('#export-text').inputValue());assert.deepEqual(safety.quotes,beforeRestore.quotes);
  await page.locator('#export-dialog [data-action=close]').click();
  await page.locator('#restore-file').setInputFiles({name:'safety.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(safety))});
  await page.locator('#confirm-action').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent==='Backup restored.');
  assert.equal((await state()).measurement.epoch,3);
  console.log('PASS safety snapshot download/recovery and honest reporting reset');
  await page.locator('[data-view=overview]').click();

  // A second tab wins a save; the stale editor must remain open with a visible error.
  await page.locator('[data-action=add]').click(); await page.locator('#editor [name=customer_name]').fill('Unsaved stale customer');
  await page.locator('#editor [name=job_description]').fill('Fictional stale test'); await page.locator('#editor [name=amount_usd]').fill('50');
  const beforeStale = await state();
  await api('/workspaces/' + beforeStale.businessId+'/commands', 'POST', { requestId:crypto.randomUUID(),kind:'edit',estimateId:beforeStale.quotes[0].estimate_id,fields:{notes:'Concurrent fictional edit'},revision:beforeStale.revision });
  await page.locator('#editor button[type=submit]').click();
  await page.locator('#save-error').waitFor({ state: 'visible' }); assert.match(await page.locator('#save-error').innerText(), /Another tab/);
  assert.match(await page.locator('#editor .save-failure').innerText(), /Another tab/);
  assert.equal(await page.locator('#editor [name=customer_name]').inputValue(), 'Unsaved stale customer'); assert.equal((await state()).quotes.length, 3);
  await page.locator('#editor .dialog-header [data-action=close]').click(); await page.reload(); await page.locator('#signout').click(); await page.waitForURL('**/signin');
  await register('ui-b@example.com', 'Fictional Maple Painting'); assert.equal((await state()).quotes.length, 0);
  assert.equal((await api('/workspaces/' + beforeStale.businessId)).status, 404);
  assert.equal(await page.evaluate(() => localStorage.getItem('quotetend.demo.v1')), demoBefore);
  assert.equal(await page.locator('.breadcrumb').innerText(), 'Fictional Maple Painting');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: 'test-results/account-empty-mobile.png', fullPage: true });
  console.log('PASS stale save rejection, sign-out and second business isolation');
  // Account security on a narrow screen, including a real local recovery request.
  await page.getByRole('link',{name:'Account security',exact:true}).click();await page.waitForURL('**/security');
  await page.locator('#code-form [name=currentPassword]').fill(password);await page.locator('#code-form button').click();
  await page.locator('#code-result').waitFor({state:'visible'});const code=await page.locator('#recovery-code').inputValue();assert.ok(code.length>=40);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:'test-results/security-mobile.png',fullPage:true});
  await page.locator('#password-form [name=currentPassword]').fill(password);
  await page.locator('#password-form [name=password]').fill('Fictional-changed-password-298!');
  await page.locator('#password-form [name=confirm]').fill('Fictional-changed-password-298!');
  await page.locator('#password-form button').click();await page.waitForURL('**/signin?changed=1');
  await page.locator('#auth-form [name=email]').fill('ui-b@example.com');await page.locator('#auth-form [name=password]').fill('Fictional-changed-password-298!');await page.locator('#auth-submit').click();await page.waitForURL('**/account');
  await page.getByRole('link',{name:'Account security',exact:true}).click();
  await page.locator('#code-form [name=currentPassword]').fill('Fictional-changed-password-298!');await page.locator('#code-form button').click();
  await page.locator('#code-result').waitFor({state:'visible'});const freshCode=await page.locator('#recovery-code').inputValue();
  await api('/logout','POST',{});await page.goto(base+'/signin');
  await page.getByText('Forgot your password?',{exact:true}).click();
  await page.locator('#recover-form [name=email]').fill('ui-b@example.com');
  await page.locator('#recover-form [name=code]').fill(freshCode);
  await page.locator('#recover-form [name=password]').fill(password);
  await page.locator('#recover-form [name=confirm]').fill(password);
  await page.locator('#recover-form button').click();await page.waitForFunction(()=>document.querySelector('#recover-message').textContent.startsWith('Password reset.'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:'test-results/recovery-mobile.png',fullPage:true});
  await page.locator('#auth-form [name=email]').fill('ui-b@example.com');await page.locator('#auth-form [name=password]').fill(password);await page.locator('#auth-submit').click();await page.waitForURL('**/account');
  assert.equal((await state()).quotes.length,0);
  console.log('PASS mobile password change, sign-out, recovery-code reset and unchanged account data');


  await page.goto(base + '/'); await page.locator('[data-action=add]').waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('quotetend.demo.v1')), demoBefore);
  await addCustomer('Browser Demo Rehearsal');
  assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('quotetend.demo.v1'))).quotes.length, 13);
  await page.goto(base + '/account'); await page.locator('[data-action=add]').waitFor(); assert.equal((await state()).quotes.length, 0);
  assert.deepEqual(errors, []);
  console.log('PASS separate demo editing leaves private account empty; no uncaught browser errors');
} finally {
  await browser.close(); await running.close();
  if (dirname(dir) === tmpdir() && basename(dir).startsWith('quotetend-browser-test-')) await rm(dir, { recursive: true, force: true });
}
