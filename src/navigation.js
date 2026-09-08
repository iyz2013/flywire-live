import { TOKEN_ADDRESS } from '../config/token.ts';
import './fullscreen.js';
let HOME=window.__siteConfig?.homeToken || '0x39dbed3a2bd333467115de45665cc57f813c4571';
if(!new URLSearchParams(location.search).has('token'))setInterval(async()=>{try{const r=await fetch('/api/config',{cache:'no-store'});if(r.ok){const config=await r.json();if(/^0x[0-9a-f]{40}$/i.test(config.homeToken)&&config.homeToken!==HOME){HOME=config.homeToken;window.__siteConfig=config;window.dispatchEvent(new CustomEvent('home-token-change',{detail:HOME}));}}}catch{}},10000);
const $=id=>document.getElementById(id);
const docs=$('documentation-dialog'),feed=$('feed-dialog');
$('documentation').onclick=()=>docs.showModal();
for(const dialog of [docs,feed]){
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  dialog.addEventListener('click',e=>{if(e.target===dialog){const b=dialog.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)dialog.close();}});
}
const input=$('token-search');input.value=TOKEN_ADDRESS===HOME?'':TOKEN_ADDRESS;
$('token-form').onsubmit=e=>{
  e.preventDefault();const token=input.value.trim();
  if(!/^0x[0-9a-f]{40}$/i.test(token)){input.setCustomValidity('Enter a 0x contract address with 40 hexadecimal characters.');input.reportValidity();return;}
  location.assign('/?token='+token.toLowerCase());
};
input.oninput=()=>input.setCustomValidity('');
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
let feedRequest;
async function loadFeed(){
  if(feedRequest)return;feedRequest=true;$('feed-status').textContent='Loading migrations…';
  try{
    const r=await fetch('/api/feed');const data=await r.json();if(!r.ok)throw Error(data.error||'The feed is temporarily unavailable.');
    $('feed-rows').replaceChildren(...data.tokens.map(token=>{
      const row=document.createElement('a');row.className='token-row';row.href=token.pinned?'/':'/?token='+token.address;
      const avatar=document.createElement('span');avatar.className='token-avatar';avatar.textContent=token.symbol.slice(0,2).toUpperCase();
      if(token.image){const img=new Image();img.src=token.image;img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';img.onerror=()=>img.remove();avatar.append(img);}
      const name=document.createElement('span');name.className='token-name';const strong=document.createElement('strong');strong.textContent=token.name;const ticker=document.createElement('span');ticker.textContent=token.symbol;name.append(strong,ticker);
      const address=document.createElement('span');address.className='feed-address';address.textContent=token.address.slice(0,6)+'…'+token.address.slice(-4);
      const time=document.createElement('span');time.className='migration-time';time.textContent=token.pinned?'Pinned · Our fly':new Date(token.migratedAt).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
      if(token.pinned)row.classList.add('pinned-token');if(token.address===TOKEN_ADDRESS)row.setAttribute('aria-current','page');
      row.append(avatar,name,address,time);return row;
    }));
    $('feed-status').textContent=data.stale?'Showing the last available feed. Refresh to retry.':`Latest ${data.tokens.filter(t=>!t.pinned).length} migrations · updated ${new Date(data.updatedAt).toLocaleTimeString()}`;
  }catch(e){$('feed-status').textContent=e.message;}finally{feedRequest=false;}
}
$('feed').onclick=()=>{feed.showModal();void loadFeed();};$('refresh-feed').onclick=loadFeed;
setInterval(()=>{if(feed.open)void loadFeed();},30000);
