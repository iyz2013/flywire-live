import './navigation.js';
import { reconcileEvents } from './live-client.js';
import './observatory.css';
import { NeuralRuntime } from './neural-runtime.js';
import { Habitat } from './habitat.js';
import { configureAssetBase } from './data-loader.js';
import { Brain3D } from './brain-3d.js';
import { LiveMotion } from './reactions.js';
import { FlyScene } from './scene.js';
import { populations } from './stimulus.js';
import { ingestPons, stateAt, selectedCells } from './tape.js';
import { TOKEN_ADDRESS, setTokenAddress, MIN_NOTIONAL_USD, MAX_EVENTS_PER_SEC, COOLDOWN_MS } from '../config/token.ts';

configureAssetBase(new URL(import.meta.env.BASE_URL, document.baseURI).href);
const $ = id => document.getElementById(id);
const title = s => s.charAt(0).toUpperCase() + s.slice(1);
const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const timestamp = t => t > 1e12 ? new Date(t).toLocaleTimeString('en-GB') : `00:${String(Math.floor(t / 1000)).padStart(2, '0')}`;
let scene, view, pools = {}, cellSets = new Map(), lastFrame = 0, ready = false, lastEvent, lastMotor, lastUI = -1000;
let db, habitat;
let light = false;
try { light = localStorage.getItem('flydex-theme') === 'light'; } catch {}
function applyTheme() {
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  $('theme').textContent = light ? 'Dark mode' : 'Light mode';
  $('theme').setAttribute('aria-label', light ? 'Switch to dark mode' : 'Switch to light mode');
  view?.setTheme(light);
  if (scene) {
    habitat?.setTheme(light);
  }
}
$('theme').onclick = () => { light = !light; applyTheme(); try { localStorage.setItem('flydex-theme',light?'light':'dark'); } catch {} };
applyTheme();
$('reset-brain').onclick = () => view?.resetCamera();
$('edges').onclick = () => { if(view) { view.showEdges=!view.showEdges; $('edges').setAttribute('aria-pressed',String(view.showEdges)); } };
let neural, liveSession = { events: [], transitions: [] }, liveRaw = new Map(), liveController = new LiveMotion();
let receivedSnapshot = false;
let liveStatus = 'Connecting to Robinhood Chain', liveUpdated = 0, liveSymbol = '', liveQuote = '', liveSeenPulse;
const clockTime = () => Date.now();
const currentSession = () => liveSession;
const eventId = e => e.id || e.tx;
const latestState = () => stateAt(currentSession(), clockTime());
let liveDetails={},lastDelivery=0,stream;
let sessionStarted=Date.now(), stopLive=()=>{};
function acceptSnapshot(data){
  if(data.token!==TOKEN_ADDRESS)return;
  liveRaw=reconcileEvents(liveRaw,data.events||[],{initial:!receivedSnapshot,startedAt:sessionStarted});
  // Keep individual swaps in the table; animation scheduling is separate.
  liveSession=ingestPons([...liveRaw.values()],{dust:0,maxPulses:Infinity,cooldown:COOLDOWN_MS});
  liveSession.source='robinhood';
  if(!receivedSnapshot&&data.watcher?.poolCount){const last=liveSession.events.at(-1);if(last)liveSeenPulse=eventId(last);receivedSnapshot=true;}
  liveUpdated=data.updatedAt;liveSymbol=data.symbol||'';liveStatus=data.status==='connected'?'Live':data.error||'Reconnecting';liveDetails=data.watcher||{};lastDelivery=Date.now();
  for(const e of liveSession.events)if(!cellSets.has(e.tx))cellSets.set(e.tx,selectedCells(pools[e.population]||[],e.tx));
  const kept=new Set(liveSession.events.map(e=>e.tx));for(const key of cellSets.keys())if(!kept.has(key))cellSets.delete(key);
  updateUI(true);
}
function connectLive(){
  if(!/^0x[0-9a-f]{40}$/i.test(TOKEN_ADDRESS)){liveStatus='Invalid contract address. Use search to enter a Robinhood Chain token.';updateUI(true);return;}
  stopLive();const token=TOKEN_ADDRESS;let stopped=false;
  stream=new EventSource('/api/stream?token='+encodeURIComponent(token));const connection=stream;
  stream.onmessage=({data})=>{if(stopped)return;try{acceptSnapshot(JSON.parse(data));}catch{liveStatus='Could not read live update';}};
  stream.onerror=()=>{if(stopped)return;liveStatus='Connection interrupted · reconnecting';updateUI(true);};
  // EventSource reconnects automatically. Poll only while its delivery is stalled.
  let checking=false;
  const polling=setInterval(async()=>{if(stopped||checking||Date.now()-lastDelivery<6000)return;checking=true;try{const r=await fetch('/api/tape?token='+encodeURIComponent(token));const d=await r.json();if(stopped)return;if(!r.ok)throw Error(d.error);acceptSnapshot(d);}catch(e){if(!stopped){liveStatus=e.message;updateUI(true);}}finally{checking=false;}},5000);
  stopLive=()=>{stopped=true;connection.close();clearInterval(polling);};
}
window.addEventListener('pagehide',()=>stopLive());
window.addEventListener('home-token-change',({detail:token})=>{
  stopLive();setTokenAddress(token);sessionStarted=Date.now();
  liveRaw=new Map();liveSession={events:[],transitions:[]};cellSets.clear();receivedSnapshot=false;liveSeenPulse=undefined;lastEvent=undefined;
  liveController=new LiveMotion();scene?.reset();view?.reset();neural?.reset();
  liveSymbol='';liveUpdated=0;lastDelivery=0;liveDetails={};liveStatus='Connecting to the new coin';
  updateUI(true);connectLive();
});
function advanceLive(delta) {
  const event=latestState().event;
  if(event&&eventId(event)!==liveSeenPulse&&Date.now()-event.ts<1500){
    liveSeenPulse=eventId(event);liveController.trigger(event);
    pulse(event.population,event.gain,event.durationMs,event.tx,event.side);
  }
  let pose;
  for(let remaining=delta/1000;remaining>0;){const step=Math.min(.02,remaining);pose=liveController.advance(step);remaining-=step;}
  if(pose)scene?.update(pose);
  habitat?.animate(performance.now()/1000);
}
let persistence = 'memory';
function notify(message) { $('notice').textContent = message; $('notice').hidden = false; clearTimeout(notify.timer); notify.timer = setTimeout(() => $('notice').hidden = true, 4500); }
const motorNotes = { idle: 'Resting on the chamber floor', approach: 'Moving toward the stimulus', feed: 'Lingering at the stimulus', retreat: 'Moving away from the stimulus', escape: 'Brief takeoff', recover: 'Settling onto the chamber floor', groom: 'Quiet-period grooming' };

async function saveSession() {
  try {
    db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('pons-observatory', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('sessions', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    persistence = 'IndexedDB';
  } catch { notify('Browser storage is unavailable. The session can still be exported.'); }
}
function selectPopulations(neurons) {
  const groups = populations(neurons);
  const matching = expression => neurons.flatMap((r, i) => expression.test(r[1] || '') ? [i] : []);
  const sugar = matching(/sugar|Gr64|Gr5a|sweet/i);
  const bitter = matching(/bitter|Gr66|Gr32/i);
  const reward = matching(/^PAM/);
  const water = matching(/water|ppk28/i);
  // Explicit renderer-class aliases where the MaleCNS annotations lack GRN labels.
  pools = {
    'Sugar / GRN attractant': sugar.length ? sugar : groups.walk,
    'Sugar + PAM-like reward': [...(sugar.length ? sugar : groups.walk), ...reward],
    'Bitter / deterrent': bitter.length ? bitter : groups.reverse,
    'Water / mild sugar': water.length ? water : groups.walk,
    'Looming / LC4': groups.escapeInput,
  };
  for (const e of liveSession.events) {
    const selected = selectedCells(pools[e.population], e.tx);
    cellSets.set(e.tx, selected.length ? selected : pools[e.population].slice(0, 1));
  }
}
// Public adapter boundary: population selection is stable; only cells within it are seeded.
function pulse(population, gain, durationMs, tx, side) {
  if (!view) return;
  const cells = cellSets.get(tx) || selectedCells(pools[population] || [], tx);
  view.stimulate(cells, side);
  neural?.pulse(cells, gain);
  return { population, gain, durationMs, cells: cells.length };
}
function renderTape() {
  const current = currentSession().events.filter(e => e.ts <= clockTime());
  $('event-count').textContent = `${current.length} events`;
  $('empty-tape').hidden = current.length > 0;
  $('events').replaceChildren(...current.slice(-100).reverse().map(e => {
    const row = document.createElement('tr'); row.className = e.side;
    const timeCell = document.createElement('td'); timeCell.textContent=timestamp(e.chainTs || e.ts); row.append(timeCell);
    const txCell=document.createElement('td');
    if(/^0x[0-9a-f]{64}$/i.test(e.tx)) { const a=document.createElement('a');a.href='https://explorer.robinhood.com/tx/'+e.tx;a.target='_blank';a.rel='noreferrer';a.textContent=e.tx.slice(0,8)+'…'+e.tx.slice(-6);txCell.append(a); } else txCell.textContent=e.tx;
    row.append(txCell);
    for (const value of [title(e.side), money(e.usd), e.population + ' · ' + e.gain.toFixed(2), e.reaction ? `${e.reaction.label} · ${e.reaction.mood}` : title(e.motor)]) {
      const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
    }
    return row;
  }));
}
function updateUI(force = false) {
  const current = latestState();
  const event = current.event;

  $('room-token').textContent=liveSymbol ? liveSymbol+' · '+TOKEN_ADDRESS.slice(0,6)+'…'+TOKEN_ADDRESS.slice(-4) : TOKEN_ADDRESS.slice(0,6)+'…'+TOKEN_ADDRESS.slice(-4);
  const healthy=liveStatus==='Live'&&Date.now()-liveUpdated<20000&&Date.now()-lastDelivery<6000;
  $('live-health').textContent=healthy?'Live · '+liveDetails.poolCount+(liveDetails.poolCount===1?' pool':' pools'):liveStatus==='Live'?'Connection delayed · reconnecting':liveStatus;
  $('live-health').dataset.state=healthy?'live':'delayed';
  $('live-health').title='Last chain update: '+(liveUpdated?new Date(liveUpdated).toLocaleTimeString():'waiting')+(liveDetails.catchupError?' · '+liveDetails.catchupError:'');
  $('empty-tape').textContent=liveStatus==='Live'?'Waiting for the next swap':liveStatus;
  $('motor').textContent = liveController.pose.behavior;
  $('body-note').textContent = liveController.active ? `${liveController.reaction.mood} · ${liveController.side} response` : 'Following the live tape';
  if (event?.tx !== lastEvent || force) {
    renderTape();
  }
  lastEvent = event?.tx; lastMotor = current.motor;
}
document.querySelectorAll('[data-camera]').forEach(b => b.onclick = () => {
  scene?.setCamera(b.dataset.camera);
  document.querySelectorAll('[data-camera]').forEach(c => c.classList.toggle('active', c === b));
});
$('reset-camera').onclick = () => {
  scene?.setCamera('follow');
  document.querySelectorAll('[data-camera]').forEach(b => b.classList.toggle('active', b.dataset.camera === 'follow'));
};
$('projection').onclick = () => {
  if (!view) return;
  view.projection = view.projection === 'brain' ? 'full' : 'brain'; view.layout();
  $('projection').textContent = view.projection === 'brain' ? 'Brain + nerve cord' : 'Brain only';
};
$('export').onclick = () => {
  const blob = new Blob([JSON.stringify({ ...currentSession(), persistence, populationAliases: { sugar: 'GRN annotation or LC9', bitter: 'GRN annotation or MDN', water: 'water annotation or LC9', looming: 'LC4' } }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'flywire-live-session.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
function animate(time) {
  const delta = lastFrame ? Math.min(100, time-lastFrame) : 0; lastFrame=time;
  if(ready && !document.hidden) advanceLive(delta);
  if(time-lastUI>80 && !document.hidden){updateUI();lastUI=time;}
  requestAnimationFrame(animate);
}
async function boot() {
  document.body.classList.add('live-mode'); void saveSession(); updateUI(true); connectLive();
  try {
    view = new Brain3D($('brain'));
    view.setTheme(light);
    const neurons = await view.load();
    selectPopulations(neurons);
    $('brain-status').textContent = `${neurons.length.toLocaleString()} neurons`;
    $('brain-loading').hidden = true;
    const computeStatus = document.createElement('span'); computeStatus.id = 'neural-status'; computeStatus.className = 'neural-status'; $('brain').parentElement.append(computeStatus);
    neural = new NeuralRuntime(view, computeStatus, () => true);
  } catch (error) { $('brain-loading').textContent = 'Connectome could not load. Reload to retry.'; console.error(error); }
  try {
    scene = new FlyScene($('fly'));
    await scene.load(); scene.setDepthOfField(false);
    habitat = new Habitat(scene);
    scene.setCamera('follow'); applyTheme(); $('fly-loading').hidden = true;
  } catch (error) { scene?.dispose(); scene = undefined; $('fly-loading').textContent = '3D rendering is unavailable. The neural network remains available.'; console.error(error); }
  ready = true; requestAnimationFrame(animate);
}
void boot();


