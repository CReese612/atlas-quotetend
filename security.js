import {accountRequest,announceSessionChange} from './account-client.js';
const error=document.querySelector('#security-error');
try{const me=await accountRequest('/me');document.querySelector('#security-owner').textContent=me.email;}catch{location.replace('/signin');}
for(const id of ['code-form','password-form'])document.getElementById(id).addEventListener('submit',async event=>{
 event.preventDefault();const form=event.currentTarget,button=form.querySelector('button'),body=Object.fromEntries(new FormData(form));button.disabled=true;error.textContent='';
 try {
 if(id==='password-form' && body.password!==body.confirm)throw Error('New passwords must match.');
 const result=await accountRequest(id==='code-form'?'/recovery-code':'/password','POST',body);form.reset();
 if(id==='code-form'){document.querySelector('#code-result').hidden=false;document.querySelector('#recovery-code').value=result.code;}
 else {announceSessionChange();location.replace('/signin?changed=1');}
 }catch(e){error.textContent=e.message;}finally{button.disabled=false;}
});
window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
