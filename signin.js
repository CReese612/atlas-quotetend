import { accountRequest, announceSessionChange } from './account-client.js';
const form = document.querySelector('#auth-form'), toggle = document.querySelector('#auth-toggle');
let registering = false, busy = false;
let config={production:false};
try{config=await accountRequest('/configuration');}catch{}
if(config.production){document.querySelector('.eyebrow').textContent='PRIVATE BUSINESS ACCOUNTS';document.querySelector('h1 + p').textContent='One owner per business. Your account uses server storage. Follow-ups are manual; QuoteTend sends no messages.';toggle.textContent='Create an invited business account';}
if(new URLSearchParams(location.search).has('changed'))document.querySelector('#auth-error').textContent='Password changed. Sign in and generate a new recovery code.';
toggle.addEventListener('click', () => {
  if (busy) return;
  registering = !registering;
  document.querySelector('#auth-title').textContent = registering ? (config.production?'Create your business account':'Create your local account') : 'Sign in';
  document.querySelector('#auth-submit').textContent = registering ? 'Create empty business workspace' : 'Sign in';
  document.querySelector('#business-field').hidden = !registering;
  document.querySelector('#invitation-field').hidden=!(registering && config.invitationRequired);
  form.elements.invitation.required=registering && !!config.invitationRequired;
  document.querySelector('#password-help').hidden = !registering;
  form.elements.businessName.required = registering;
  form.elements.password.autocomplete = registering ? 'new-password' : 'current-password';
  form.elements.password.minLength = registering ? 12 : 1;
  toggle.textContent = registering ? 'Already have an account? Sign in' : (config.production?'Create an invited business account':'Create a local business account');
  document.querySelector('#auth-error').textContent = '';
});
form.addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return; busy = true;
  const button = document.querySelector('#auth-submit'); button.disabled = true;
  document.querySelector('#auth-error').textContent = '';
  try {
    await accountRequest(registering ? '/register' : '/login', 'POST', Object.fromEntries(new FormData(form)));
    form.reset(); announceSessionChange(); location.replace('/account');
  } catch (error) { document.querySelector('#auth-error').textContent = error.message; }
  finally { busy = false; button.disabled = false; }
});

document.querySelector('#recover-form').addEventListener('submit',async event=>{
 event.preventDefault();const form=event.currentTarget,button=form.querySelector('button'),message=document.querySelector('#recover-message');
 button.disabled=true;message.textContent='';
 try {const body=Object.fromEntries(new FormData(form));if(body.password!==body.confirm)throw Error('New passwords must match.');
 await accountRequest('/recover','POST',body);form.reset();announceSessionChange();message.textContent='Password reset. Sign in above, then generate a new recovery code in Account security.';}
 catch(e){message.textContent=e.message;}finally{button.disabled=false;}
});
