import * as THREE from './vendor/three.module.js';
// This adapter targets the original Tourbillon export recorded in bugatti-provenance.json.
// Its instrument cluster is fixed; only the rim and rim-mounted fittings rotate.
export function splitFittings(mesh,select){
 const geometry=mesh.geometry,position=geometry.getAttribute('position'),index=geometry.index,count=index?index.count:position.count;
 const parent=Array.from({length:position.count},(_,i)=>i),find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;},join=(a,b)=>{parent[find(a)]=find(b);};
 // Weld only for connectivity. Keep the original normals, UVs and seam vertices in both outputs.
 const weld=new Map();for(let i=0;i<position.count;i++){const key=[position.getX(i),position.getY(i),position.getZ(i)].map(v=>Math.round(v*1e5)).join(':');if(weld.has(key))join(i,weld.get(key));else weld.set(key,i);}
 const at=i=>index?index.getX(i):i;for(let i=0;i<count;i+=3){join(at(i),at(i+1));join(at(i),at(i+2));}
 const parts=new Map();for(let i=0;i<count;i+=3){const root=find(at(i));if(!parts.has(root))parts.set(root,{indices:[],bounds:new THREE.Box3()});const part=parts.get(root);for(let k=0;k<3;k++){const v=at(i+k);part.indices.push(v);part.bounds.expandByPoint(new THREE.Vector3().fromBufferAttribute(position,v));}}
 const moving=[],fixed=[];let components=0;for(const part of parts.values()){if(select(part.bounds)){moving.push(...part.indices);components++;}else fixed.push(...part.indices);}
 if(!moving.length)return null;
 const clone=mesh.clone(false);clone.geometry=geometry.clone();clone.geometry.setIndex(moving);geometry.setIndex(fixed);clone.name=mesh.name+'_rim_fittings';mesh.parent.add(clone);clone.userData.rimComponents=components;return clone;
}
export function rigBugattiSteering(model){
 const steering=model.getObjectByName('int_steering');if(!steering)return null;
 const parts=steering.children.filter(o=>o.isMesh),rim=parts.find(o=>o.material?.name==='leather_cream');if(!rim)return null;
 // Geometry measurement: wheel centre (0.335, 0.660, 0.450), plane tilted +22° about X.
 // The old positive-Y shaft tilted the rim out of its own plane while steering.
 const angle=THREE.MathUtils.degToRad(22),axis=new THREE.Vector3(0,-Math.sin(angle),Math.cos(angle));
 const pivot=new THREE.Group();pivot.name='bugatti_steering_rotor';pivot.position.set(.335,.66,.45);steering.add(pivot);model.updateWorldMatrix(true,true);
 const moving=[rim];
 for(const mesh of parts){let fitting=null;
  if(mesh.material?.name==='alu_dark')fitting=splitFittings(mesh,b=>b.max.x-b.min.x<.04&&Math.abs((b.max.x+b.min.x)/2-.335)>.14);
  if(fitting)moving.push(fitting);
 }
 // The aluminium binnacle ring and bearing supports stay with the stationary gauges.
 // attach() preserves each imported rest transform rather than subtracting guessed offsets.
 for(const mesh of moving)pivot.attach(mesh);
 pivot.userData.rig={centre:[.335,.66,.45],axis:axis.toArray(),moving:moving.map(o=>o.name),rimFittingComponents:moving.reduce((n,o)=>n+(o.userData.rimComponents||0),0)};
 return {pivot,axis};
}
