export function reconcileEvents(previous,snapshot,{initial=false,now=Date.now(),startedAt=now}={}){
  const next=new Map();let offset=0;
  for(const event of snapshot){
    const id=event.id||event.tx,known=previous.get(id);
    if(known){next.set(id,{...event,chainTs:event.ts,ts:known.ts});continue;}
    const fresh=!initial&&event.ts>=startedAt-2000&&now-event.ts<30000;
    next.set(id,{...event,chainTs:event.ts,ts:fresh?now+offset:event.ts});
    if(fresh)offset+=125;
  }
  return next;
}
