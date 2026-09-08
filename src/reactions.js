import { restPose } from './controller.js';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const mix=(x,y,dt,tau=.3)=>x+(y-x)*(1-Math.exp(-dt/tau));
const BUY=[['rise','Lift off','Excited'],['dart','Upward dart','Playful'],['orbit','Climbing circle','Curious'],['hop','Spring upward','Delighted'],['flutter','Flutter climb','Eager']];
const SELL=[['dive','Dive and settle','Wary'],['swerve','Descending swerve','Startled'],['spiral','Spiral down','Uneasy'],['recoil','Recoil and dip','Alarmed'],['shake','Shake and descend','Irritated']];
export function reactionFor(event){
 let h=2166136261;for(const c of String(event.id||event.tx))h=Math.imul(h^c.charCodeAt(0),16777619)>>>0;
 const [kind,label,mood]=event.side==='fee'?['groom','Groom and flutter','Content']:(event.side==='sell'?SELL:BUY)[h%5];
 return {kind,label,mood,turn:(h>>>8)&1?1:-1,duration:3+1.4*(event.gain||.5)};
}
/** Expressive mascot choreography. Mood labels are artistic, not inferred biology. */
export class LiveMotion {
 constructor(){this.pose=restPose();this.age=100;this.reaction=null;this.startY=0;this.side='';this.gain=.5;}
 trigger(event){this.reaction=event.reaction||reactionFor(event);this.age=0;this.startY=this.pose.y;this.side=event.side;this.gain=event.gain||.5;}
 get active(){return this.reaction&&this.age<this.reaction.duration;}
 advance(dt){
  dt=clamp(dt,0,.05);const p=this.pose;p.time+=dt;this.age+=dt;
  const r=this.reaction,active=this.active, a=this.age, gain=this.gain;
  let height=0,speed=0,turn=0,groom=0,pitch=0;
  if(active){
   const kind=r.kind, sign=r.turn, envelope=Math.sin(Math.PI*clamp(a/r.duration,0,1));
   if(this.side==='buy')height=clamp(this.startY+1.5+gain*2,1.5,5.5);
   if(this.side==='sell')height=Math.max(0,this.startY-2.5-gain*2);
   // A sell from the ground gives a startled hop before dropping back down.
   if(this.side==='sell'&&this.startY<.3)height=Math.max(0,Math.sin(Math.PI*clamp(a/1.4,0,1)))*1.1;
   turn=sign*(.5+gain*.8);speed=1.2+gain*2;
   if(kind==='orbit'||kind==='spiral')turn=sign*2.4;
   if(kind==='dart'||kind==='swerve'){speed=3.8+gain;turn=sign*Math.sin(a*5)*2.8;}
   if(kind==='hop')height*=.65+.35*Math.abs(Math.sin(a*3.4));
   if(kind==='flutter')height+=.25*Math.sin(a*9);
   if(kind==='recoil')speed=-2.2*envelope;
   if(kind==='shake'){turn=sign*Math.sin(a*18)*3;pitch=Math.sin(a*20)*.1;speed=.6;}
   if(kind==='groom'){height=.15*Math.max(0,Math.sin(a*3));speed=0;groom=1;}
  }else if(p.y<.06&&a>9){groom=.7;pitch=.02*Math.sin(p.time*3);}
  // Keep the specimen in the clearing, steering smoothly instead of teleporting.
  const radius=Math.hypot(p.x,p.z);
  if(radius>4.5){const target=Math.atan2(-p.x,-p.z)+(speed<0?Math.PI:0);const diff=Math.atan2(Math.sin(target-p.yaw),Math.cos(target-p.yaw));turn=clamp(diff*3,-3.5,3.5);speed*=clamp((8-radius)/3.5,.15,1);}
  p.yawRate=mix(p.yawRate,turn,dt,.18);p.yaw+=p.yawRate*dt;
  p.velocity=mix(p.velocity,speed,dt,.23);p.x+=Math.sin(p.yaw)*p.velocity*dt;p.z+=Math.cos(p.yaw)*p.velocity*dt;
  const before=p.y;p.y=mix(p.y,Math.max(0,height),dt,this.side==='sell'?.32:.48);if(p.y<.015)p.y=0;
  const flying=p.y>.025||height>.1;
  p.flightBlend=mix(p.flightBlend,flying?1:0,dt,.12);p.wingOpen=mix(p.wingOpen,flying?1:active?.2:0,dt,.10);
  p.pitch=mix(p.pitch,pitch+clamp((p.y-before)/Math.max(.001,dt)*.03,-.22,.22),dt,.16);
  p.bank=mix(p.bank,clamp(-p.yawRate*.15,-.4,.4)*p.flightBlend,dt,.16);
  p.groom=mix(p.groom,groom,dt,.2);p.launch=clamp((p.y-before)*20,0,1);p.landing=flying&&height<p.y?clamp(1-p.y/1.2,0,1):0;
  p.phase+=dt*(8+Math.abs(p.velocity)*5);p.behavior=active?r.label:flying?'Landing':groom?'Grooming':'Resting';
  return {...p};
 }
}
