import { restPose } from './controller.js';
const smooth = x => { x=Math.max(0,Math.min(1,x)); return x*x*(3-2*x); };
export function decoratePose(pose, motor, age) {
  pose.groom = motor === 'groom' ? smooth(age / 400) : 0;
  if (motor === 'feed') pose.pitch = .06 * Math.sin(age / 160);
  pose.behavior = motor;
  return pose;
}
// Manual previews use an explicit authored motion path, independent of transaction data.
export function actionPose(action, seconds) {
  const p=restPose(), t=Math.max(0,seconds); p.time=t; p.behavior=action;
  if (action === 'flight' || action === 'hover') {
    const u=t%8, rise=smooth((u-.5)/1.3), fall=1-smooth((u-5.7)/1.6), lift=rise*fall;
    p.y=lift*(action==='hover'?2.4:3.5);
    p.flightBlend=lift; p.wingOpen=smooth(u/.5)*(1-smooth((u-7.2)/.6));
    p.launch=Math.max(0,1-Math.abs(u-1.1)); p.landing=smooth((u-5.7)/1.6)*fall;
    p.pitch=.06*lift; p.bank=action==='flight'?Math.sin(u)*.1*lift:0;
    p.z=action==='flight'?2.5*Math.sin(u*.7)*lift:0;
    p.x=action==='flight'?1.5*(1-Math.cos(u*.7))*lift:0;
    p.yaw=action==='flight'?.25*Math.sin(u*.7)*lift:0;
  } else if (action==='groom') p.groom=smooth(t/.4);
  else if (action==='feed') p.pitch=.08*Math.sin(t*6);
  else {
    const turn=action==='left'?1:action==='right'?-1:0;
    p.yawRate=turn*1.2; p.yaw=p.yawRate*t;
    p.velocity=action==='retreat'?-1.5:turn?0:2;
    p.phase=t*12; p.z=turn?0:p.velocity*t;
  }
  return p;
}
