// Launch curves are calibrated to published standing-start targets on flat, dry tarmac.
// Brake/coast parameters are separate: releasing throttle is never full braking.
export const PROFILES = {
  daytona: {
    id:'daytona',mass:1650,wheelbase:2.651,maxSpeed:340/3.6,dragArea:.75,rolling:.013,engineBrake:.45,
    acceleration:[[0,0],[2.79,100],[7.34,200],[18.94,300],[45.94,338],[80,340]],
    brakeBase:11.2,brakeAero:.001,lateralBase:11.5,lateralAero:.0007,throttleResponse:.06,brakeResponse:.06,
    evidence:'Ferrari factory 0-100/200 and wheelbase; 340 km/h gameplay cap. Running mass, higher-speed curve, braking and tyre/chassis parameters estimated.'
  },
  ferrari296: {
    id:'ferrari296',mass:1600,wheelbase:2.600,maxSpeed:330/3.6,dragArea:.72,rolling:.013,engineBrake:.38,
    acceleration:[[0,0],[2.84,100],[7.24,200],[18.94,300],[38.94,328],[70,330]],
    brakeBase:11.868776213235,brakeAero:.0014,lateralBase:11.8,lateralAero:.0008,throttleResponse:.06,brakeResponse:.06,
    evidence:'Ferrari factory acceleration and 200-0 braking target; 330 km/h gameplay cap. Running mass, higher-speed curve and tyre/chassis parameters estimated.'
  },
  bugatti: {
    id:'bugatti',mass:1995,wheelbase:2.740,maxSpeed:380/3.6,dragArea:.70,rolling:.012,engineBrake:.24,
    acceleration:[[0,0],[1.94,100],[4.79,200],[9.59,300],[24.34,400],[39.94,435],[69.94,445]],
    brakeBase:10.3,brakeAero:.00085,lateralBase:11.3,lateralAero:.0006,throttleResponse:.06,brakeResponse:.06,
    evidence:'Manufacturer acceleration targets; braking, drag and lateral grip are estimates. Standard 380 km/h limiter.'
  },
  porsche: {
    id:'porsche',mass:1450,wheelbase:2.457,maxSpeed:296/3.6,dragArea:.862,rolling:.014,engineBrake:.50,
    acceleration:[[0,0],[3.14,100],[6.84,160],[10.54,200],[17.04,241.4016],[28.14,273.5885],[59.94,294],[99.94,296]],
    brakeBase:11.06523779318,brakeAero:.00147693335,lateralBase:11.38,lateralAero:.0010,throttleResponse:.06,brakeResponse:.06,
    evidence:'Base 992 GT3 RS factory acceleration; brake fit to instrumented PCCB test. Manthey-specific differences not measured.'
  },
  roadster: {
    id:'roadster',mass:2900,wheelbase:3.21,maxSpeed:250/3.6,dragArea:.85,rolling:.014,engineBrake:.35,
    acceleration:[[0,0],[4.5,100],[10,160],[18,200],[35,240],[65,250]],
    brakeBase:9.3,brakeAero:.0003,lateralBase:8.8,lateralAero:.0002,throttleResponse:.16,brakeResponse:.10,
    evidence:'Estimated luxury-EV proxy. Project Nightingale acceleration/braking specifications have not been published.'
  }
};
const G=9.80665;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const cache=new WeakMap();
function curve(profile){if(cache.has(profile))return cache.get(profile);const p=profile.acceleration.map(([t,kph])=>[t,kph/3.6]);const h=[],d=[];for(let i=0;i<p.length-1;i++){h.push(p[i+1][0]-p[i][0]);d.push((p[i+1][1]-p[i][1])/h[i]);}const m=p.map(()=>0);m[0]=d[0];m[m.length-1]=0;for(let i=1;i<p.length-1;i++){if(d[i-1]*d[i]>0){const w1=2*h[i]+h[i-1],w2=h[i]+2*h[i-1];m[i]=(w1+w2)/(w1/d[i-1]+w2/d[i]);}}const c={p,h,m};cache.set(profile,c);return c;}
function segment(c,i,u){const h=c.h[i],a=c.p[i][1],b=c.p[i+1][1],m=c.m[i]*h,n=c.m[i+1]*h;return {v:(2*u**3-3*u*u+1)*a+(u**3-2*u*u+u)*m+(-2*u**3+3*u*u)*b+(u**3-u*u)*n,a:((6*u*u-6*u)*a+(3*u*u-4*u+1)*m+(-6*u*u+6*u)*b+(3*u*u-2*u)*n)/h};}
export function launchAcceleration(speed,profile){const c=curve(profile);if(speed>=c.p.at(-1)[1])return 0;let i=0;while(i<c.p.length-2&&speed>c.p[i+1][1])i++;let lo=0,hi=1;for(let k=0;k<18;k++){const mid=(lo+hi)/2;if(segment(c,i,mid).v<speed)lo=mid;else hi=mid;}return Math.max(0,segment(c,i,(lo+hi)/2).a);}
export function resistance(speed,profile){return profile.rolling*G+.5*1.225*profile.dragArea*speed*speed/profile.mass+profile.engineBrake*Math.min(1,speed/8);}
export function stepLongitudinal(state,input,dt,profile,{grade=0,lateral=0,off=false}={}){
  const requestedBrake=clamp(input.brake||0,0,1),requestedThrottle=requestedBrake>.01?0:clamp(input.throttle||0,0,1);
  state.throttle+=(requestedThrottle-state.throttle)*(1-Math.exp(-dt/profile.throttleResponse));state.brake+=(requestedBrake-state.brake)*(1-Math.exp(-dt/profile.brakeResponse));
  const v=state.speed,passive=resistance(v,profile),lateralLimit=profile.lateralBase+profile.lateralAero*v*v;
  const remainingGrip=Math.sqrt(Math.max(.02,1-(Math.abs(lateral)/lateralLimit)**2));
  const launch=Math.min(launchAcceleration(v,profile),Math.max(0,(profile.maxSpeed-v)*.9));
  const drive=(launch+passive)*(requestedBrake>.01?0:state.throttle)*remainingGrip;
  const braking=(profile.brakeBase+profile.brakeAero*v*v)*state.brake*remainingGrip;
  const gravity=G*Math.sin(Math.atan(grade));
  let acceleration=drive-passive-braking-gravity-(Number(off)*(1.1+.035*v*v));
  if(v<.06&&requestedThrottle===0&&Math.abs(grade)<.01){state.speed=0;acceleration=0;}else state.speed=clamp(v+acceleration*dt,0,profile.maxSpeed);
  state.acceleration=acceleration;return (v+state.speed)*.5*dt;
}
