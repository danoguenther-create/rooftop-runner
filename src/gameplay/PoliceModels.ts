import {planHouse,buildHouse} from '../../tools/city-interiors.mjs';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {surfaceFinish} from '../level/SurfaceFinish';
import type {LevelLoader} from '../level/LevelLoader';
const mat=(color:string,metalness=0)=>new THREE.MeshStandardMaterial({color,metalness,roughness:metalness?.42:.85});
const navy=mat('#173447'),white=mat('#dce4df',.2),black=mat('#17212a'),glass=mat('#477483',.45),silver=mat('#afb8b8',.65);
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
 add([27,.14,23],[103,-.05,86],concrete,true);
 // Hollow like the city houses: two storeys and a roof hatch over the stair
 // core; the same shell builder adds the facade handholds as a ring.
 const station={x:103,z:89,width:16,depth:12,height:6,color:'#d6d4c4',variant:0,stairSide:0};
 const plan=planHouse(station,0,{hash:()=>0,obstacles:[],roofAccess:true,windows:false});
 buildHouse(station,plan,(pos,size,_color,tag)=>add(size,pos,tag==='house-wall'?plaster:tag==='house-furniture'?navy:concrete,true),{plinth:false});
 // Eave ring instead of the former solid roof cap, leaving the hatch open.
 for(const z of [83.15,94.85])add([16.6,.3,.6],[103,6.15,z],concrete,true);
 for(const x of [95.15,110.85])add([.6,.3,11.4],[x,6.15,89],concrete,true);
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
 for(const x of Array.from({length:7},(_,i)=>114-i*3.6))add([.08,.015,5.5],[x,.035,77],white);
 for(const [material,parts] of batches){const mesh=new THREE.Mesh(mergeGeometries(parts)! ,material);mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);for(const g of parts)g.dispose();}
 const sign=label('POLIZEI',5.8,.95);sign.position.set(103,3.8,82.78);sign.rotation.y=Math.PI;root.add(sign);
 root.userData.colliderCount=colliders;root.userData.surfaceCount=level.topFaces.length-initialFaces;return root;
}
function rounded(root:THREE.Object3D,size:number[],pos:number[],material:THREE.Material,radius=.04){
 const mesh=new THREE.Mesh(new RoundedBoxGeometry(size[0],size[1],size[2],2,radius),material);mesh.position.set(...pos as [number,number,number]);mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);return mesh;
}
function ellipsoid(root:THREE.Object3D,size:number[],pos:number[],material:THREE.Material){
 const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,16,12),material);mesh.scale.set(...size as [number,number,number]);mesh.position.set(...pos as [number,number,number]);mesh.castShadow=true;root.add(mesh);return mesh;
}
/** Batch rigid detail within each animated part, preserving doors and limb pivots. */
function batch(root:THREE.Object3D){
 const groups=new Map<THREE.Material,THREE.BufferGeometry[]>();
 for(const child of [...root.children]){
  if(!(child instanceof THREE.Mesh)||Array.isArray(child.material)||child.userData.keepAnimated)continue;
  child.updateMatrix();const geometry=child.geometry.clone().applyMatrix4(child.matrix);
  const list=groups.get(child.material)??[];list.push(geometry);groups.set(child.material,list);root.remove(child);child.geometry.dispose();
 }
 for(const [material,parts] of groups){
  const geometry=mergeGeometries(parts.map(g=>g.index?g.toNonIndexed():g));if(!geometry)continue;
  const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);parts.forEach(g=>g.dispose());
 }
}
const paint=new THREE.MeshPhysicalMaterial({color:'#ced5d7',metalness:.62,roughness:.28,clearcoat:1,clearcoatRoughness:.2});
const livery=new THREE.MeshStandardMaterial({color:'#175080',metalness:.28,roughness:.35});
const rubber=mat('#151719'),trim=mat('#30383d',.25),reflective=mat('#ced493',.35);
const lamp=new THREE.MeshStandardMaterial({color:'#e8f4fa',emissive:'#c8e8ff',emissiveIntensity:.6,roughness:.2});
const rearLamp=new THREE.MeshStandardMaterial({color:'#8e1d19',emissive:'#e52218',emissiveIntensity:.4});
function cabin(root:THREE.Group){
 // Sloped windshield and rear pillars; a compact estate silhouette.
 const sections=[[-1.65,.78,1.04],[-1.05,.7,1.59],[.35,.7,1.59],[1.05,.79,1.02]];
 const vertices:number[]=[],indices:number[]=[];
 sections.forEach(([z,w,y])=>vertices.push(-w,1.01,z,w,1.01,z,-w,y,z,w,y,z));
 for(let k=0;k<3;k++){const a=k*4,b=(k+1)*4;for(const [u,v] of [[0,1],[1,3],[3,2],[2,0]])indices.push(a+u,b+v,b+u,a+u,a+v,b+v);}
 indices.push(0,2,3,0,3,1,12,13,15,12,15,14);
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(vertices.length/3*2),2));g.computeVertexNormals();
 const mesh=new THREE.Mesh(g,glass);root.add(mesh);
 rounded(root,[1.48,.075,1.49],[0,1.615,-.35],paint);
 for(const side of [-1,1]){
  rounded(root,[.07,.57,.085],[side*.747,1.3,-.32],trim,.02);
  const pillar=rounded(root,[.075,.75,.085],[side*.748,1.28,.68],paint,.02);pillar.rotation.x=-.91;
  const rear=rounded(root,[.08,.74,.09],[side*.744,1.3,-1.34],paint,.02);rear.rotation.x=.84;
 }
}
export function buildPatrolCar(){
 const root=new THREE.Group();root.name='Polizeistreife';
 rounded(root,[1.86,.56,4.4],[0,.76,0],paint,.15);
 rounded(root,[1.82,.23,4.05],[0,.46,0],trim,.08);
 rounded(root,[1.75,.1,1.23],[0,1.06,1.4],paint,.06);cabin(root);
 for(const side of [-1,1]){
  rounded(root,[.025,.25,3.62],[side*.936,.83,0],livery,.01);
  rounded(root,[.028,.035,3.6],[side*.952,.66,0],reflective,.009);
  rounded(root,[.24,.13,.27],[side*1.02,1.18,.73],paint,.05);
  rounded(root,[.012,.085,.21],[side*1.145,1.18,.73],glass,.01);
  for(const z of [-1,.3])rounded(root,[.033,.045,.22],[side*.955,1,z],silver,.01);
  const sign=label('POLIZEI',1.05,.24);sign.position.set(side*.955,.84,-.9);sign.rotation.y=side*Math.PI/2;root.add(sign);
 }
 const wheels:THREE.Group[]=[];
 for(const x of [-.94,.94])for(const z of [-1.38,1.38]){
  const pivot=new THREE.Group();pivot.position.set(x,.36,z);root.add(pivot);wheels.push(pivot);
  const tire=new THREE.Mesh(new THREE.TorusGeometry(.265,.095,8,24),rubber);tire.rotation.y=Math.PI/2;pivot.add(tire);
  const hub=new THREE.Mesh(new THREE.CylinderGeometry(.23,.23,.19,20),silver);hub.rotation.z=Math.PI/2;pivot.add(hub);
  for(let i=0;i<5;i++){const angle=i*Math.PI*2/5;const spoke=rounded(pivot,[.2,.055,.21],[0,Math.sin(angle)*.12,Math.cos(angle)*.12],trim,.012);spoke.rotation.x=-angle;}
  batch(pivot);
 }
 rounded(root,[1.3,.2,.03],[0,.75,2.209],trim,.015);
 for(let k=0;k<6;k++)box(root,[1.1,.012,.035],[0,.68+k*.027,2.23],silver);
 for(const x of [-.65,.65]){
  rounded(root,[.42,.18,.06],[x,.99,2.19],lamp,.04);
  rounded(root,[.3,.2,.07],[x,.95,-2.2],rearLamp,.03);
  rounded(root,[.17,.07,.045],[x,.5,2.18],lamp,.018);
 }
 const plate=label('PQ · 110',.47,.13);plate.position.set(0,.5,2.226);root.add(plate);
 rounded(root,[1.17,.07,.34],[0,1.72,-.22],trim,.025);
 const lights=[-.4,.4].map(x=>rounded(root,[.36,.11,.3],[x,1.81,-.22],new THREE.MeshStandardMaterial({color:'#238ded',emissive:'#168aff',emissiveIntensity:0}),.035));
 lights.forEach(l=>l.userData.keepAnimated=true);
 box(root,[.014,.3,.014],[.4,1.85,-.86],trim);
 const doors=[-1,1].map(side=>{
  const pivot=new THREE.Group();pivot.position.set(side*.945,.85,.83);root.add(pivot);
  rounded(pivot,[.045,.38,1.02],[0,-.06,-.51],paint,.02);
  rounded(pivot,[.05,.2,1.02],[side*.015,-.01,-.51],livery,.01);
  rounded(pivot,[.04,.43,.95],[0,.34,-.51],glass,.015);
  rounded(pivot,[.045,.035,.98],[0,.565,-.51],trim,.01);batch(pivot);return pivot;
 });
 batch(root);return{root,doors,lights,wheels};
}
function uniformMaterial(){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d')!;
 ctx.fillStyle='#263849';ctx.fillRect(0,0,128,128);
 for(let i=0;i<128;i++){ctx.fillStyle=i%2?'#293e50':'#223443';ctx.fillRect(i,0,1,128);ctx.fillStyle='#304253';ctx.fillRect(0,i*2,128,1);}
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(3,3);
 return new THREE.MeshStandardMaterial({map:texture,roughness:.95});
}
const uniform=uniformMaterial(),vest=mat('#152631'),boot=mat('#191b1c'),eyeWhite=mat('#c9c8bf'),iris=mat('#34302b');
export function buildOfficer(index:number){
 const root=new THREE.Group();root.name=`Polizist ${index+1}`;
 const complexion=mat(['#bc9175','#997158','#ceaa8a'][index%3]);
 ellipsoid(root,[.25,.34,.155],[0,1.17,0],uniform);
 rounded(root,[.46,.42,.32],[0,1.19,.005],vest,.08);
 rounded(root,[.39,.08,.28],[0,.91,0],black,.025);
 for(const side of [-1,1]){
  rounded(root,[.135,.16,.045],[side*.12,1.13,.171],uniform,.018);
  rounded(root,[.095,.12,.075],[side*.245,.91,.025],trim,.018);
  rounded(root,[.14,.035,.11],[side*.22,1.47,0],navy,.01);
 }
 const chest=label('POLIZEI',.24,.07);chest.position.set(.08,1.4,.17);root.add(chest);
 const back=label('POLIZEI',.35,.105);back.position.set(0,1.32,-.167);back.rotation.y=Math.PI;root.add(back);
 rounded(root,[.06,.12,.06],[-.15,1.4,.2],trim,.012);box(root,[.01,.11,.01],[-.15,1.505,.2],trim);
 ellipsoid(root,[.065,.105,.065],[0,1.51,0],complexion);
 ellipsoid(root,[.125,.18,.125],[0,1.69,.005],complexion);
 ellipsoid(root,[.08,.063,.075],[0,1.565,.056],complexion);
 for(const side of [-1,1]){
  ellipsoid(root,[.027,.049,.021],[side*.123,1.68,.008],complexion);
  ellipsoid(root,[.029,.015,.01],[side*.043,1.717,.12],eyeWhite);
  ellipsoid(root,[.012,.012,.009],[side*.043,1.717,.128],iris);
  rounded(root,[.065,.011,.012],[side*.047,1.75,.119],iris,.004);
 }
 ellipsoid(root,[.023,.038,.035],[0,1.686,.137],complexion);
 rounded(root,[.063,.009,.013],[0,1.622,.128],mat('#805a4c'),.004);
 ellipsoid(root,[.141,.07,.143],[0,1.835,0],uniform);
 rounded(root,[.23,.023,.15],[0,1.819,.13],navy,.035);
 rounded(root,[.039,.04,.015],[0,1.848,.133],silver,.006);
 const limbs:THREE.Group[]=[],joints:THREE.Group[]=[];
 for(const side of [-1,1]){
  const leg=new THREE.Group();leg.position.set(side*.115,.86,0);root.add(leg);
  ellipsoid(leg,[.108,.22,.12],[0,-.19,0],uniform);
  const knee=new THREE.Group();knee.position.set(0,-.39,0);leg.add(knee);joints.push(knee);
  ellipsoid(knee,[.086,.19,.094],[0,-.17,0],uniform);
  rounded(knee,[.17,.19,.29],[0,-.37,.058],boot,.055);
  rounded(knee,[.18,.035,.3],[0,-.45,.062],rubber,.018);batch(knee);batch(leg);limbs.push(leg);
  const arm=new THREE.Group();arm.position.set(side*.265,1.44,0);root.add(arm);
  ellipsoid(arm,[.085,.165,.085],[side*.015,-.13,0],uniform);
  const elbow=new THREE.Group();elbow.position.set(side*.015,-.29,0);arm.add(elbow);joints.push(elbow);
  ellipsoid(elbow,[.065,.15,.067],[0,-.12,0],uniform);
  ellipsoid(elbow,[.053,.075,.034],[0,-.295,.012],complexion);
  for(let k=0;k<4;k++)rounded(elbow,[.018,.048,.022],[(k-1.5)*.021,-.35,.019],complexion,.008);
  batch(elbow);batch(arm);limbs.push(arm);
 }
 batch(root);return{root,limbs,joints};
}
