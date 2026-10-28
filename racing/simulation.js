import {CHASSIS,resetHandling,updateSteering,stepHandling} from './handling.js';
import {PROFILES,stepLongitudinal} from './performance.js';
// Spatial contract: metres, Y-up, heading 0 points +Z; positive yaw turns left.
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const wrap=(x,n)=>(x%n+n)%n;
export const angle=(x)=>Math.atan2(Math.sin(x),Math.cos(x));
function hermite(a,b,ma,mb,length,t){const t2=t*t,t3=t2*t;return {value:(2*t3-3*t2+1)*a+(t3-2*t2+t)*length*ma+(-2*t3+3*t2)*b+(t3-t2)*length*mb,derivative:((6*t2-6*t)*a+(3*t2-4*t+1)*length*ma+(-6*t2+6*t)*b+(3*t2-2*t)*length*mb)/length};}
export class Circuit {
  constructor(data){
    Object.assign(this,data);this.n=this.points.length;this.length=0;this.grid=new Map();
    this.segments=this.points.map((a,i)=>{const b=this.points[(i+1)%this.n],dx=b[0]-a[0],dz=b[2]-a[2],len=Math.hypot(dx,dz);const q={a,b,dx,dz,len,start:this.length};this.length+=len;return q;});
    this.grades=this.segments.map((q,i)=>{const p=this.segments[wrap(i-1,this.n)];return ((p.b[1]-p.a[1])/p.len*q.len+(q.b[1]-q.a[1])/q.len*p.len)/(p.len+q.len);});
    this.banks=this.segments.map((q,i)=>{const a=this.edgeA[i],b=this.edgeB[i],side=(a[0]-q.a[0])*q.dz/q.len-(a[2]-q.a[2])*q.dx/q.len;return (a[1]-b[1])/(side>0?13:-13);});
    this.bankSlopes=this.banks.map((b,i)=>{const prev=wrap(i-1,this.n),next=(i+1)%this.n;return (this.banks[next]-this.banks[prev])/(this.segments[prev].len+this.segments[i].len);});
    // Shared spatial query used by runtime deformation and surface placement.
    this.segments.forEach((q,i)=>{for(let x=Math.floor((Math.min(q.a[0],q.b[0])-28)/32);x<=Math.floor((Math.max(q.a[0],q.b[0])+28)/32);x++)for(let z=Math.floor((Math.min(q.a[2],q.b[2])-28)/32);z<=Math.floor((Math.max(q.a[2],q.b[2])+28)/32);z++){const key=x+':'+z;if(!this.grid.has(key))this.grid.set(key,[]);this.grid.get(key).push(i);}});
  }
  profile(i,t){const j=(i+1)%this.n,q=this.segments[i],height=hermite(q.a[1],q.b[1],this.grades[i],this.grades[j],q.len,t),bank=hermite(this.banks[i],this.banks[j],this.bankSlopes[i],this.bankSlopes[j],q.len,t);return {cy:height.value,slope:height.derivative,bank:bank.value};}
  at(distance){const s=wrap(distance,this.length);let lo=0,hi=this.n-1;while(lo<hi){const m=(lo+hi+1)>>1;if(this.segments[m].start<=s)lo=m;else hi=m-1;}const q=this.segments[lo],t=(s-q.start)/q.len,h=this.profile(lo,t);return {x:q.a[0]+q.dx*t,z:q.a[2]+q.dz*t,y:h.cy,heading:Math.atan2(q.dx,q.dz),i:lo,s,...h};}
  sample(x,z,hint=null){
    let best=null,min=Infinity;const candidates=hint===null?this.grid.get(Math.floor(x/32)+':'+Math.floor(z/32)):null,count=hint!==null?81:candidates?.length||this.n;
    for(let k=0;k<count;k++){const i=hint!==null?wrap(hint+k-40,this.n):candidates?candidates[k]:k,q=this.segments[i],t=clamp(((x-q.a[0])*q.dx+(z-q.a[2])*q.dz)/(q.len*q.len),0,1),px=q.a[0]+q.dx*t,pz=q.a[2]+q.dz*t,d=(x-px)**2+(z-pz)**2;if(d<min){min=d;best={i,q,t,px,pz};}}
    const {i,q,t,px,pz}=best,j=(i+1)%this.n,h=this.profile(i,t),lerp=(a,b)=>a+(b-a)*t,lateral=(x-px)*q.dz/q.len-(z-pz)*q.dx/q.len,roadY=h.cy+h.bank*lateral,off=Math.abs(lateral)>this.halfWidth;
    let y=roadY;if(off){const arr=lateral>0?this.runoffA:this.runoffB;if(arr){const terrain=lerp(arr[i],arr[j]),u=clamp((Math.abs(lateral)-6.5)/3.5,0,1);y=roadY+(terrain-roadY)*u;}}
    return {...h,limitLeft:this.limitLeft?lerp(this.limitLeft[i],this.limitLeft[j]):10.5,limitRight:this.limitRight?lerp(this.limitRight[i],this.limitRight[j]):10.5,i,t,x:px,z:pz,y,roadY,lateral,off,distance:Math.sqrt(min),heading:Math.atan2(q.dx,q.dz),s:q.start+q.len*t};
  }
}
export class Driving {
  constructor(circuit,bestKey='sonoma.best.v3.porsche',profile=PROFILES.porsche){this.profile=profile;this.track=circuit;this.bestKey=bestKey;this.best=null;try{const x=Number(localStorage.getItem(this.bestKey));if(x>0&&Number.isFinite(x))this.best=x;}catch{}this.newRun();}
  newRun(){const p=this.track.at(0);Object.assign(this,{x:p.x,z:p.z,y:p.y,yaw:p.heading,speed:0,steer:0,throttle:0,brake:0,acceleration:0,index:p.i,elapsed:0,lap:1,nextGate:1,laps:0,lastLap:null,penalty:0,started:false,off:false,wrongWay:false,collisions:0,notice:'',noticeTime:0,travelled:0});resetHandling(this);this.previous=null;this.safe={...p};this.lastS=0;this.surface=this.track.sample(this.x,this.z,this.index);}
  recover(){this.x=this.safe.x;this.z=this.safe.z;this.yaw=this.safe.heading;this.index=this.safe.i;this.speed=0;resetHandling(this);this.throttle=0;this.brake=0;if(this.started){this.penalty+=5;this.elapsed+=5;}this.notice='BACK ON TRACK · +5 SEC';this.noticeTime=3;this.surface=this.track.sample(this.x,this.z,this.index);this.lastS=this.surface.s;this.y=this.surface.y;this.off=false;this.wrongWay=false;this.previous=null;}
  tick(input,dt){this.previous={x:this.x,y:this.y,z:this.z,yaw:this.yaw};const t=this.track,old=this.surface;
    const throttle=input.throttle||0;
    if(throttle>.05)this.started=true;
    if(this.started)this.elapsed+=dt;
    this.noticeTime=Math.max(0,this.noticeTime-dt);
    const p=this.profile;updateSteering(this,input,dt,p);
    const headingError=this.yaw-old.heading,grade=old.slope*Math.cos(headingError)+old.bank*Math.sin(headingError);
    const vx=Math.sin(this.yaw)*this.speed+Math.cos(this.yaw)*this.sideSpeed,vz=Math.cos(this.yaw)*this.speed-Math.sin(this.yaw)*this.sideSpeed;
    stepLongitudinal(this,input,dt,p,{grade,lateral:this.lateralAcceleration,off:clamp((Math.abs(old.lateral)+CHASSIS[p.id].track/2-t.halfWidth)/CHASSIS[p.id].track,0,1)});
    const motion=stepHandling(this,dt,p,{bank:old.bank*Math.cos(headingError)-old.slope*Math.sin(headingError),lateral:old.lateral,headingError,halfWidth:t.halfWidth});
    const dx=(vx*dt+motion.dx)*.5,dz=(vz*dt+motion.dz)*.5;this.x+=dx;this.z+=dz;this.travelled+=Math.hypot(dx,dz);
    let s=t.sample(this.x,this.z,this.index);
    // Corridor barrier is resolved each fixed step (under 0.88 m at the standard Bugatti limiter).
    const boundary=s.lateral>0?s.limitLeft:s.limitRight;
    if(Math.abs(s.lateral)>boundary){const sign=Math.sign(s.lateral);this.x=s.x+Math.cos(s.heading)*(boundary-.05)*sign;this.z=s.z-Math.sin(s.heading)*(boundary-.05)*sign;const vx=Math.sin(this.yaw)*this.speed+Math.cos(this.yaw)*this.sideSpeed,vz=Math.cos(this.yaw)*this.speed-Math.sin(this.yaw)*this.sideSpeed;
      const nx=Math.cos(s.heading)*sign,nz=-Math.sin(s.heading)*sign,normalSpeed=Math.max(0,vx*nx+vz*nz),outX=(vx-nx*normalSpeed)*.9,outZ=(vz-nz*normalSpeed)*.9;
      this.speed=Math.max(0,outX*Math.sin(this.yaw)+outZ*Math.cos(this.yaw));this.sideSpeed=outX*Math.cos(this.yaw)-outZ*Math.sin(this.yaw);this.yawRate*=.45;this.impact=Math.min(1,normalSpeed/12);this.collisions++;s=t.sample(this.x,this.z,s.i);this.notice='RUNOFF · LIFT AND REJOIN';this.noticeTime=1.4;}
    this.surface=s;this.index=s.i;this.y=s.y;this.off=s.off;this.wrongWay=Math.cos(this.yaw-s.heading)<-.3&&this.speed>2;
    if(!this.off&&!this.wrongWay&&this.speed>1)this.safe={x:s.x,z:s.z,y:s.cy,heading:s.heading,i:s.i,s:s.s};
    let ds=s.s-this.lastS;if(ds<-t.length/2)ds+=t.length;if(ds>t.length/2)ds-=t.length;
    const gateSize=t.length/24;
    if(ds>0&&ds<4){
      if(this.nextGate<24&&s.s>=this.nextGate*gateSize&&s.s<this.nextGate*gateSize+10)this.nextGate++;
      if(this.nextGate===24&&this.lastS>t.length-10&&s.s<10){this.lastLap=this.elapsed;this.laps++;this.lap++;if(!this.best||this.lastLap<this.best){this.best=this.lastLap;try{localStorage.setItem(this.bestKey,String(this.best));}catch{}}this.notice='LAP COMPLETE · '+formatTime(this.lastLap);this.noticeTime=6;this.elapsed=0;this.penalty=0;this.nextGate=1;}
    }
    this.lastS=s.s;
  }
  get progress(){return clamp((this.nextGate-1)/24,0,1);}
}
export function formatTime(t){if(t===null||!Number.isFinite(t))return '—';const ms=Math.floor(t*1000),m=Math.floor(ms/60000),s=Math.floor(ms/1000)%60;return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}`;}
