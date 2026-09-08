import fs from 'node:fs/promises';
import { rpc, decodeSwap, createLiveTape } from './live-tape.js';
const HTTP='https://robinhood-rpc.publicnode.com';
const WS='wss://robinhood-rpc.publicnode.com';
const MANAGER='0x8366a39cc670b4001a1121b8f6a443a643e40951';
const SWAP='0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f';
export const logId = log => `4663:${log.transactionHash.toLowerCase()}:${Number(log.logIndex)}`;
export function streamHealthy({updatedAt,readyState,ackHeads,ackLogs},now=Date.now()){
  return Boolean(ackHeads&&ackLogs&&readyState===1&&updatedAt>0&&now-updatedAt<20000);
}
export function createStreamingTape(token, root, options={}) {
  const http=options.http || HTTP, ws=options.ws || WS;
  const fallback=createLiveTape(token,root,options.logsHttp || undefined);
  let pair, decimals=18, quoteDecimals=18, socket, startPromise, disposed=false, initialized=false;
  let startedAt=0, updatedAt=0, head=0, metadataAt=0, error='', snapshot, retryTimer, saving=false, fallbackAt=0, fallbackPending;
  const events=new Map(), pending=new Map(), blocks=new Map();
  let draining=false,ackHeads=false,ackLogs=false,lastSwapAt=0;
  const quoteUsd=()=>Number(pair?.priceUsd)/Number(pair?.priceNative);
  async function metadata() {
    if(!/^0x[0-9a-f]{40}$/i.test(token||''))throw Error('Configure a valid token address.');
    if(Number(await rpc('eth_chainId',[],http))!==4663)throw Error('Unexpected chain ID.');
    const response=await fetch(`https://api.dexscreener.com/latest/dex/tokens/${token}`,{signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw Error('Pool discovery unavailable');
    const data=await response.json();
    const matches=(data.pairs||[]).filter(p=>p.chainId==='robinhood'&&p.dexId==='uniswap'&&p.labels?.includes('v4')&&p.baseToken.address.toLowerCase()===token.toLowerCase());
    const selected=pair?matches.find(p=>p.pairAddress===pair.pairAddress):matches.sort((a,b)=>(b.liquidity?.usd||0)-(a.liquidity?.usd||0))[0];
    if(!selected)throw Error('No supported Uniswap v4 pool found.');pair=selected;
    decimals=Number(await rpc('eth_call',[{to:token,data:'0x313ce567'},'latest'],http));
    quoteDecimals=/^0x0{40}$/.test(pair.quoteToken.address)?18:Number(await rpc('eth_call',[{to:pair.quoteToken.address,data:'0x313ce567'},'latest'],http));
    if(!(quoteUsd()>0))throw Error('USD conversion unavailable');metadataAt=Date.now();
  }
  function result() {
    const connected=streamHealthy({updatedAt,readyState:socket?.readyState,ackHeads,ackLogs});
    return {status:connected?'connected':'delayed',transport:'websocket',source:options.ws?'Dedicated RPC':'PublicNode',symbol:pair?.baseToken.symbol||snapshot?.symbol,quoteSymbol:pair?.quoteToken.symbol||snapshot?.quoteSymbol,token,pool:pair?.pairAddress||snapshot?.pool,venue:'Uniswap v4',updatedAt,head,watcher:{headsSubscribed:ackHeads,swapsSubscribed:ackLogs,pendingLogs:pending.size,lastSwapAt,coverage:"Selected Uniswap v4 pool"},usdEstimated:true,error:connected?'':error||'Reconnecting to live stream',events:[...events.values()].sort((a,b)=>a.block-b.block||a.logIndex-b.logIndex).slice(-2000)};
  }
  async function drain() {
    if(draining||!pair)return;draining=true;
    try {
      for(const [id,log] of pending){
        if(Number(log.blockNumber)>head-2)continue;
        let ts=blocks.get(log.blockHash);
        if(!ts){const b=await rpc('eth_getBlockByHash',[log.blockHash,false],http);if(!b)continue;ts=Number(b.timestamp)*1000;blocks.set(log.blockHash,ts);}
        if(pending.get(id)!==log)continue;
        const event={...decodeSwap(log,pair,decimals,quoteDecimals,quoteUsd(),ts),id,chainId:4663};
        events.set(id,event);pending.delete(id);
      }
      while(events.size>2000)events.delete(events.keys().next().value);
      while(blocks.size>400)blocks.delete(blocks.keys().next().value);
    } catch {error='Some block timestamps are delayed';}
    finally {draining=false;}
  }
  let handshakeTimer;
  function connect() {
    if(disposed)return;
    ackHeads=false;ackLogs=false;updatedAt=0;
    socket=new WebSocket(ws);
    const connection=socket;let connectionHead=false;
    handshakeTimer=setTimeout(()=>{if(socket?.readyState!==3)socket.close();},15000);handshakeTimer.unref?.();
    socket.addEventListener('open',()=>{
      socket.send(JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_subscribe',params:['newHeads']}));
      socket.send(JSON.stringify({jsonrpc:'2.0',id:2,method:'eth_subscribe',params:['logs',{address:MANAGER,topics:[SWAP,pair.pairAddress]}]}));
    });
    socket.addEventListener('message',({data})=>{
      try{
        const message=JSON.parse(data);
        if(connection!==socket)return;
        if(message.id===1&&typeof message.result==='string')ackHeads=true;
        if(message.id===2&&typeof message.result==='string')ackLogs=true;
        if(ackHeads&&ackLogs&&connectionHead)clearTimeout(handshakeTimer);
        if(message.error){error='Provider rejected subscription';socket.close();return;}
        const value=message.params?.result;if(!value)return;
        if(value.number&&value.timestamp){connectionHead=true;if(ackHeads&&ackLogs)clearTimeout(handshakeTimer);head=Number(value.number);updatedAt=Date.now();blocks.set(value.hash,Number(value.timestamp)*1000);void drain();}
        else if(value.transactionHash){if(value.address?.toLowerCase()!==MANAGER||value.topics?.[0]!==SWAP||value.topics?.[1]?.toLowerCase()!==pair.pairAddress.toLowerCase())return;lastSwapAt=Date.now();const id=logId(value);if(value.removed){pending.delete(id);events.delete(id);}else pending.set(id,value);void drain();}
      }catch{error='Malformed stream response';}
    });
    socket.addEventListener('error',()=>{error='Live socket interrupted';socket.close();});
    socket.addEventListener('close',()=>{clearTimeout(handshakeTimer);if(!disposed){clearTimeout(retryTimer);retryTimer=setTimeout(connect,5000);retryTimer.unref?.();}});
  }
  async function start(){
    startedAt=Date.now();
    try{const saved=JSON.parse(await fs.readFile(`${root}/.flydex/live-tape.json`,'utf8'));if(saved.token?.toLowerCase()===token?.toLowerCase()){snapshot=saved;for(const e of saved.events||[])events.set(e.id||`4663:${e.tx.toLowerCase()}:${e.logIndex}`,e);}}catch{}
    await metadata();if(disposed)return;initialized=true;connect();
  }
  const maintenance=setInterval(()=>{
    if(disposed||!initialized)return;
    if(updatedAt&&Date.now()-updatedAt>20000&&socket?.readyState===1){error='Stream heartbeat delayed';socket.close();}
    if(Date.now()-metadataAt>60000){metadataAt=Date.now();void metadata().catch(()=>{error='Price refresh delayed';});}
    if(updatedAt&&!saving){saving=true;void fs.mkdir(`${root}/.flydex`,{recursive:true}).then(()=>fs.writeFile(`${root}/.flydex/live-tape.json`,JSON.stringify(result()))).catch(()=>{}).finally(()=>saving=false);}
  },10000);maintenance.unref?.();
  const read=async()=>{
    if(!startPromise)startPromise=start().catch(e=>{error=e.message;startPromise=undefined;});
    await startPromise;
    if(Date.now()-startedAt>15000&&(!updatedAt||Date.now()-updatedAt>20000)&&Date.now()-fallbackAt>30000&&!fallbackPending){
      fallbackAt=Date.now();fallbackPending=fallback().then(s=>{if(s.status==='connected'){for(const e of s.events)events.set(e.id||`4663:${e.tx.toLowerCase()}:${e.logIndex}`,e);snapshot=s;} }).catch(()=>{}).finally(()=>{fallbackPending=undefined;});
    }
    return result();
  };
  read.dispose=()=>{disposed=true;clearInterval(maintenance);clearTimeout(retryTimer);clearTimeout(handshakeTimer);socket?.close();};
  return read;
}
