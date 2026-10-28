import {botInput} from './driving-bot.mjs';
import fs from 'node:fs';import assert from 'node:assert/strict';import {Circuit,Driving} from '../racing/simulation.js';
const track=new Circuit(JSON.parse(fs.readFileSync(new URL('../racing/route-smooth.json',import.meta.url))));const sim=new Driving(track);const report={length:track.length,samples:track.n};
assert.ok(track.length>4000&&track.length<4300);assert.ok(track.segments.every(x=>x.len>0&&x.len<2.1));
for(let i=0;i<1200;i++)sim.tick({throttle:1},1/120);report.acceleration={speed:sim.speed,travelled:sim.travelled};assert.ok(sim.travelled>100);sim.newRun();
// No credit for starting near the finish or crossing it backwards.
const place=s=>{const p=track.at(s);Object.assign(sim,{x:p.x,z:p.z,yaw:p.heading,index:p.i,speed:10});sim.surface=track.sample(p.x,p.z,p.i);sim.lastS=sim.surface.s;};place(track.length-1);for(let i=0;i<60;i++)sim.tick({throttle:0},1/120);assert.equal(sim.laps,0);sim.newRun();
let peakLateral=0,peakSpeed=0,steps=0;
for(;steps<120*600&&sim.laps<1;steps++){
 sim.tick(botInput(sim),1/120);peakLateral=Math.max(peakLateral,Math.abs(sim.surface.lateral));peakSpeed=Math.max(peakSpeed,sim.speed);
}
report.fullLap={laps:sim.laps,seconds:sim.lastLap,gate:sim.nextGate,steps,peakLateral,peakSpeed,collisions:sim.collisions,travelled:sim.travelled};assert.equal(sim.laps,1,'Bot must finish a valid lap');assert.ok(sim.lastLap>60);assert.ok(peakLateral<6.5,'Bot should stay on the circuit');
assert.ok(sim.best===sim.lastLap);
const old=sim.elapsed;sim.recover();assert.ok(sim.elapsed>=old+5);assert.equal(sim.speed,0);sim.newRun();assert.equal(sim.elapsed,0);assert.equal(sim.nextGate,1);assert.equal(sim.laps,0);report.reset='pass';
// Brake and high-speed runoff barrier are exercised independently.
place(100);sim.speed=50;sim.yaw=sim.surface.heading+Math.PI/2;for(let i=0;i<240;i++)sim.tick({throttle:1},1/120);assert.ok(Math.abs(sim.surface.lateral)<=10.51);assert.ok(sim.collisions>0);report.boundary={collisions:sim.collisions,lateral:sim.surface.lateral};
console.log(JSON.stringify(report,null,2));
