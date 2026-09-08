import { keccak256, toBytes, decodeAbiParameters, parseAbiParameters } from 'viem';
import { rpc } from './live-tape.js';
export const HOME_TOKEN='0x39dbed3a2bd333467115de45665cc57f813c4571';
export const MANAGER='0x8366a39cc670b4001a1121b8f6a443a643e40951';
export const TOPICS={v4:keccak256(toBytes('Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)')),v3:keccak256(toBytes('Swap(address,address,int256,int256,uint160,uint128,int24)')),v2:keccak256(toBytes('Swap(address,uint256,uint256,uint256,uint256,address)'))};
const TYPES={v4:parseAbiParameters('int128,int128,uint160,uint128,int24,uint24'),v3:parseAbiParameters('int256,int256,uint160,uint128,int24'),v2:parseAbiParameters('uint256,uint256,uint256,uint256')};
export function tokenAddress(value){if(!/^0x[0-9a-f]{40}$/i.test(value||''))throw Object.assign(Error('Enter a valid token contract address on Robinhood Chain.'),{status:400});return value.toLowerCase();}
export function decodeMarketSwap(log,market,ts){
  const values=decodeAbiParameters(TYPES[market.version],log.data);
  let [a0,a1]=values;
  if(market.version==='v2'){a0=values[0]-values[2];a1=values[1]-values[3];}
  // V4 deltas are from the caller's perspective; V2/V3 use the pool's.
  const sign=market.version==='v4'?1n:-1n;
  const delta=(market.token0?a0:a1)*sign,quote=(market.token0?a1:a0)*sign;
  const quantity=Math.abs(Number(delta))/10**market.decimals;
  const usd=Math.abs(Number(quote))/10**market.quoteDecimals*market.quoteUsd;
  if(!quantity||!Number.isFinite(usd)||delta===0n)return null;
  return {id:`4663:${log.transactionHash.toLowerCase()}:${Number(log.logIndex)}`,tx:log.transactionHash,logIndex:Number(log.logIndex),ts,receivedAt:Date.now(),side:delta>0n?'buy':'sell',usd,fee_usd:null,price:usd/quantity,block:Number(log.blockNumber),blockHash:log.blockHash,pool:market.pairAddress,venue:market.dexId+' '+market.version,success:true,usdEstimated:true,chainId:4663};
}
const decimalsCache=new Map();
async function decimals(address,http){
  if(/^0x0{40}$/.test(address))return 18;
  if(!decimalsCache.has(address)){const d=Number(await rpc('eth_call',[{to:address,data:'0x313ce567'},'latest'],http));if(!Number.isInteger(d)||d<0||d>36)throw Error('Invalid token decimals');decimalsCache.set(address,d);}
  return decimalsCache.get(address);
}
export async function discoverMarkets(token,http){
  const response=await fetch(`https://api.dexscreener.com/token-pairs/v1/robinhood/${token}`,{signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error('Market discovery is temporarily unavailable.');
  const pairs=await response.json();
  const usable=pairs.filter(p=>p.chainId==='robinhood'&&p.baseToken.address.toLowerCase()===token&&Number(p.priceUsd)>0&&Number(p.priceNative)>0)
    .map(p=>({...p,version:p.labels?.includes('v4')&&p.dexId==='uniswap'?'v4':p.labels?.includes('v3')?'v3':p.labels?.includes('v2')?'v2':null}))
    .filter(p=>p.version&&new RegExp(p.version==='v4'?'^0x[0-9a-f]{64}$':'^0x[0-9a-f]{40}$','i').test(p.pairAddress))
    .sort((a,b)=>(b.liquidity?.usd||0)-(a.liquidity?.usd||0)).slice(0,40);
  if(!usable.length)throw Object.assign(Error('No indexed V2, V3 or V4 market for this token on Robinhood Chain yet. Unmigrated bonding curves and other chains are not supported.'),{status:404});
  const td=await decimals(token,http), markets=[];
  for(const p of usable){try{const quote=p.quoteToken.address.toLowerCase();markets.push({...p,decimals:td,quoteDecimals:await decimals(quote,http),quoteUsd:Number(p.priceUsd)/Number(p.priceNative),token0:token<quote});}catch{ /* An unavailable quote must not disable the other markets. */ }}
  if(!markets.length)throw Error('Market quote metadata is temporarily unavailable.');
  return markets;
}
export function marketFilters(markets){
  const result=[];
  for(const version of ['v4','v3','v2']){
    const list=markets.filter(p=>p.version===version);if(!list.length)continue;
    result.push(version==='v4'?{address:MANAGER,topics:[TOPICS.v4,list.map(p=>p.pairAddress)]}:{address:list.map(p=>p.pairAddress),topics:[TOPICS[version]]});
  }
  return result;
}
