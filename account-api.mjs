import express from 'express';
import session from 'express-session';
import bcrypt from 'bcryptjs';
import { rateLimit } from 'express-rate-limit';
import { issueRecovery, replacePassword, tokenHash } from './account-security.mjs';
import { SQLiteSessions } from './account-store.mjs';

const HOURS_8 = 8 * 60 * 60 * 1000;
export const passwordError = password => typeof password !== 'string' || password.length < 12 || bcrypt.truncates(password)
  ? 'Use a password of at least 12 characters and no more than 72 UTF-8 bytes.' : '';
const emailKey = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
const establish = (req, owner) => new Promise((resolve, reject) => {
  req.session.regenerate(err => {
    if (err) return reject(err);
    req.session.ownerId = owner.id; req.session.credentialVersion = tokenHash(owner.password_hash); req.session.started = Date.now();
    req.session.save(err => err ? reject(err) : resolve());
  });
});
export async function accountAPI(store, port, config={}) {
  const api = express.Router(), cookieName = `quotetend.sid.${port}`;
  const dummyHash = await bcrypt.hash('unused-' + store.secret, 12);
  api.use((req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method) && (req.headers.origin !== (config.origin || `http://${req.headers.host}`) ||
      req.headers['x-quotetend-request'] !== '1' || !req.is('application/json'))) {
      return res.status(403).json({ error: 'Request blocked. Open QuoteTend at its configured address and try again.' });
    }
    next();
  });
  // Bodies are bounded before anyone is identified: sign-in, recovery and password bodies are tiny, and the 5 MB
  // workspace parser only runs after the caller is authenticated and addressing their own business (below).
  const small = express.json({ limit: '16kb' }), large = express.json({ limit: 5_000_000 });
  api.use((req, res, next) => req.path.startsWith('/workspaces/') ? next() : small(req, res, err => err?.type === 'entity.too.large' ? res.status(413).json({ error: 'Request is too large.' }) : next(err)));
  api.use(session({ name: cookieName, secret: config.secret || store.secret, store: new SQLiteSessions(store.db),
    resave: false, saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'strict', secure: !!config.production, path: '/api', maxAge: HOURS_8 } }));
  const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Too many sign-in or registration attempts. Wait 15 minutes before trying again.' } });
  api.post('/register', authLimit, async (req, res) => {
    const email = emailKey(req.body?.email), name = req.body?.businessName, password = req.body?.password;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
      typeof name !== 'string' || !name.trim() || name.length > 120 || passwordError(password)) {
      return res.status(400).json({ error: passwordError(password) || 'Enter a valid owner email and business name (up to 120 characters).' });
    }
    if(config.production && !store.db.prepare('SELECT 1 FROM invitations WHERE hash=? AND email=? AND expires>?').get(tokenHash(req.body?.invitation),email,Date.now()))return res.status(403).json({error:'A valid invitation for this email is required.'});
    const hash = await bcrypt.hash(password, 12);
    let owner;
    try { owner = store.createOwner(email, hash, name.trim(), config.production ? (req.body?.invitation || '') : undefined); }
    catch (err) {
      if (store.ownerByEmail(email)) return res.status(409).json({ error: 'Unable to create that account. Try signing in or use local account recovery.' });
      throw err;
    }
    await establish(req, owner); res.status(201).json({ businessId: owner.business_id });
  });
  api.post('/login', authLimit, async (req, res) => {
    const owner = store.ownerByEmail(emailKey(req.body?.email)), password = req.body?.password;
    const validInput = typeof password === 'string' && password.length <= 72 && !bcrypt.truncates(password);
    const match = await bcrypt.compare(validInput ? password : '', owner?.password_hash || dummyHash);
    if (!validInput || !owner || !match || store.suspended(owner.id) || store.ownerById(owner.id).password_hash!==owner.password_hash) return res.status(401).json({ error: 'Email or password is incorrect.' });
    await establish(req, owner); res.json({ businessId: owner.business_id });
  });
  api.get('/configuration', (req,res)=>res.json({production:!!config.production,invitationRequired:!!config.production}));
  api.post('/recover', authLimit, async(req,res)=>{
    const error=passwordError(req.body?.password);if(error)return res.status(400).json({error});
    const owner=store.ownerByEmail(emailKey(req.body?.email));
    const hash=await bcrypt.hash(req.body.password,12);
    if(!owner || !replacePassword(store.db,owner,hash,{recoveryCode:req.body?.code}))return res.status(400).json({error:'Email or recovery code is invalid or already used.'});
    res.json({ok:true});
  });
  api.post('/logout', (req, res, next) => {
    req.session.destroy(err => {
      if (err) return next(err);
      res.clearCookie(cookieName, { path: '/api', httpOnly: true, sameSite: 'strict' }); res.json({ ok: true });
    });
  });
  api.use((req, res, next) => {
    const owner = typeof req.session.ownerId==='string' && store.ownerById(req.session.ownerId);
    // The start time must be a real moment no later than now: a non-numeric or future value would otherwise skip the eight-hour limit.
    const started=req.session.started,age=Date.now()-started;
    if (!owner || store.suspended(owner.id) || req.session.credentialVersion!==tokenHash(owner.password_hash) || typeof started!=='number' || !(age>=0 && age<HOURS_8)) {
      return res.status(401).json({ error: 'Please sign in again. Unsaved changes have not been applied.' });
    }
    req.owner = owner; next();
  });
  api.post('/password', authLimit, async(req,res)=>{
    const err=passwordError(req.body?.password);if(err)return res.status(400).json({error:err});
    if(passwordError(req.body?.currentPassword) || !await bcrypt.compare(req.body.currentPassword,req.owner.password_hash))return res.status(400).json({error:'Current password is incorrect.'});
    const hash=await bcrypt.hash(req.body.password,12);
    if(!replacePassword(store.db,req.owner,hash,{previousHash:req.owner.password_hash}))return res.status(409).json({error:'Password changed elsewhere. Sign in again.'});
    req.session.destroy(()=>{});res.json({ok:true});
  });
  api.post('/recovery-code', authLimit, async(req,res)=>{
    if(passwordError(req.body?.currentPassword) || !await bcrypt.compare(req.body.currentPassword,req.owner.password_hash))return res.status(400).json({error:'Current password is incorrect.'});
    if(store.ownerById(req.owner.id).password_hash!==req.owner.password_hash)return res.status(409).json({error:'Sign in again.'});
    res.json({code:issueRecovery(store.db,req.owner.id)});
  });
  api.get('/me', (req, res) => res.json({ email: req.owner.email, businessId: req.owner.business_id,
    businessName: store.workspace(req.owner.business_id)?.businessName || '',
    recoveryCodeSaved: !!store.db.prepare('SELECT 1 FROM recovery_codes WHERE owner_id=?').get(req.owner.id) }));
  api.use('/workspaces/:businessId', (req, res, next) => {
    // Trust only the session's owner, never caller-supplied business/owner IDs.
    if (req.params.businessId !== req.owner.business_id) return res.status(404).json({ error: 'Workspace not found.' });
    next();
  });
  api.use('/workspaces/:businessId', large);
  api.get('/workspaces/:businessId', (req, res) => res.json(store.workspace(req.owner.business_id)));

  api.put('/workspaces/:businessId', (req,res)=>res.status(405).json({error:'Reload QuoteTend. Whole-workspace saves are disabled; use focused operations or explicit restore.'}));
  api.post('/workspaces/:businessId/commands', (req,res)=>{
    try {res.json(store.command(req.owner,req.body));} catch(e) {if(e.status)res.status(e.status).json({error:e.message,...(e.code?{code:e.code}:{})});else throw e;}
  });
  api.get('/workspaces/:businessId/results', (req,res)=>{
    try {res.json(store.results(req.owner.business_id,req.query.from,req.query.to));}catch(e){res.status(400).json({error:e.message});}
  });
  // The ledger numbers events across every business. Callers get this business's own 1..n ordinals so the gaps
  // cannot reveal how much other contractors are doing; internal ordering and stored references are unchanged.
  api.get('/workspaces/:businessId/events', (req,res)=>{
    const events=store.events(req.owner.business_id),ordinal=new Map(events.map((e,i)=>[e.sequence,i+1]));
    res.json(events.map(e=>({...e,sequence:ordinal.get(e.sequence),...(e.data.outcomeSequence!==undefined?{data:{...e.data,outcomeSequence:ordinal.get(e.data.outcomeSequence)}}:{})})));
  });
  api.get('/workspaces/:businessId/snapshots', (req,res)=>res.json(store.snapshots(req.owner.business_id)));
  api.get('/workspaces/:businessId/snapshots/:snapshotId', (req,res)=>{
    const snapshot=store.snapshot(req.owner.business_id,req.params.snapshotId);
    snapshot?res.json(snapshot):res.status(404).json({error:'Snapshot not found.'});
  });
  api.use((req, res) => res.status(404).json({ error: 'Not found.' }));
  return api;
}
