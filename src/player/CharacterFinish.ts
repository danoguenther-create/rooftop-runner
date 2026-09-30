import * as THREE from 'three';
import { visualTrial } from '../level/FactoryPreview';

let weave:THREE.DataTexture|undefined;
function fabricNormal():THREE.DataTexture {
  if(weave)return weave;
  const size=64,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const nx=Math.sin(x*Math.PI/2)*.18,ny=Math.sin(y*Math.PI/2)*.12;
    data.set([Math.round((nx*.5+.5)*255),Math.round((ny*.5+.5)*255),Math.round((Math.sqrt(1-nx*nx-ny*ny)*.5+.5)*255),255],(y*size+x)*4);
  }
  weave=new THREE.DataTexture(data,size,size);weave.wrapS=weave.wrapT=THREE.RepeatWrapping;weave.repeat.set(20,20);
  weave.minFilter=THREE.LinearMipmapLinearFilter;weave.magFilter=THREE.LinearFilter;weave.generateMipmaps=true;weave.needsUpdate=true;return weave;
}
/** Preserve identity, skin, baggy silhouette and both players' shoe colours. */
export function finishCharacter(model:THREE.Group):void {
  if(!visualTrial)return;
  model.traverse(object=>{
    const mesh=object as THREE.SkinnedMesh;if(!mesh.isSkinnedMesh)return;
    const original=mesh.material as THREE.MeshStandardMaterial;
    const mat=original.clone();mesh.material=mat;
    if(/Eyes/.test(mat.name)){mat.roughness=.28;mat.envMapIntensity=.6;return;}
    if(!/Body/.test(mat.name))return;
    const geometry=mesh.geometry.clone(),joints=geometry.getAttribute('skinIndex'),weights=geometry.getAttribute('skinWeight');
    if(!joints||!weights)return;
    const cloth=mesh.skeleton.bones.map(b=>/(Hips|Spine\d*|Shoulder|Arm|ForeArm|UpLeg|Leg)$/.test(b.name));
    const mask=new Float32Array(joints.count);
    for(let i=0;i<mask.length;i++)for(let k=0;k<4;k++)if(cloth[joints.getComponent(i,k)])mask[i]+=weights.getComponent(i,k);
    geometry.setAttribute('clothMask',new THREE.BufferAttribute(mask,1));mesh.geometry=geometry;
    mat.normalMap=fabricNormal();mat.normalScale.set(.45,.45);mat.roughness=.9;mat.color.multiplyScalar(1.06);
    mat.userData.clothTint=[1,1,1];
    mat.onBeforeCompile=function(shader){
      shader.uniforms.playerClothTint={value:new THREE.Vector3().fromArray(this.userData.clothTint??[1,1,1])};
      shader.vertexShader=shader.vertexShader.replace('void main() {','attribute float clothMask;\nvarying float vCloth;\nvoid main() {vCloth=clothMask;');
      shader.fragmentShader=shader.fragmentShader.replace('void main() {','varying float vCloth;\nuniform vec3 playerClothTint;\nvoid main() {')
        .replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb*=mix(vec3(1.),playerClothTint,smoothstep(.4,.9,vCloth));')
        .replace('#include <normal_fragment_maps>','vec3 skinNormal=normal;\n#include <normal_fragment_maps>\nnormal=normalize(mix(skinNormal,normal,smoothstep(.4,.9,vCloth)));')
        .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(.58,.94,smoothstep(.4,.9,vCloth));');
    };
    mat.customProgramCacheKey=()=> 'runner-cloth-trial-v1';mat.userData.fabricPreview=true;
  });
}
