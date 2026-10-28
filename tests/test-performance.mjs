import fs from 'node:fs';
import assert from 'node:assert/strict';
import {PROFILES,stepLongitudinal} from '../racing/performance.js';
function launch(profile,dt=1/120){const state={speed:0,throttle:0,brake:0};let time=0;const reached={};for(let k=0;k<120/dt;k++){stepLongitudinal(state,{throttle:1},dt,profile);time+=dt;for(const target of [100,160,200,300,400])if(!reached[target]&&state.speed>=target/3.6)reached[target]=time;}return {reached,finalSpeed:state.speed*3.6};}
function stop(profile,kph){const state={speed:kph/3.6,throttle:0,brake:0};let distance=0,time=0;while(state.speed>.001&&time<30){distance+=stepLongitudinal(state,{brake:1},1/120,profile);time+=1/120;}assert.equal(state.speed,0);return {distance,time};}
const bugatti=launch(PROFILES.bugatti),porsche=launch(PROFILES.porsche),speedKey=launch({...PROFILES.bugatti,maxSpeed:445/3.6});
assert.ok(Math.abs(bugatti.reached[100]-2)<.03);assert.ok(bugatti.reached[200]<5);assert.ok(bugatti.reached[300]<10);assert.ok(speedKey.reached[400]<25);assert.ok(bugatti.finalSpeed<=380.01);
for(const [speed,target]of [[100,3.2],[160,6.9],[200,10.6]])assert.ok(Math.abs(porsche.reached[speed]-target)<.03);
const brake70=stop(PROFILES.porsche,70*1.609344),brake100=stop(PROFILES.porsche,100*1.609344);assert.ok(Math.abs(brake70.distance-133*.3048)<.1);assert.ok(Math.abs(brake100.distance-251*.3048)<.1);
for(const profile of Object.values(PROFILES)){
 const coast={speed:100/3.6,throttle:0,brake:0};for(let i=0;i<120;i++)stepLongitudinal(coast,{},1/120,profile);assert.ok(coast.speed>24&&coast.speed<100/3.6,'Coasting must be much gentler than braking');
 const uphill={speed:20,throttle:0,brake:0},downhill={...uphill};stepLongitudinal(uphill,{},.1,profile,{grade:.1});stepLongitudinal(downhill,{},.1,profile,{grade:-.1});assert.ok(downhill.speed>uphill.speed);
 const straight={speed:30,throttle:0,brake:0},corner={...straight};stepLongitudinal(straight,{brake:1},.1,profile);stepLongitudinal(corner,{brake:1},.1,profile,{lateral:profile.lateralBase*.9});assert.ok(corner.speed>straight.speed,'Cornering must share tire grip with braking');
 const overlapping={speed:30,throttle:1,brake:0};stepLongitudinal(overlapping,{throttle:1,brake:1},.1,profile);assert.ok(overlapping.acceleration<0,'Brake input must override throttle');
 const fine=launch(profile,1/240);const regular=launch(profile);assert.ok(Math.abs(fine.reached[100]-regular.reached[100])<.02);
}
const report={bugatti,porsche,speedKeyTestOnly:speedKey,porscheBraking:{mph70:brake70,mph100:brake100},bugattiBrakingEstimate100:stop(PROFILES.bugatti,100),status:'passed'};
console.log(JSON.stringify(report,null,2));
if(process.env.REPORT_PATH)fs.writeFileSync(process.env.REPORT_PATH,JSON.stringify(report,null,2));
