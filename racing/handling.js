// Planar dynamic single-track chassis. Body +Z forward, +X left, yaw +Y.
// Tyre forces own side velocity and yaw momentum; steering never writes yaw directly.
const G=9.80665;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const approach=(a,b,amount)=>a+clamp(b-a,-amount,amount);
// Chassis/tyre parameters are estimates, not manufacturer suspension telemetry.
export const CHASSIS={
 bugatti:{frontWeight:.44,cgHeight:.43,inertiaFactor:.23,frontStiffness:13,rearStiffness:15,lock:.56,ratio:14,track:1.71,rollGradient:.014,pitchGradient:.009,frequency:2.1,damping:.78},
 porsche:{frontWeight:.40,cgHeight:.45,inertiaFactor:.24,frontStiffness:15,rearStiffness:18,lock:.55,ratio:13,track:1.58,rollGradient:.011,pitchGradient:.008,frequency:2.5,damping:.80},
 roadster:{frontWeight:.50,cgHeight:.57,inertiaFactor:.26,frontStiffness:10,rearStiffness:12,lock:.58,ratio:16,track:1.70,rollGradient:.023,pitchGradient:.015,frequency:1.5,damping:.76}
};
export function resetHandling(s){Object.assign(s,{acceleration:0,steer:0,yawRate:0,sideSpeed:0,lateralAcceleration:0,frontSlip:0,rearSlip:0,frontUse:0,rearUse:0,frontLoad:0,rearLoad:0,bodyRoll:0,rollVelocity:0,bodyPitch:0,pitchVelocity:0,impact:0,tyreScrub:0,steeringDemand:0,gripFraction:1,wheelLoads:[0,0,0,0]});}
export function steeringLimit(speed,p,assist=true){const c=CHASSIS[p.id];if(!assist)return c.lock;const grip=p.lateralBase+p.lateralAero*speed*speed;return Math.min(c.lock,Math.atan(p.wheelbase*grip*1.06/Math.max(speed*speed,1))+grip/G*(1/c.frontStiffness-1/c.rearStiffness)+.028);}
export function updateSteering(s,input,dt,p){const c=CHASSIS[p.id],limit=steeringLimit(s.speed,p,input.steeringAssist!==false),turn=clamp(input.turn||0,-1,1);s.steeringDemand=turn;
 const desired=turn*limit,analog=input.analog===true,counter=desired*s.steer<0,release=Math.abs(desired)<Math.abs(s.steer);
 const rate=(analog?2.8:counter?1.8:release?1.35:.95)/(1+s.speed*(analog?.012:.035));
 s.steer=approach(s.steer,desired,rate*dt);return s.steer;
}
// Bounded brush-like tyre curve: linear near centre, progressive saturation.
function tyre(slip,stiffness,capacity){return capacity*Math.tanh(stiffness*slip/Math.max(capacity,1));}
function spring(s,key,velocity,target,dt,frequency,damping){const w=2*Math.PI*frequency;s[velocity]+=(w*w*(target-s[key])-2*damping*w*s[velocity])*dt;s[key]+=s[velocity]*dt;}
export function stepHandling(s,dt,p,{bank=0,lateral=0,headingError=0,halfWidth=6.5}={}){
 const c=CHASSIS[p.id],v=s.speed,L=p.wheelbase,a=L*(1-c.frontWeight),b=L*c.frontWeight,m=p.mass,I=m*L*L*c.inertiaFactor;
 const loadTransfer=m*clamp(s.acceleration,-18,15)*c.cgHeight/L;
 const frontLoad=clamp(m*G*c.frontWeight-loadTransfer,m*G*.12,m*G*.88),rearLoad=m*G-frontLoad;
 s.frontLoad=frontLoad;s.rearLoad=rearLoad;
 const lateralG=(p.lateralBase+p.lateralAero*v*v)/G;
 const edgeGrip=lat=>{const t=clamp((Math.abs(lat)-halfWidth+.12)/.35,0,1);return 1-.52*t*t*(3-2*t);};
 const frontLat=lateral+Math.sin(headingError)*a,rearLat=lateral-Math.sin(headingError)*b,halfTrack=Math.cos(headingError)*c.track/2;
 const surfaceGrip=[edgeGrip(frontLat+halfTrack),edgeGrip(frontLat-halfTrack),edgeGrip(rearLat+halfTrack),edgeGrip(rearLat-halfTrack)];
 const lateralTransfer=m*s.lateralAcceleration*c.cgHeight/c.track,frontTransfer=clamp(lateralTransfer*(c.frontWeight+.05),-frontLoad*.45,frontLoad*.45),rearTransfer=clamp(lateralTransfer*(1-c.frontWeight-.05),-rearLoad*.45,rearLoad*.45);
 const loads=[frontLoad/2-frontTransfer,frontLoad/2+frontTransfer,rearLoad/2-rearTransfer,rearLoad/2+rearTransfer];s.wheelLoads=loads;s.gripFraction=surfaceGrip.reduce((a,b)=>a+b,0)/4;
 // Four contact load/grip budgets feed the two axle forces. Loaded tyres gain sublinearly.
 const loadCapacity=(i,reference)=>reference*Math.pow(loads[i]/reference,.94)*surfaceGrip[i];
 // Acceleration/braking share grip with cornering; ABS prevents a wheel-lock singularity.
 const longUse=clamp(Math.abs(s.acceleration)/(s.brake>.05?p.brakeBase+p.brakeAero*v*v:Math.max(p.lateralBase,15)),0,.97);
 const available=Math.sqrt(1-longUse*longUse);
 const frontReference=m*G*c.frontWeight/2,rearReference=m*G*(1-c.frontWeight)/2;
 const frontCap=(loadCapacity(0,frontReference)+loadCapacity(1,frontReference))*lateralG*available,rearCap=(loadCapacity(2,rearReference)+loadCapacity(3,rearReference))*lateralG*available;
 const frontStiff=m*G*c.frontWeight*c.frontStiffness*Math.pow(frontLoad/(m*G*c.frontWeight),.8);
 const rearStiff=m*G*(1-c.frontWeight)*c.rearStiffness*Math.pow(rearLoad/(m*G*(1-c.frontWeight)),.8);
 const safeV=Math.max(v,2.5),alphaF=s.steer-Math.atan2(s.sideSpeed+a*s.yawRate,safeV),alphaR=-Math.atan2(s.sideSpeed-b*s.yawRate,safeV);
 const ff=tyre(alphaF,frontStiff,frontCap),fr=tyre(alphaR,rearStiff,rearCap),fy=ff*Math.cos(s.steer)+fr;
 const bankGravity=-G*Math.sin(Math.atan(bank));
 // Blend to a no-slip parking solution below 6 m/s to avoid low-speed stiffness.
 const blend=clamp((v-3)/3,0,1),kinRate=v*Math.tan(s.steer)/L,kinSide=b*kinRate;
 const referenceRate=clamp(v*Math.tan(s.steer)/(L+v*v/G*(1/c.frontStiffness-1/c.rearStiffness)),-lateralG*G/Math.max(v,3),lateralG*G/Math.max(v,3));
 const excess=Math.abs(s.yawRate)>Math.abs(referenceRate)*1.15+.04||Math.abs(s.sideSpeed)>v*.09;
 // Bounded stability-control yaw moment approximates selective wheel braking.
 const slipCorrection=clamp(Math.atan2(s.sideSpeed,Math.max(v,3))*1.8,-.4,.4);
 const stability=clamp((referenceRate+slipCorrection-s.yawRate)*I*(excess?5:.6),-m*G*L*.10,m*G*L*.10);
 const rateDot=(a*ff*Math.cos(s.steer)-b*fr+stability)/I;
 const sideDot=fy/m-v*s.yawRate+bankGravity;
 s.yawRate+=rateDot*dt*blend+(kinRate-s.yawRate)*(1-Math.exp(-dt*14))*(1-blend);
 s.sideSpeed+=sideDot*dt*blend+(kinSide-s.sideSpeed)*(1-Math.exp(-dt*14))*(1-blend);
 // Energy-consistent longitudinal coupling: tyre steering drag and rotating body basis.
 s.speed=Math.max(0,s.speed+(s.sideSpeed*s.yawRate-ff*Math.sin(s.steer)/m-(excess?Math.abs(stability)/(m*c.track)*.3:0))*dt*blend);
 s.yaw+=s.yawRate*dt;
 s.lateralAcceleration=(fy/m+bankGravity)*blend+v*kinRate*(1-blend);
 s.frontSlip=alphaF;s.rearSlip=alphaR;s.frontUse=Math.abs(ff)/Math.max(frontCap,1);s.rearUse=Math.abs(fr)/Math.max(rearCap,1);
 s.tyreScrub=clamp((Math.max(Math.abs(alphaF),Math.abs(alphaR))-.045)/.16,0,1)*clamp(v/12,0,1);
 s.impact*=Math.exp(-dt*10);
 spring(s,'bodyRoll','rollVelocity',clamp(s.lateralAcceleration*c.rollGradient,-.07,.07),dt,c.frequency,c.damping);
 spring(s,'bodyPitch','pitchVelocity',clamp(s.acceleration*c.pitchGradient,-.055,.055),dt,c.frequency,c.damping);
 if(v<.1){s.yawRate=0;s.sideSpeed=0;}
 return {dx:(Math.sin(s.yaw)*s.speed+Math.cos(s.yaw)*s.sideSpeed)*dt,dz:(Math.cos(s.yaw)*s.speed-Math.sin(s.yaw)*s.sideSpeed)*dt};
}
export function wheelAngles(steer,p){const c=CHASSIS[p.id];if(Math.abs(steer)<1e-5)return [0,0];const r=p.wheelbase/Math.tan(steer);return [Math.atan(p.wheelbase/(r-c.track/2)),Math.atan(p.wheelbase/(r+c.track/2))];}
