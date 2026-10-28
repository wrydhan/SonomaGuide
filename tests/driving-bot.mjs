import {clamp,angle} from '../racing/simulation.js';
import {steeringLimit,CHASSIS} from '../racing/handling.js';
import {launchAcceleration,resistance} from '../racing/performance.js';
// Conservative path follower, not an ideal lap-time driver. Includes sideslip/yaw feedback.
export function botInput(sim){const track=sim.track,p=sim.profile,c=CHASSIS[p.id],s=sim.surface,v=sim.speed,look=track.at(s.s+8+v*.6),err=angle(Math.atan2(look.x-sim.x,look.z-sim.z)-sim.yaw-Math.atan2(sim.sideSpeed,Math.max(v,1))),rate=err*2.5;
 const steer=Math.atan(rate*p.wheelbase/Math.max(v,3))+rate*v/9.80665*(1/c.frontStiffness-1/c.rearStiffness)+.14*(rate-sim.yawRate);let safe=30;
 for(let d=10;d<140;d+=10){const a=track.at(s.s+d),b=track.at(s.s+d+10),curve=Math.abs(angle(b.heading-a.heading))/10,corner=Math.sqrt(2.8/Math.max(curve,.001));safe=Math.min(safe,Math.sqrt(corner*corner+2*3*Math.max(0,d-25)));}
 const demand=(safe-v)*1.6+resistance(v,p)+9.81*s.slope;
 return {analog:true,throttle:clamp(demand/Math.max(1,launchAcceleration(v,p)+resistance(v,p)),0,1),brake:clamp(-demand/p.brakeBase,0,1),turn:clamp(steer/steeringLimit(v,p),-1,1)};
}
