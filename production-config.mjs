export function configuration(env=process.env) {
 const production=env.NODE_ENV==='production';
 if(!production)return {production:false,host:'127.0.0.1',origin:null,secret:null,backupDir:env.QUOTETEND_BACKUP_DIR};
 const origin=new URL(env.PUBLIC_ORIGIN || 'http://invalid');
 if(origin.protocol!=='https:' || origin.username || origin.password || origin.pathname!=='/' || origin.search || origin.hash)throw new Error('PUBLIC_ORIGIN must be one HTTPS origin.');
 if(!env.SESSION_SECRET || env.SESSION_SECRET.length<48)throw new Error('Set a random SESSION_SECRET of at least 48 characters.');
 if(!env.QUOTETEND_DB || !env.QUOTETEND_BACKUP_DIR)throw new Error('Persistent database and backup paths are required.');
 if(env.TRUST_PROXY_HOPS!=='1')throw new Error('This deployment requires exactly one trusted reverse proxy.');
 return {production:true,host:'0.0.0.0',origin:origin.origin,secret:env.SESSION_SECRET,backupDir:env.QUOTETEND_BACKUP_DIR};
}
