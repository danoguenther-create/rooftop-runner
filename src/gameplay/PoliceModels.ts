import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {surfaceFinish} from '../level/SurfaceFinish';
import type {LevelLoader} from '../level/LevelLoader';
const mat=(color:string,metalness=0)=>new THREE.MeshStandardMaterial({color,metalness,roughness:metalness?.42:.85});
const navy=mat('#173447'),white=mat('#dce4df',.2),black=mat('#17212a'),glass=mat('#477483',.45),skin=mat('#c29776'),silver=mat('#afb8b8',.65);
function box(root:THREE.Object3D,size:number[],pos:number[],material:THREE.Material):THREE.Mesh {
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size as [number,number,number]),material);mesh.position.set(...pos as [number,number,number]);mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);return mesh;
}
function label(text:string,width:number,height:number):THREE.Mesh {
 const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d')!;
 ctx.fillStyle='#14364c';ctx.fillRect(0,0,512,128);ctx.fillStyle='#f4f3dc';ctx.font='bold 75px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,64,490);
 const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
 return new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshStandardMaterial({map:texture,roughness:.8}));
}
export function buildStation(level:LevelLoader):THREE.Group {
 const root=new THREE.Group();root.name='Polizeiwache';let colliders=0;const initialFaces=level.topFaces.length;
 const concrete=surfaceFinish(mat('#babeb4'),'concrete'),plaster=surfaceFinish(mat('#d6d4c4'),'plaster');
 const batches=new Map<THREE.Material,THREE.BufferGeometry[]>();
 const add=(size:number[],pos:number[],material:THREE.Material,solid=false)=>{
  const g=new THREE.BoxGeometry(...size as [number,number,number]);g.translate(...pos as [number,number,number]);
  const parts=batches.get(material)??[];parts.push(g);batches.set(material,parts);
  if(solid){level.registerBoxPhysics(pos as [number,number,number],size as [number,number,number],0,0);colliders++;}
 };
 add([23,.14,23],[105,-.05,86],concrete,true);
 add([16,6,12],[103,3,89],plaster,true);
 add([16.6,.3,12.6],[103,6.15,89],concrete,true);
 add([16,.55,.12],[103,3.4,82.93],navy);
 add([16,.25,.12],[103,1,82.93],navy);
 for(const x of [97,100,106,109]){
  add([2.3,1.7,.08],[x,4.7,82.91],navy);add([2.1,1.5,.09],[x,4.7,82.85],glass);
  add([.06,1.5,.1],[x,4.7,82.79],white);
 }
 add([2.4,2.7,.14],[103,1.4,82.83],glass);
 add([3.4,.2,1.7],[103,2.9,82.4],navy);
 for(const x of [101.2,104.8])add([.18,2.8,.18],[x,1.4,81.8],silver,true);
 // Forecourt parking marks; no obstruction across the driving lane.
 for(const x of [110,114])add([.08,.015,5.5],[x,.035,77],white);
 for(const [material,parts] of batches){const mesh=new THREE.Mesh(mergeGeometries(parts)! ,material);mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);for(const g of parts)g.dispose();}
 const sign=label('POLIZEI',5.8,.95);sign.position.set(103,3.8,82.78);sign.rotation.y=Math.PI;root.add(sign);
 root.userData.colliderCount=colliders;root.userData.surfaceCount=level.topFaces.length-initialFaces;return root;
}
export function buildPatrolCar(){
 const root=new THREE.Group();root.name='Polizeistreife';
 box(root,[1.86,.68,4.4],[0,.7,0],white);box(root,[1.78,.24,4.42],[0,.78,0],navy);
 box(root,[1.65,.66,2.4],[0,1.27,-.05],glass);box(root,[1.75,.12,2.55],[0,1.65,-.05],white);
 for(const x of [-.96,.96])for(const z of [-1.4,1.4]){
  const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.34,.34,.19,12),black);wheel.rotation.z=Math.PI/2;wheel.position.set(x,.36,z);root.add(wheel);
 }
 box(root,[1.1,.1,.32],[0,1.77,0],black);
 const lights=[-.4,.4].map(x=>box(root,[.32,.15,.3],[x,1.88,0],new THREE.MeshStandardMaterial({color:'#228aff',emissive:'#168aff',emissiveIntensity:0})));
 for(const x of [-.6,.6])box(root,[.35,.17,.05],[x,.85,2.22],mat('#f0efc8'));
 const doors=[-1,1].map(side=>{const pivot=new THREE.Group();pivot.position.set(side*.94,.82,.9);root.add(pivot);box(pivot,[.06,.63,1.15],[0,.12,-.575],white);box(pivot,[.06,.22,1.17],[side*.015,.05,-.575],navy);return pivot;});
 for(const side of [-1,1]){const sign=label('POLIZEI',1.3,.3);sign.position.set(side*.971,.85,-1);sign.rotation.y=side*Math.PI/2;root.add(sign);}
 return{root,doors,lights};
}
export function buildOfficer(index:number){
 const root=new THREE.Group();root.name=`Polizist ${index+1}`;
 box(root,[.48,.58,.28],[0,1.17,0],navy);box(root,[.48,.1,.31],[0,.87,0],black);
 const head=new THREE.Mesh(new THREE.SphereGeometry(.16,10,8),skin);head.position.set(0,1.66,0);root.add(head);
 box(root,[.37,.12,.34],[0,1.83,0],navy);box(root,[.34,.035,.15],[0,1.78,.2],black);
 box(root,[.075,.1,.015],[-.12,1.35,.15],silver);
 const limbs:THREE.Group[]=[];
 for(const side of [-1,1]){
  const leg=new THREE.Group();leg.position.set(side*.14,.86,0);root.add(leg);box(leg,[.2,.68,.22],[0,-.34,0],navy);box(leg,[.23,.16,.34],[0,-.77,.055],black);limbs.push(leg);
  const arm=new THREE.Group();arm.position.set(side*.33,1.43,0);root.add(arm);box(arm,[.17,.5,.2],[0,-.23,0],navy);box(arm,[.15,.17,.16],[0,-.55,0],skin);limbs.push(arm);
 }
 return{root,limbs};
}
