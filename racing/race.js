import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {Circuit,Driving,clamp,angle,wrap,formatTime} from './simulation.js';
const $=id=>document.getElementById(id),canvas=$('world');
const coarse=matchMedia('(pointer:coarse)').matches;
const debug=new URLSearchParams(location.search).has('debug');
let renderer;
try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});}catch(e){$('load-status').textContent='WebGL is unavailable. Try a current browser with graphics acceleration enabled.';throw e;}
renderer.setPixelRatio(Math.min(devicePixelRatio,coarse?1.4:1.7));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.9;
renderer.shadowMap.enabled=!coarse;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
const scene=new THREE.Scene();scene.background=new THREE.Color('#a7c5d6');scene.fog=new THREE.Fog('#a7c5d6',2500,8500);
const camera=new THREE.PerspectiveCamera(68,1,.06,12000);
const hemi=new THREE.HemisphereLight(0xdcebf5,0x9b8052,1.3);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffefd5,2.4);sun.position.set(-900,1300,700);sun.castShadow=!coarse;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-1000,right:1000,top:1000,bottom:-1000,near:100,far:4000});sun.shadow.bias=-.0003;sun.shadow.normalBias=.5;scene.add(sun,sun.target);
const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();const env=pmrem.fromScene(room,.04);scene.environment=env.texture;scene.environmentIntensity=.5;room.dispose();pmrem.dispose();
const car=new THREE.Group();scene.add(car);
let track,sim,carModel,wheels=[],frontWheels=[],running=false,loaded=false,mode='driver',guide,guideOn=true,frames=0,last=0,accumulator=0,spin=0,loadingCar=0,loadingTrack=0;
const keys=new Set(),touch=new Set();
const input=()=>({throttle:Number(keys.has('KeyW')||keys.has('ArrowUp')||touch.has('throttle')),brake:Number(keys.has('KeyS')||keys.has('ArrowDown')||keys.has('Space')||touch.has('brake')),turn:Number(keys.has('KeyA')||keys.has('ArrowLeft')||touch.has('left'))-Number(keys.has('KeyD')||keys.has('ArrowRight')||touch.has('right'))});
const clearInput=()=>{keys.clear();touch.clear();document.querySelectorAll('.held').forEach(x=>x.classList.remove('held'));};
function pause(){if(!loaded||!running)return;running=false;clearInput();audio.set(false,0,0);$('menu').hidden=false;$('hud').hidden=true;$('start').innerHTML='Resume driving <span>↗</span>';$('restart').hidden=false;$('load-status').textContent='PAUSED · The clock is stopped.';}
function start(){if(!loaded)return;clearInput();running=true;accumulator=0;last=performance.now();$('menu').hidden=true;$('hud').hidden=false;audio.unlock();canvas.focus();}
function changeCamera(){mode=mode==='driver'?'chase':'driver';$('camera').textContent=mode==='driver'?'Chase view':'Driver view';updatePose(1,true);}
const controlKeys=new Set(['KeyW','KeyS','KeyA','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyR','KeyC','Escape']);
window.addEventListener('keydown',e=>{if(!controlKeys.has(e.code))return;e.preventDefault();if(e.repeat)return;if(e.code==='Escape'){running?pause():loaded&&start();return;}if(!running)return;if(e.code==='KeyR'){sim.recover();updatePose(1,true);}else if(e.code==='KeyC')changeCamera();else keys.add(e.code);});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
for(const b of document.querySelectorAll('[data-control]')){b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);touch.add(b.dataset.control);b.classList.add('held');});const release=()=>{touch.delete(b.dataset.control);b.classList.remove('held');};for(const type of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(type,release);}
$('start').onclick=start;$('restart').onclick=()=>{sim.newRun();spin=0;updatePose(1,true);start();};$('pause').onclick=pause;$('camera').onclick=changeCamera;$('recover').onclick=()=>{sim.recover();updatePose(1,true);};
$('line').onclick=()=>{guideOn=!guideOn;guide.visible=guideOn;$('line').textContent=guideOn?'Guide on':'Guide off';$('line').setAttribute('aria-pressed',String(guideOn));};
// Gesture-unlocked synthesis. No audio files, remote services, or auto-play.
class EngineAudio{
 constructor(){this.enabled=false;this.ctx=null;}
 unlock(){if(!this.enabled)return;try{if(!this.ctx){this.ctx=new AudioContext();this.gain=this.ctx.createGain();this.filter=this.ctx.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=800;this.osc=this.ctx.createOscillator();this.osc.type='sawtooth';this.osc.frequency.value=35;this.sub=this.ctx.createOscillator();this.sub.type='triangle';this.sub.frequency.value=18;this.osc.connect(this.filter);this.sub.connect(this.filter);this.filter.connect(this.gain);this.gain.connect(this.ctx.destination);this.gain.gain.value=0;this.osc.start();this.sub.start();}this.ctx.resume().catch(()=>{});}catch{this.enabled=false;$('sound').textContent='Sound unavailable';}}
 set(active,speed,throttle){if(!this.ctx)return;const now=this.ctx.currentTime,rpm=900+(speed*38)%5200;this.osc.frequency.setTargetAtTime(rpm/20,now,.09);this.sub.frequency.setTargetAtTime(rpm/40,now,.09);this.filter.frequency.setTargetAtTime(400+speed*18+throttle*400,now,.12);this.gain.gain.setTargetAtTime(this.enabled&&active?.018+throttle*.009:0,now,.08);}
}
const audio=new EngineAudio();$('sound').onclick=()=>{audio.enabled=!audio.enabled;audio.unlock();$('sound').textContent=audio.enabled?'Sound off':'Sound on';$('sound').setAttribute('aria-pressed',String(audio.enabled));if(!audio.enabled)audio.set(false,0,0);};
function loading(){const p=Math.round((loadingCar+loadingTrack)*50);$('loading').value=p;}
async function loadGLB(url,onProgress){return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url,e=>{if(e.total){onProgress(e.loaded/e.total);loading();}});}
const previewPosition=new THREE.Vector3(0,1,0),look=new THREE.Vector3(),forward=new THREE.Vector3(),up=new THREE.Vector3(0,1,0),localEye=new THREE.Vector3(.36,1.16,-.55),localLook=new THREE.Vector3(.36,1.12,35),chaseEye=new THREE.Vector3(0,3.5,-9),chaseLook=new THREE.Vector3(0,1,14);
function updatePose(dt,snap=false){if(!sim)return;const s=sim.surface;car.position.set(sim.x,sim.y+.045,sim.z);car.rotation.order='YXZ';car.rotation.set(-Math.atan(s.slope),sim.yaw,Math.atan(s.bank),'YXZ');car.updateMatrixWorld(true);
 for(const w of frontWheels)w.rotation.y=sim.steer;for(const w of wheels){for(const child of w.children){child.rotation.x=spin;}}
 const eye=car.localToWorld((mode==='driver'?localEye:chaseEye).clone()),target=car.localToWorld((mode==='driver'?localLook:chaseLook).clone());
 if(mode==='driver'||snap)camera.position.copy(eye);else camera.position.lerp(eye,1-Math.exp(-dt*7));camera.up.copy(up);camera.lookAt(target);camera.fov=mode==='driver'?68:58;camera.updateProjectionMatrix();
}
function makeGuide(){const g=new THREE.BufferGeometry();const v=new Float32Array([-.48,0,-.7,0,0,0,.48,0,-.7,.35,0,-.82,0,0,-.3,-.35,0,-.82]);g.setAttribute('position',new THREE.BufferAttribute(v,3));g.setIndex([0,1,5,5,1,4,1,2,4,4,2,3]);g.computeVertexNormals();const count=Math.floor(track.length/22),mat=new THREE.MeshBasicMaterial({color:'#d9ef9c',transparent:true,opacity:.6,side:THREE.DoubleSide,depthWrite:false});guide=new THREE.InstancedMesh(g,mat,count);const dummy=new THREE.Object3D();for(let i=0;i<count;i++){const p=track.at(i*22);dummy.position.set(p.x,p.y+.065,p.z);dummy.rotation.y=p.heading;dummy.updateMatrix();guide.setMatrixAt(i,dummy.matrix);}guide.instanceMatrix.needsUpdate=true;guide.frustumCulled=false;scene.add(guide);}
const map=$('map'),ctx=map.getContext('2d');let mapTransform;
function drawMap(){if(!track)return;if(!mapTransform){const xs=track.points.map(x=>x[0]),zs=track.points.map(x=>x[2]),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs),scale=Math.min(240/(maxX-minX),255/(maxZ-minZ));mapTransform={minX,minZ,scale};}const {minX,minZ,scale}=mapTransform;const px=x=>20+(x-minX)*scale,pz=z=>20+(z-minZ)*scale;ctx.clearRect(0,0,280,300);ctx.beginPath();track.points.forEach((p,i)=>i?ctx.lineTo(px(p[0]),pz(p[2])):ctx.moveTo(px(p[0]),pz(p[2])));ctx.closePath();ctx.strokeStyle='#14252b';ctx.lineWidth=9;ctx.stroke();ctx.strokeStyle='#dce6df';ctx.lineWidth=3;ctx.stroke();const start=track.points[0];ctx.fillStyle='#d4ed9b';ctx.fillRect(px(start[0])-4,pz(start[2])-4,8,8);ctx.save();ctx.translate(px(sim.x),pz(sim.z));ctx.rotate(-sim.yaw);ctx.beginPath();ctx.moveTo(0,9);ctx.lineTo(-5,-6);ctx.lineTo(5,-6);ctx.closePath();ctx.fillStyle='#ddf7a3';ctx.fill();ctx.strokeStyle='#182920';ctx.lineWidth=2;ctx.stroke();ctx.restore();}
function updateHUD(){if(!sim)return;$('speed').textContent=Math.round(sim.speed*3.6);$('time').textContent=formatTime(sim.elapsed);$('best').textContent=formatTime(sim.best);$('lap-label').textContent='TIME TRIAL / LAP '+String(sim.lap).padStart(2,'0');$('surface').textContent=sim.wrongWay?'WRONG WAY':sim.off?'OFF TRACK · LOW GRIP':'ON CIRCUIT';$('surface').style.color=sim.off||sim.wrongWay?'#ffcb9f':'#d5e79f';$('rpm').firstElementChild.style.width=clamp(sim.speed/73*100,0,100)+'%';$('notice').textContent=sim.noticeTime>0?sim.notice:sim.wrongWay?'TURN AROUND TO CONTINUE THE LAP':'';$('progress-label').textContent=Math.floor(sim.progress*100)+'% COMPLETE';
 const near=track.at(sim.surface.s+35),far=track.at(sim.surface.s+100),bend=angle(far.heading-near.heading);$('corner').textContent=Math.abs(bend)>.24?(bend>0?'LEFT':'RIGHT')+' AHEAD · BRAKE EARLY':'BUILD SPEED · LOOK AHEAD';drawMap();}
function resize(){const w=innerWidth,h=innerHeight;if(canvas.width!==Math.floor(w*renderer.getPixelRatio())||canvas.height!==Math.floor(h*renderer.getPixelRatio())){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}}
let hudTimer=0,frameMs=0;
renderer.setAnimationLoop(now=>{const dt=last?Math.min((now-last)/1000,.08):0;last=now;frames++;frameMs+=(dt*1000-frameMs)*.05;resize();
 if(running&&sim){const intents=input();accumulator+=dt;while(accumulator>=1/120){sim.tick(intents,1/120);spin+=sim.speed/0.394/120;accumulator-=1/120;}updatePose(dt);audio.set(true,sim.speed,intents.throttle);hudTimer+=dt;if(hudTimer>.05){updateHUD();hudTimer=0;}}
 renderer.render(scene,camera);
});
// Compact diagnostics are available only with ?debug; no runtime menus or secrets.
if(debug){window.__THREE_GAME_DIAGNOSTICS__=()=>({loaded,running,frame:frames,frameMs,mode,renderer:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,textures:renderer.info.memory.textures,geometries:renderer.info.memory.geometries},state:sim?{x:sim.x,y:sim.y,z:sim.z,yaw:sim.yaw,speed:sim.speed,index:sim.index,s:sim.surface.s,lateral:sim.surface.lateral,elapsed:sim.elapsed,lap:sim.lap,nextGate:sim.nextGate,off:sim.off,travelled:sim.travelled,collisions:sim.collisions}:null,input:input()});window.__THREE_GAME_TEST_HOOKS__={seed(){return 1;},setState(distance,speed=0){if(!sim)return;const p=track.at(distance);sim.x=p.x;sim.z=p.z;sim.yaw=p.heading;sim.index=p.i;sim.speed=speed;sim.surface=track.sample(p.x,p.z,p.i);sim.lastS=sim.surface.s;sim.safe={...p};updatePose(1,true);},get track(){return track;},get sim(){return sim;},get camera(){return camera;},get car(){return car;}};}
(async()=>{try{const data=await fetch('route.json').then(r=>{if(!r.ok)throw Error('Circuit route could not load');return r.json();});track=new Circuit(data);sim=new Driving(track);await MeshoptDecoder.ready;
 const [level,vehicle]=await Promise.all([loadGLB('../sonoma-raceway-web.glb',p=>loadingTrack=p),loadGLB('assets/blue-roadster.glb',p=>loadingCar=p)]);
 level.scene.traverse(o=>{if(o.isMesh){const base=/^(terrain|base_)/.test(o.name)||/^(terrain|base_)/.test(o.parent?.name||'');o.castShadow=!base;o.receiveShadow=true;}});scene.add(level.scene);
 // Batch repeated static trees and tyre stacks in spatial cells. Source GLB is unchanged.
 level.scene.updateMatrixWorld(true);const batches=new Map(),removed=[];
 level.scene.traverse(o=>{if(!o.isMesh||o.isInstancedMesh||Array.isArray(o.material))return;const v=new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);const key=[o.geometry.uuid,o.material.uuid,Math.floor(v.x/250),Math.floor(v.z/250),o.castShadow].join(':');if(!batches.has(key))batches.set(key,[]);batches.get(key).push(o);});
 for(const group of batches.values()){if(group.length<3)continue;const first=group[0],batch=new THREE.InstancedMesh(first.geometry,first.material,group.length);batch.castShadow=first.castShadow;batch.receiveShadow=true;group.forEach((o,i)=>{batch.setMatrixAt(i,o.matrixWorld);removed.push(o);});batch.computeBoundingSphere();scene.add(batch);}
 removed.forEach(o=>o.removeFromParent());
 carModel=vehicle.scene;car.add(carModel);carModel.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=true;}if(/^wheel_[FR][LR]$/.test(o.name)){wheels.push(o);if(o.name.startsWith('wheel_F'))frontWheels.push(o);}});
 makeGuide();loaded=true;updatePose(1,true);camera.position.copy(car.localToWorld(new THREE.Vector3(7,3,8)));camera.lookAt(car.position.clone().add(new THREE.Vector3(0,.7,0)));renderer.shadowMap.needsUpdate=true;loadingCar=loadingTrack=1;loading();$('load-status').textContent='READY · Blue roadster / full circuit';$('start').disabled=false;updateHUD();
 }catch(e){console.error(e);$('load-status').textContent='Could not load the circuit or car. Reload to try again. '+e.message;$('loading').hidden=true;}})();
