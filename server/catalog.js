import { HOME_TOKEN, tokenAddress } from './markets.js';
export const CATALOG_URL='https://ponsfamily.com/api/pons-launches/graduations?catalog=1&v=12';
export function normalizeCatalog(rows, homeToken=HOME_TOKEN){
  if(!Array.isArray(rows))throw Error('Invalid migration catalog');
  const unique=new Map();
  for(const row of rows){try{if(row.graduated!==true)continue;const address=tokenAddress(row.token);const migratedAt=Date.parse(row.graduatedAt);if(!Number.isFinite(migratedAt))continue;
    unique.set(address,{address,name:String(row.name||'Unnamed token').slice(0,100),symbol:String(row.symbol||'TOKEN').slice(0,30),image:tokenImage(row.logo),migratedAt});
  }catch{}}
  const pinned=unique.get(homeToken)||{address:homeToken,name:homeToken===HOME_TOKEN?'Pons':'Our fly',symbol:homeToken===HOME_TOKEN?'PONS':'HOME',image:'',migratedAt:null};
  return [{...pinned,pinned:true},...[...unique.values()].filter(t=>t.address!==homeToken).sort((a,b)=>b.migratedAt-a.migratedAt).slice(0,50)];
}
export function tokenImage(value){
  if(typeof value!=='string')return '';
  if(/^ipfs:\/\/[a-zA-Z0-9]+$/.test(value))return 'https://ponsfamily.com/api/ipfs/content/'+value.slice(7)+'?variant=card';
  try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}
}
export function createCatalog(home=()=>HOME_TOKEN){let cached,pending,retryAt=0,rows;
  const current=data=>({...data,tokens:normalizeCatalog(rows,home())});
  return async()=>{
    if(cached&&Date.now()-cached.updatedAt<30000)return current(cached);
    if(Date.now()<retryAt){if(cached)return current({...cached,stale:true});throw Error('Migration feed temporarily unavailable. Try again shortly.');}
    if(!pending)pending=(async()=>{const r=await fetch(CATALOG_URL,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Migration catalog unavailable');const nextRows=await r.json();normalizeCatalog(nextRows);rows=nextRows;cached={updatedAt:Date.now(),stale:false};return current(cached);})().catch(e=>{retryAt=Date.now()+15000;if(cached)return current({...cached,stale:true});throw e;}).finally(()=>pending=undefined);
    return pending;
  };
}
