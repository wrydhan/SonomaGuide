import assert from 'node:assert/strict';
import fs from 'node:fs';import {Circuit,Driving,clamp,angle} from '../racing/simulation.js';import {PROFILES} from '../racing/performance.js';
const track=new Circuit(JSON.parse(fs.readFileSync(new URL('../racing/route-smooth.json',import.meta.url))));
const report={};
for(const profile of Object.values(PROFILES)){
 const sim=new Driving(track,'test',profile);let peak=0;
 for(let steps=0;steps<120*600&&sim.laps<1;steps++){
  const s=sim.surface,v=sim.speed,look=track.at(s.s+8+v*.45),err=angle(Math.atan2(look.x-sim.x,look.z-sim.z)-sim.yaw),steer=Math.atan(err*2.4*profile.wheelbase/Math.max(v,3)),maxSteer=.49/(1+v*.038);let safe=47;
  for(let d=10;d<110;d+=10){const a=track.at(s.s+d),b=track.at(s.s+d+10),curve=Math.abs(angle(b.heading-a.heading))/10,c=Math.sqrt(5/Math.max(curve,.001));safe=Math.min(safe,Math.sqrt(c*c+2*6*Math.max(0,d-15)));}
  sim.tick({throttle:v<safe-.7?1:0,brake:v>safe+.7?1:0,turn:clamp(steer/maxSteer,-1,1)},1/120);peak=Math.max(peak,Math.abs(sim.surface.lateral));
 }
 report[profile.id]={laps:sim.laps,time:sim.lastLap,peakLateral:peak,collisions:sim.collisions};assert.equal(sim.laps,1);assert.equal(sim.collisions,0);assert.ok(peak<1.8);
}

if(process.env.REPORT_PATH)fs.writeFileSync(process.env.REPORT_PATH,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
