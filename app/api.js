// Authenticated API client for the private application. The server is authoritative: every change is
// a command sent with the workspace revision it was based on and a unique request ID, so a retried
// request is applied at most once and a stale tab can never overwrite newer data.
export class ApiError extends Error {
  constructor(message, status, kind) { super(message); this.status = status; this.kind = kind; }
}
const HEADERS = { 'Content-Type': 'application/json', 'X-QuoteTend-Request': '1' };
const KIND = { 401: 'session', 404: 'missing', 413: 'capacity' };

export async function request(path, method = 'GET', body) {
  let response;
  try {
    response = await fetch('/api' + path, { method, credentials: 'same-origin', cache: 'no-store', headers: HEADERS,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  } catch {
    throw new ApiError('QuoteTend could not be reached. Check your connection and try again. No change was confirmed.', 0, 'network');
  }
  let data = null;
  try { data = await response.json(); } catch { /* proxies can answer with HTML; handled below */ }
  if (!response.ok) {
    const kind = data?.code === 'stale_revision' ? 'stale' : response.status === 409 ? 'conflict' : KIND[response.status] || (response.status >= 500 ? 'server' : 'invalid');
    throw new ApiError(data?.error || `QuoteTend returned an unexpected response (${response.status}). No change was confirmed. Reload to check saved data.`, response.status, kind);
  }
  if (data === null) throw new ApiError('QuoteTend returned an unreadable response. No change was confirmed. Reload to check saved data.', response.status, 'server');
  return data;
}

// Send one workspace command. A network failure is retried once with the same request ID: if the first
// attempt reached the server, the server replays its stored result instead of applying it twice.
export async function sendCommand(businessId, revision, command) {
  const body = { ...command, revision, requestId: crypto.randomUUID() };
  const path = '/workspaces/' + encodeURIComponent(businessId) + '/commands';
  try { return await request(path, 'POST', body); }
  catch (error) {
    if (error.kind !== 'network') throw error;
    return request(path, 'POST', body);
  }
}

export async function loadAccount() {
  const me = await request('/me');
  const [workspace, configuration] = await Promise.all([request('/workspaces/' + encodeURIComponent(me.businessId)), request('/configuration')]);
  return { me, workspace, configuration };
}

// Other open QuoteTend tabs follow sign-in, sign-out and password changes.
export function announceSessionChange() {
  try { const channel = new BroadcastChannel('quotetend-account-session'); channel.postMessage('changed'); channel.close(); } catch { /* unsupported */ }
}
