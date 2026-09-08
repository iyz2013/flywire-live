import { rpc } from './live-tape.js';
import { MANAGER, TOPICS, discoverMarkets, marketFilters, decodeMarketSwap } from './markets.js';

export function createMarketStream(token,options={}){
  const http=options.http||'https://robinhood-rpc.publicnode.com',ws=options.ws||'wss://robinhood-rpc.publicnode.com';
  let markets=[],filters=[],socket,disposed=false,starting,updatedAt=0,head=0,cursor=0,lastScanAt=0,error='',metadataAt=0,revision=0,lastSwapAt=0,reconnecting,handshake,scanPending=false,draining=false,scanError='',retryAt=0,scanRetryAt=0;
  const events=new Map(),pending=new Map(),blocks=new Map(),acks=new Set();
  function marketFor(log){return markets.find(p=>p.version==='v4'?log.address?.toLowerCase()===MANAGER&&log.topics?.[0]===TOPICS.v4&&p.pairAddress.toLowerCase()===log.topics?.[1]?.toLowerCase():p.pairAddress.toLowerCase()===log.address?.toLowerCase()&&log.topics?.[0]===TOPICS[p.version]);}
  function receive(log){if(!marketFor(log))return;const id=`4663:${log.transactionHash.toLowerCase()}:${Number(log.logIndex)}`;if(log.removed){pending.delete(id);if(events.delete(id))revision++;}else if(!events.has(id)){pending.set(id,log);lastSwapAt=Date.now();}void drain();}
  async function drain(){
    if(draining||disposed)return;draining=true;
    try{for(const [id,log] of pending){
      if(Number(log.blockNumber)>head-2)continue;
      let ts=blocks.get(log.blockHash);
      if(!ts){const b=await rpc('eth_getBlockByHash',[log.blockHash,false],http);if(!b)continue;ts=Number(b.timestamp)*1000;blocks.set(log.blockHash,ts);}
      if(disposed||pending.get(id)!==log)continue;
      try{const event=decodeMarketSwap(log,marketFor(log),ts);if(event){events.set(id,event);revision++;}}catch{error='A market emitted an unsupported swap format.';}
      pending.delete(id);
    }}catch{error='Waiting for block timestamps';}finally{draining=false;}
    while(events.size>500)events.delete(events.keys().next().value);
    while(blocks.size>2500)blocks.delete(blocks.keys().next().value);
    while(pending.size>2000)pending.delete(pending.keys().next().value);
  }
  function connect(){
    if(disposed)return;acks.clear();updatedAt=0;socket=new WebSocket(ws);const connection=socket;
    handshake=setTimeout(()=>connection.close(),15000);handshake.unref?.();
    socket.addEventListener('open',()=>{
      socket.send(JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_subscribe',params:['newHeads']}));
      filters.forEach((filter,i)=>socket.send(JSON.stringify({jsonrpc:'2.0',id:i+2,method:'eth_subscribe',params:['logs',filter]})));
    });
    socket.addEventListener('message',({data})=>{
      if(connection!==socket||disposed)return;
      try{const m=JSON.parse(data);if(m.error){error='Provider rejected a subscription';socket.close();return;}
        if(m.id&&typeof m.result==='string')acks.add(m.id);
        const v=m.params?.result;
        if(v?.number&&v.timestamp){head=Number(v.number);updatedAt=Date.now();blocks.set(v.hash,Number(v.timestamp)*1000);void drain();}
        else if(v?.transactionHash)receive(v);
        if(acks.size===filters.length+1&&updatedAt){clearTimeout(handshake);error='';}
      }catch{error='Malformed provider response';}
    });
    socket.addEventListener('error',()=>connection.close());
    socket.addEventListener('close',()=>{clearTimeout(handshake);if(!disposed){clearTimeout(reconnecting);reconnecting=setTimeout(connect,2500);reconnecting.unref?.();}});
  }
  async function scan(){
    if(scanPending||!markets.length||disposed||Date.now()<scanRetryAt)return;scanPending=true;
    try{
      const latest=Number(await rpc('eth_blockNumber',[],http))-2;
      if(!updatedAt||Date.now()-updatedAt>20000)head=latest+2;
      // Bounded catch-up, with overlap for reorg reconciliation.
      const from=cursor?Math.max(0,cursor-20):Math.max(0,latest-150);
      const to=Math.min(latest,from+499);
      if(to<from)return;
      const logs=[];
      for(const filter of filters)logs.push(...await rpc('eth_getLogs',[{...filter,fromBlock:'0x'+from.toString(16),toBlock:'0x'+to.toString(16)}],options.logsHttp||'https://rpc.mainnet.chain.robinhood.com'));
      const canonical=new Set(logs.filter(l=>!l.removed).map(l=>`4663:${l.transactionHash.toLowerCase()}:${Number(l.logIndex)}`));
      for(const [id,event] of events)if(event.block>=from&&event.block<=to&&!canonical.has(id)){events.delete(id);revision++;}
      for(const log of logs)receive(log);
      cursor=to;lastScanAt=Date.now();scanError='';await drain();
    }catch(e){scanError='Catch-up RPC delayed; socket remains active';scanRetryAt=Date.now()+(e.message.includes('429')?20000:5000);}finally{scanPending=false;}
  }
  async function start(){
    if(Date.now()<retryAt)return;
    try{
      if(Number(await rpc('eth_chainId',[],http))!==4663)throw Error('Wrong RPC chain');
      markets=await discoverMarkets(token,http);if(disposed)return;
      filters=marketFilters(markets);metadataAt=Date.now();connect();void scan();
    }catch(e){error=e.message;retryAt=Date.now()+30000;starting=undefined;}
  }
  const maintenance=setInterval(()=>{
    if(disposed)return;
    if(!markets.length){void read();return;}
    if(updatedAt&&Date.now()-updatedAt>20000&&socket?.readyState===1)socket.close();
    void scan();
    if(Date.now()-metadataAt>120000){metadataAt=Date.now();void discoverMarkets(token,http).then(next=>{
      if(disposed)return;
      const changed=markets.map(m=>m.pairAddress).sort().join()!==next.map(m=>m.pairAddress).sort().join();
      markets=next;filters=marketFilters(markets);if(changed){cursor=0;socket?.close();}
    }).catch(()=>{});}
  },5000);maintenance.unref?.();
  function snapshot(){const connected=socket?.readyState===1&&acks.size===filters.length+1&&Date.now()-updatedAt<20000;
    return {token,symbol:markets[0]?.baseToken.symbol,name:markets[0]?.baseToken.name,status:connected?'connected':markets.length?'delayed':'unavailable',error:connected?'':error||'Connecting to markets',transport:'websocket + SSE',updatedAt,head,revision,events:[...events.values()].sort((a,b)=>a.block-b.block||a.logIndex-b.logIndex),watcher:{headsSubscribed:acks.has(1),swapsSubscribed:acks.size===filters.length+1&&filters.length>0,poolCount:markets.length,coverage:'Indexed V2, V3 and Uniswap V4 pools on Robinhood Chain',lastSwapAt,lastScanAt,catchupError:scanError,catchupLagBlocks:cursor?Math.max(0,head-2-cursor):null},usdEstimated:true};
  }
  async function read(){if(!starting&&!markets.length&&Date.now()>=retryAt)starting=start();if(starting)await starting;return snapshot();}
  read.snapshot=snapshot;read.dispose=()=>{disposed=true;clearInterval(maintenance);clearTimeout(handshake);clearTimeout(reconnecting);socket?.close();};
  return read;
}
