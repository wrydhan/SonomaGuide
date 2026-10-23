// Spatial contract: metres, Y-up, heading 0 points +Z; positive yaw turns left.
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const wrap=(x,n)=>(x%n+n)%n;
export const angle=(x)=>Math.atan2(Math.sin(x),Math.cos(x));
export class Circuit {
  constructor(data){Object.assign(this,data);this.n=this.points.length;this.length=0;this.segments=this.points.map((a,i)=>{const b=this.points[(i+1)%this.n],dx=b[0]-a[0],dz=b[2]-a[2],len=Math.hypot(dx,dz);const s={a,b,dx,dz,len,start:this.length};this.length+=len;return s;});}
  at(distance){const s=wrap(distance,this.length);let lo=0,hi=this.n-1;while(lo<hi){const m=(lo+hi+1)>>1;if(this.segments[m].start<=s)lo=m;else hi=m-1;}const q=this.segments[lo],t=(s-q.start)/q.len;return {x:q.a[0]+q.dx*t,z:q.a[2]+q.dz*t,y:q.a[1]+(q.b[1]-q.a[1])*t,heading:Math.atan2(q.dx,q.dz),i:lo,s};}
  sample(x,z,hint=null){let best=null,min=Infinity;const count=hint===null?this.n:81;
    for(let k=0;k<count;k++){const i=hint===null?k:wrap(hint+k-40,this.n),q=this.segments[i],t=clamp(((x-q.a[0])*q.dx+(z-q.a[2])*q.dz)/(q.len*q.len),0,1),px=q.a[0]+q.dx*t,pz=q.a[2]+q.dz*t,ds=(x-px)**2+(z-pz)**2;if(ds<min){min=ds;best={i,q,t,px,pz};}}
    const {i,q,t,px,pz}=best,j=(i+1)%this.n,lerp=(a,b)=>a+(b-a)*t,tx=q.dx/q.len,tz=q.dz/q.len,lateral=(x-px)*tz-(z-pz)*tx,cy=lerp(q.a[1],q.b[1]);
    const eA=this.edgeA[i],eB=this.edgeB[i],eAy=lerp(eA[1],this.edgeA[j][1]),eBy=lerp(eB[1],this.edgeB[j][1]),sideA=(eA[0]-q.a[0])*tz-(eA[2]-q.a[2])*tx;
    const bank=(eAy-eBy)/(sideA>0?13:-13),roadY=cy+bank*lateral,off=Math.abs(lateral)>this.halfWidth;
    let y=roadY;if(off){const arr=lateral>0?this.runoffA:this.runoffB;if(arr){const terrain=lerp(arr[i],arr[j]),u=clamp((Math.abs(lateral)-6.5)/3.5,0,1);y=roadY+(terrain-roadY)*u;}}
    const limitLeft=this.limitLeft?lerp(this.limitLeft[i],this.limitLeft[j]):10.5,limitRight=this.limitRight?lerp(this.limitRight[i],this.limitRight[j]):10.5;
    return {limitLeft,limitRight,i,t,x:px,z:pz,y,roadY,bank,cy,lateral,off,distance:Math.sqrt(min),heading:Math.atan2(tx,tz),s:q.start+q.len*t,slope:(q.b[1]-q.a[1])/q.len};
  }
}
export class Driving {
  constructor(circuit){this.track=circuit;this.best=null;try{const x=Number(localStorage.getItem('sonoma.best.v1'));if(x>0&&Number.isFinite(x))this.best=x;}catch{}this.newRun();}
  newRun(){const p=this.track.at(0);Object.assign(this,{x:p.x,z:p.z,y:p.y,yaw:p.heading,speed:0,steer:0,index:p.i,elapsed:0,lap:1,nextGate:1,laps:0,lastLap:null,penalty:0,started:false,off:false,wrongWay:false,collisions:0,notice:'',noticeTime:0,travelled:0});this.safe={...p};this.lastS=0;this.surface=this.track.sample(this.x,this.z,this.index);}
  recover(){this.x=this.safe.x;this.z=this.safe.z;this.yaw=this.safe.heading;this.index=this.safe.i;this.speed=0;this.steer=0;if(this.started){this.penalty+=5;this.elapsed+=5;}this.notice='BACK ON TRACK · +5 SEC';this.noticeTime=3;this.surface=this.track.sample(this.x,this.z,this.index);this.lastS=this.surface.s;this.y=this.surface.y;this.off=false;this.wrongWay=false;}
  tick(input,dt){const t=this.track,old=this.surface;
    const throttle=input.throttle||0,brake=input.brake||0,turn=input.turn||0;
    if(throttle>.05)this.started=true;
    if(this.started)this.elapsed+=dt;
    this.noticeTime=Math.max(0,this.noticeTime-dt);
    const maxSteer=.49/(1+Math.abs(this.speed)*.038),desired=turn*maxSteer;this.steer+=(desired-this.steer)*Math.min(1,dt*7);
    const drag=.24+this.speed*this.speed*.0018,acc=throttle*7.8*Math.max(.16,1-Math.abs(this.speed)/75)-brake*17-drag-(old.off?Math.abs(this.speed)*.9:0)-old.slope*8;
    this.speed=clamp(this.speed+acc*dt,0,73);if(this.speed<.08&&!throttle)this.speed=0;
    // Grip-limited yaw: steering still matters at speed but cannot instantly snap the car.
    const rate=clamp(this.speed/3.1*Math.tan(this.steer),-10/Math.max(this.speed,4),10/Math.max(this.speed,4));this.yaw+=rate*dt;
    const step=this.speed*dt;this.x+=Math.sin(this.yaw)*step;this.z+=Math.cos(this.yaw)*step;this.travelled+=step;
    let s=t.sample(this.x,this.z,this.index);
    // Corridor barrier is resolved every <=0.61m step, preventing tunneling.
    const boundary=s.lateral>0?s.limitLeft:s.limitRight;
    if(Math.abs(s.lateral)>boundary){const sign=Math.sign(s.lateral);this.x=s.x+Math.cos(s.heading)*(boundary-.05)*sign;this.z=s.z-Math.sin(s.heading)*(boundary-.05)*sign;this.speed*=.70;this.yaw+=angle(s.heading-this.yaw)*.18;this.collisions++;s=t.sample(this.x,this.z,s.i);this.notice='RUNOFF · LIFT AND REJOIN';this.noticeTime=1.4;}
    this.surface=s;this.index=s.i;this.y=s.y;this.off=s.off;this.wrongWay=Math.cos(this.yaw-s.heading)<-.3&&this.speed>2;
    if(!this.off&&!this.wrongWay&&this.speed>1)this.safe={x:s.x,z:s.z,y:s.cy,heading:s.heading,i:s.i,s:s.s};
    let ds=s.s-this.lastS;if(ds<-t.length/2)ds+=t.length;if(ds>t.length/2)ds-=t.length;
    const gateSize=t.length/24;
    if(ds>0&&ds<4){
      if(this.nextGate<24&&s.s>=this.nextGate*gateSize&&s.s<this.nextGate*gateSize+10)this.nextGate++;
      if(this.nextGate===24&&this.lastS>t.length-10&&s.s<10){this.lastLap=this.elapsed;this.laps++;this.lap++;if(!this.best||this.lastLap<this.best){this.best=this.lastLap;try{localStorage.setItem('sonoma.best.v1',String(this.best));}catch{}}this.notice='LAP COMPLETE · '+formatTime(this.lastLap);this.noticeTime=6;this.elapsed=0;this.penalty=0;this.nextGate=1;}
    }
    this.lastS=s.s;
  }
  get progress(){return clamp((this.nextGate-1)/24,0,1);}
}
export function formatTime(t){if(t===null||!Number.isFinite(t))return '—';const ms=Math.floor(t*1000),m=Math.floor(ms/60000),s=Math.floor(ms/1000)%60;return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}`;}
