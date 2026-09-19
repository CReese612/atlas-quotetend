export const accountMode = location.pathname === '/account';
export async function accountRequest(path, method = 'GET', body) {
  const response = await fetch('/api' + path, { method, credentials: 'same-origin', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'X-QuoteTend-Request': '1' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) { const error = new Error(result.error || 'Unable to save. Reload to check saved data.'); error.status = response.status; throw error; }
  return result;
}
export async function loadAccount() {
  const me = await accountRequest('/me');
  return { ...await accountRequest('/workspaces/' + me.businessId), email: me.email, configuration:await accountRequest('/configuration') };
}
export function announceSessionChange() {
  const channel = new BroadcastChannel('quotetend-account-session'); channel.postMessage('changed'); channel.close();
}
