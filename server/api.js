import { createSettings } from './settings.js';
import { createAdmin } from './admin.js';
import { createMarketStream } from './market-stream.js';
import { tokenAddress } from './markets.js';
import { createCatalog } from './catalog.js';
import { createColony } from './colony.js';
export function createApi(options={}){
  const settings=options.settings||createSettings(), admin=createAdmin(settings,options.admin);
  const home=()=>settings.read().homeToken;
  const watchers=new Map(),catalog=createCatalog(home);let clients=0;
  const colony=createColony(catalog,options);
  function get(token){let entry=watchers.get(token);if(!entry){if(watchers.size>=20)throw Object.assign(Error('All live rooms are busy. Try again shortly.'),{status:503});entry={read:createMarketStream(token,options),lastUsed:Date.now(),clients:0};watchers.set(token,entry);}entry.lastUsed=Date.now();return entry;}
  const timer=setInterval(()=>{for(const [token,e]of watchers)if(token!==home()&&!e.clients&&Date.now()-e.lastUsed>120000){e.read.dispose();watchers.delete(token);}try{void get(home()).read().catch(()=>{});}catch{}},30000);timer.unref?.();
  async function handle(req,res){
    const url=new URL(req.url,'http://localhost');
    if(await admin(req,res,url))return true;
    if(url.pathname==='/api/config'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(settings.read()));return true;}
    if(!['/api/tape','/api/stream','/api/feed','/api/colony'].includes(url.pathname))return false;
    try{
      if(req.method!=='GET'){res.writeHead(405,{Allow:'GET'});res.end();return true;}
      if(url.pathname==='/api/colony'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(colony()));return true;}
      if(url.pathname==='/api/feed'){const data=await catalog();res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));return true;}
      const token=tokenAddress(url.searchParams.get('token')||home());
      if(url.pathname==='/api/stream'&&clients>=250)throw Object.assign(Error('Too many live connections. Try again shortly.'),{status:503});
      const entry=get(token);
      if(url.pathname==='/api/tape'){const d=await entry.read();res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(d));return true;}
      res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders?.();
      clients++;entry.clients++;let closed=false,lastRevision=-1,lastSent=0;
      const send=()=>{if(closed)return;const d=entry.read.snapshot();if(d.revision===lastRevision&&Date.now()-lastSent<2000)return;
        if(res.writableLength>1024*1024){res.destroy();return;}
        res.write('data: '+JSON.stringify(d)+'\n\n');lastRevision=d.revision;lastSent=Date.now();entry.lastUsed=Date.now();};
      const tick=setInterval(send,200);tick.unref?.();res.on('close',()=>{closed=true;clearInterval(tick);clients--;entry.clients--;entry.lastUsed=Date.now();});
      void entry.read().then(send).catch(()=>res.destroy());return true;
    }catch(e){if(res.headersSent){res.end();return true;}res.writeHead(e.status||503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:e.message}));return true;}
  }
  handle.dispose=()=>{clearInterval(timer);colony.dispose();for(const e of watchers.values())e.read.dispose();};
  handle.start=()=>{void get(home()).read();};return handle;
}
