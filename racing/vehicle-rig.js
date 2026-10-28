import * as THREE from './vendor/three.module.js';
import {splitFittings} from './steering-rig.js';
// Ferrari exports store each tyre, rim, disc and caliper as separate siblings.
export function rigSplitWheels(model){
 model.updateWorldMatrix(true,true);
 for(const corner of ['FL','FR','RL','RR']){
  const rim=model.getObjectByName('wheel_'+corner+'_rim'),tyre=model.getObjectByName('wheel_'+corner+'_tyre')||model.getObjectByName('wheel_'+corner+'_tire');if(!rim||!tyre)throw Error('Missing wheel assembly '+corner);
  const group=new THREE.Group();group.name='wheel_'+corner;group.position.copy(rim.position);rim.parent.add(group);const roll=new THREE.Group();roll.name=group.name+'_rolling';group.add(roll);model.updateWorldMatrix(true,true);
  tyre.geometry.computeBoundingBox();group.userData.radius=(tyre.geometry.boundingBox.max.y-tyre.geometry.boundingBox.min.y)/2;group.userData.rollNode=roll;
  for(const part of [rim,tyre,model.getObjectByName('wheel_'+corner+'_brake_disc')||model.getObjectByName('brake_'+corner+'_disc')])if(part)roll.attach(part);
  const caliper=model.getObjectByName('wheel_'+corner+'_caliper')||model.getObjectByName('brake_'+corner+'_caliper');if(caliper)group.attach(caliper);
 }
}
export function rigFerrariSteering(model,config){
 const steering=model.getObjectByName(config.node);if(!steering)throw Error('Missing steering wheel '+config.node);
 const centre=new THREE.Vector3(...config.centre),tilt=THREE.MathUtils.degToRad(config.shaft),axis=new THREE.Vector3(0,-Math.sin(tilt),Math.cos(tilt)),parts=steering.children.filter(o=>o.isMesh),pivot=new THREE.Group();pivot.name='ferrari_steering_rotor';pivot.position.copy(centre);steering.add(pivot);model.updateWorldMatrix(true,true);let moved=0;
 for(const mesh of parts){const rotating=splitFittings(mesh,b=>{const midpoint=b.getCenter(new THREE.Vector3()),depth=midpoint.clone().sub(centre).dot(axis);return depth<.085&&!(depth>config.paddleDepth&&Math.abs(midpoint.x-centre.x)>config.paddleOffset);});if(rotating){pivot.attach(rotating);moved++;}}
 if(!moved)throw Error('No rotating steering parts');pivot.userData.rig={centre:config.centre,axis:axis.toArray(),movingPartitions:moved};return {pivot,axis};
}
