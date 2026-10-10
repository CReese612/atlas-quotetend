// Account security: one-time recovery code and password change. Both require the current password.
import { request, announceSessionChange } from '/app/api.js';

const $ = s => document.querySelector(s);
const error = $('#security-error');
try {
  const me = await request('/me');
  $('#security-owner').textContent = `${me.businessName} · signed in as ${me.email}`;
  $('#code-state').textContent = me.recoveryCodeSaved ? 'A recovery code is currently saved for this account. Generating a new one replaces it.' : 'No recovery code is saved for this account yet.';
} catch { location.replace('/signin'); }

for (const id of ['code-form', 'password-form']) {
  $('#' + id).addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget, button = form.querySelector('button'), body = Object.fromEntries(new FormData(form));
    error.textContent = '';
    try {
      if (!body.currentPassword) throw new Error('Enter your current password.');
      if (id === 'password-form' && body.password !== body.confirm) throw new Error('New passwords must match.');
      if (id === 'password-form' && body.password.length < 12) throw new Error('Use a new password of at least 12 characters.');
      button.disabled = true;
      const result = await request(id === 'code-form' ? '/recovery-code' : '/password', 'POST', body);
      form.reset();
      if (id === 'code-form') {
        $('#code-result').hidden = false; $('#recovery-code').value = result.code; $('#recovery-code').focus(); $('#recovery-code').select();
        $('#code-state').textContent = 'A new recovery code was generated. Any earlier code no longer works.';
      } else { announceSessionChange(); location.replace('/signin?changed=1'); }
    } catch (e) { error.textContent = e.message; }
    finally { button.disabled = false; }
  });
}
$('#copy-code').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#recovery-code').value); $('#copy-code').textContent = 'Copied'; }
  catch { $('#recovery-code').select(); $('#copy-code').textContent = 'Selected — press Ctrl+C'; }
});
addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
