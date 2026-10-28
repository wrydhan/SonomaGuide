import * as THREE from 'three';
// Both the rendered surface and the physics consume the same smoothed profile.
// X/Z, UVs, materials, building geometry and the original GLB remain unchanged.
export function smoothRoad(level,raw,smooth){
  level.updateMatrixWorld(true);const meshes=[],counts=new Map();level.traverse(o=>{if(o.isMesh){meshes.push(o);counts.set(o.geometry,(counts.get(o.geometry)||0)+1);}});
  const report={meshes:0,vertices:0,maxDisplacement:0,repositioned:0};
  const point=new THREE.Vector3(),local=new THREE.Vector3(),normal=new THREE.Vector3();
  const supported=o=>{for(let q=o;q&&q!==level;q=q.parent){if(/^(road_|terrain|trackside_|bar_|vegetation_)/.test(q.name))return true;}return false;};
  function correction(x,z){const before=raw.sample(x,z);if(before.distance>28)return null;const after=smooth.profile(before.i,before.t),outside=Math.max(0,before.distance-7),t=Math.min(1,outside/21),weight=1-t*t*(3-2*t);return {delta:(after.cy-before.cy+(after.bank-before.bank)*before.lateral)*weight,before,after};}
  for(const mesh of meshes){if(!supported(mesh))continue;const geometry=mesh.geometry,position=geometry.getAttribute('position');if(!position)continue;
    if(mesh.isInstancedMesh){const instance=new THREE.Matrix4(),world=new THREE.Matrix4(),inverse=mesh.matrixWorld.clone().invert();for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,instance);world.multiplyMatrices(mesh.matrixWorld,instance);point.setFromMatrixPosition(world);const d=correction(point.x,point.z);if(d&&Math.abs(d.delta)>.001){point.y+=d.delta;point.applyMatrix4(inverse);instance.setPosition(point);mesh.setMatrixAt(i,instance);report.repositioned++;}}mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();continue;}
    if(counts.get(geometry)>1){geometry.computeBoundingBox();geometry.boundingBox.getCenter(point).applyMatrix4(mesh.matrixWorld);const d=correction(point.x,point.z);if(d&&Math.abs(d.delta)>.001){mesh.parent.updateWorldMatrix(true,false);const inv=mesh.parent.matrixWorld.clone().invert();local.setFromMatrixPosition(mesh.matrixWorld);local.y+=d.delta;local.applyMatrix4(inv);mesh.position.copy(local);report.repositioned++;}continue;}
    const inv=mesh.matrixWorld.clone().invert(),normalMatrix=new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld),normalInverse=normalMatrix.clone().invert(),oldNormal=geometry.getAttribute('normal')?.clone(),out=new Float32Array(position.count*3),topNormals=new Map();let changed=false;
    let isMain=false;for(let q=mesh;q&&q!==level;q=q.parent)if(q.name.startsWith('road_main'))isMain=true;
    for(let i=0;i<position.count;i++){point.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);const d=correction(point.x,point.z);if(d){point.y+=d.delta;changed||=Math.abs(d.delta)>.00001;report.maxDisplacement=Math.max(report.maxDisplacement,Math.abs(d.delta));
        if(isMain&&oldNormal){normal.fromBufferAttribute(oldNormal,i).applyMatrix3(normalMatrix).normalize();if(Math.abs(normal.y)>.8){const normalSign=Math.sign(normal.y)||1,heading=d.before.heading,tx=Math.sin(heading),tz=Math.cos(heading),lx=tz,lz=-tx;normal.set(-d.after.slope*tx-d.after.bank*lx,1,-d.after.slope*tz-d.after.bank*lz).multiplyScalar(normalSign).normalize().applyMatrix3(normalInverse).normalize();topNormals.set(i,normal.clone());}}
      }point.applyMatrix4(inv);out[i*3]=point.x;out[i*3+1]=point.y;out[i*3+2]=point.z;}
    if(changed){geometry.setAttribute('position',new THREE.BufferAttribute(out,3));geometry.deleteAttribute('normal');geometry.computeVertexNormals();const normals=geometry.getAttribute('normal');if(oldNormal){for(let i=0;i<normals.count;i++){normal.fromBufferAttribute(normals,i);local.fromBufferAttribute(oldNormal,i);if(normal.dot(local)<0)normals.setXYZ(i,-normal.x,-normal.y,-normal.z);}}for(const[i,n]of topNormals)normals.setXYZ(i,n.x,n.y,n.z);normals.needsUpdate=true;geometry.computeBoundingBox();geometry.computeBoundingSphere();report.meshes++;report.vertices+=position.count;}
  }
  level.updateMatrixWorld(true);return report;
}
