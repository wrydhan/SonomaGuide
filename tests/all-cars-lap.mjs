import {botInput} from './driving-bot.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';import {Circuit,Driving} from '../racing/simulation.js';import {PROFILES} from '../racing/performance.js';
const track=new Circuit(JSON.parse(fs.readFileSync(new URL('../racing/route-smooth.json',import.meta.url))));
const report={};
for(const profile of Object.values(PROFILES)){
 const sim=new Driving(track,'test',profile);let peak=0;
 for(let steps=0;steps<120*600&&sim.laps<1;steps++){
  sim.tick(botInput(sim),1/120);peak=Math.max(peak,Math.abs(sim.surface.lateral));
 }
 report[profile.id]={laps:sim.laps,time:sim.lastLap,peakLateral:peak,collisions:sim.collisions};assert.equal(sim.laps,1);assert.equal(sim.collisions,0);assert.ok(peak<3.5);
}

if(process.env.REPORT_PATH)fs.writeFileSync(process.env.REPORT_PATH,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
