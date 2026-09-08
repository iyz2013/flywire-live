import { LiveMotion } from './reactions.js';
import { ingestPons } from './tape.js';

export class ColonyState {
  constructor(startedAt=Date.now()){this.startedAt=startedAt;this.agents=new Map();this.seen=new Set();this.events=[];}
  accept(data, now=Date.now()){
    const tokens=data.tokens||[],active=new Set(tokens.map(t=>t.address));
    for(const key of this.agents.keys())if(!active.has(key))this.agents.delete(key);
    for(const token of tokens){let a=this.agents.get(token.address);if(!a){a={token,motion:new LiveMotion(),lastPulse:0,last:null,events:[],observed:0};this.agents.set(token.address,a);}a.token=token;}
    this.agents=new Map(tokens.map(t=>[t.address,this.agents.get(t.address)]));
    const pulses=[];
    for(const raw of data.events||[]){const key=raw.token+':'+raw.id;if(this.seen.has(key))continue;this.seen.add(key);const a=this.agents.get(raw.token);if(!a||raw.ts<this.startedAt)continue;
      const event=ingestPons([...a.events,raw],{dust:0,maxPulses:Infinity}).events.at(-1);
      if(!event||event.id!==raw.id)continue;
      a.events.push(raw);if(a.events.length>100)a.events.shift();a.observed++;a.last=event;this.events.push({...event,token:raw.token});
      if(now-raw.ts<30000){a.motion.trigger(event);a.lastPulse=now;pulses.push({agent:a,event});}
    }
    while(this.seen.size>3000)this.seen.delete(this.seen.values().next().value);
    this.events=this.events.filter(e=>active.has(e.token)).slice(-200);
    return pulses;
  }
}
