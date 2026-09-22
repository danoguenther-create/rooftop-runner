import * as THREE from 'three';

/** Tailor the original weighted trouser mesh; skeleton, shoes and clips stay intact. */
export function tailorBaggyPants(model: THREE.Group): void {
  model.updateMatrixWorld(true);
  model.traverse(object => {
    const mesh = object as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || mesh.geometry.userData.baggyPants) return;
    const names = mesh.skeleton.bones.map(b => b.name.replace(/^mixamorig\d*/, ''));
    const legs = ['Left','Right'].map(side => [side+'UpLeg',side+'Leg',side+'Foot'].map(name=>names.indexOf(name)));
    if (legs.some(ids=>ids.some(id=>id<0))) return;
    const axes = legs.map(ids=>ids.map(id=>mesh.worldToLocal(mesh.skeleton.bones[id].getWorldPosition(new THREE.Vector3()))));
    const geometry = mesh.geometry.clone();
    const positions=geometry.getAttribute('position'), weights=geometry.getAttribute('skinWeight'), joints=geometry.getAttribute('skinIndex');
    if (!weights || !joints) return;
    const point=new THREE.Vector3();
    for(let i=0;i<positions.count;i++) {
      point.fromBufferAttribute(positions,i);
      const influence=[0,0];
      for(let k=0;k<4;k++) for(let side=0;side<2;side++)
        if(legs[side].slice(0,2).includes(joints.getComponent(i,k))) influence[side]+=weights.getComponent(i,k);
      const side=influence[0]>=influence[1]?0:1;
      if(influence[side]<0.45) continue;
      const [hip,knee,ankle]=axes[side];
      const fraction=(point.y-ankle.y)/(hip.y-ankle.y);
      if(fraction<0.035 || fraction>0.99) continue;
      const upper=point.y>knee.y, a=upper?knee:ankle,b=upper?hip:knee;
      const along=THREE.MathUtils.clamp((point.y-a.y)/(b.y-a.y),0,1);
      const cx=THREE.MathUtils.lerp(a.x,b.x,along),cz=THREE.MathUtils.lerp(a.z,b.z,along);
      const hem=THREE.MathUtils.smoothstep(fraction,0.035,0.18);
      const waist=1-THREE.MathUtils.smoothstep(fraction,0.78,0.99);
      const fullness=hem*waist*Math.min(1,influence[side]);
      const thigh=THREE.MathUtils.smoothstep(fraction,0.4,0.62);
      const folds=1+Math.sin(fraction*65)*0.035*fullness;
      positions.setXYZ(i,cx+(point.x-cx)*(1+(0.7+0.65*thigh)*fullness)*folds,point.y,cz+(point.z-cz)*(1+(0.55+0.4*thigh)*fullness)*folds);
    }
    positions.needsUpdate=true;
    geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
    geometry.userData.baggyPants=true;
    mesh.geometry=geometry;
  });
}
