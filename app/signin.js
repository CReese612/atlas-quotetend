// Sign in, create a business account (invitation-only in production) and recovery-code password reset.
import { request, announceSessionChange } from '/app/api.js';

const $ = s => document.querySelector(s);
const form = $('#auth-form'), toggle = $('#auth-toggle'), error = $('#auth-error');
let registering = false, busy = false, config = { production: false, invitationRequired: false };
try { config = await request('/configuration'); } catch { /* defaults keep sign-in usable */ }

if (config.production) {
  $('[data-intro]').textContent = 'One owner per business. Your account is stored on the QuoteTend server. Follow-ups are manual; QuoteTend sends no messages.';
  toggle.textContent = 'Have an invitation? Create your business account';
} else {
  $('[data-mode-label]').textContent = 'Local preview · this computer only';
  $('[data-intro]').textContent = 'One owner per business. Records stay in a database on this computer. Use fictional customer details while previewing.';
}
if (new URLSearchParams(location.search).has('changed')) { error.classList.add('auth-status'); error.textContent = 'Password changed. Sign in, then save a new recovery code.'; }

function setMode(next) {
  registering = next;
  $('#auth-title').textContent = registering ? 'Create your business account' : 'Sign in';
  $('#auth-submit').textContent = registering ? 'Create empty business workspace' : 'Sign in';
  $('#business-field').hidden = !registering;
  $('#invitation-field').hidden = !(registering && config.invitationRequired);
  $('#password-help').hidden = !registering;
  form.elements.businessName.required = registering;
  form.elements.invitation.required = registering && !!config.invitationRequired;
  form.elements.password.autocomplete = registering ? 'new-password' : 'current-password';
  toggle.textContent = registering ? 'Already have an account? Sign in' : config.production ? 'Have an invitation? Create your business account' : 'Create a business account';
  error.textContent = ''; error.classList.remove('auth-status');
  (registering ? form.elements.businessName : form.elements.email).focus();
}
toggle.addEventListener('click', () => { if (!busy) setMode(!registering); });

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  error.classList.remove('auth-status');
  const body = Object.fromEntries(new FormData(form));
  const missing = [...form.elements].find(el => el.required && !el.closest('[hidden]') && !String(el.value).trim());
  form.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
  if (missing) { error.textContent = `Enter your ${missing.closest('label').firstChild.textContent.trim().toLowerCase()}.`; missing.setAttribute('aria-invalid', 'true'); missing.focus(); return; }
  if (registering && body.password.length < 12) { error.textContent = 'Use a password of at least 12 characters.'; form.elements.password.setAttribute('aria-invalid', 'true'); form.elements.password.focus(); return; }
  busy = true;
  const button = $('#auth-submit'); button.disabled = true; error.textContent = '';
  try {
    await request(registering ? '/register' : '/login', 'POST', body);
    form.reset(); announceSessionChange(); location.replace('/account');
  } catch (e) { error.textContent = e.message; }
  finally { busy = false; button.disabled = false; }
});

$('#recover-form').addEventListener('submit', async event => {
  event.preventDefault();
  const recover = event.currentTarget, button = recover.querySelector('button'), message = $('#recover-message');
  button.disabled = true; message.textContent = ''; message.classList.remove('is-error');
  try {
    const body = Object.fromEntries(new FormData(recover));
    if (!body.email.trim() || !body.code.trim()) throw new Error('Enter your owner email and recovery code.');
    if (body.password !== body.confirm) throw new Error('New passwords must match.');
    await request('/recover', 'POST', body);
    recover.reset(); announceSessionChange();
    message.textContent = 'Password reset. Sign in above, then save a new recovery code in Account security.';
  } catch (e) { message.textContent = e.message; message.classList.add('is-error'); }
  finally { button.disabled = false; }
});
