import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { LevelData } from './levelTypes';

export const visualTrial = new URLSearchParams(location.search).get('look') !== 'original';
const textures = new Map<string, THREE.Texture>();
const base = `${import.meta.env.BASE_URL}textures/factory-preview/`;

/** World-mapped Blender bakes keep a consistent material scale on all mill modules. */
export function millMaterial(kind: string): THREE.MeshStandardMaterial {
  if(kind==='mill-glass')return new THREE.MeshStandardMaterial({color:'#789293',roughness:.23,metalness:.5,envMapIntensity:.85});
  const brick=kind==='mill-brick',metal=kind==='mill-metal',prefix=brick?'brick':'concrete';
  const mat=new THREE.MeshStandardMaterial({color:metal?'#656c65':'#ffffff',
    map:textures.get(`${prefix}-color`),normalMap:textures.get(`${prefix}-normal`),
    roughnessMap:textures.get(`${prefix}-roughness`),normalScale:new THREE.Vector2(brick?.4:.22,brick?.4:.22),
    roughness:metal?.66:1,metalness:metal?.65:0});
  mat.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('void main() {','varying vec3 vMillWorld;\nvarying vec3 vMillNormal;\nvoid main() {')
      .replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
      vec4 mp=vec4(transformed,1.);
      #ifdef USE_INSTANCING
      mp=instanceMatrix*mp;
      #endif
      vMillWorld=(modelMatrix*mp).xyz;
      vMillNormal=normalize(mat3(modelMatrix)*objectNormal);
      vec3 an=abs(vMillNormal);
      vec2 surfaceUV=(an.y>.5?vMillWorld.xz:(an.x>an.z?vMillWorld.zy:vMillWorld.xy))/${brick?'3.6':'4.'};
      vMapUv=surfaceUV;vNormalMapUv=surfaceUV;vRoughnessMapUv=surfaceUV;`);
    shader.fragmentShader=shader.fragmentShader.replace('void main() {','varying vec3 vMillWorld;\nvarying vec3 vMillNormal;\nvoid main() {')
      .replace('#include <color_fragment>',`#include <color_fragment>
      // Static architectural contact shading; no screen-space pass per viewport.
      float edge=min(min(abs(vMillWorld.x-144.),abs(vMillWorld.x-192.)),min(abs(vMillWorld.z+30.),abs(vMillWorld.z-10.)));
      float levelHeight=mod(vMillWorld.y+.04,7.);
      float occlusion=abs(vMillNormal.y)>.6?mix(.62,1.,smoothstep(0.,2.4,edge)):mix(.73,1.,smoothstep(0.,1.8,levelHeight));
      if(vMillNormal.y<-.5)occlusion*=.72;
      diffuseColor.rgb*=occlusion;`);
  };
  mat.customProgramCacheKey=()=>kind+'-blender-pbr-v1';
  return mat;
}

export async function prepareFactoryPreview(data: LevelData): Promise<THREE.Group> {
  const root=new THREE.Group();root.name='Mill visual trial';
  const loader=new THREE.TextureLoader();
  const [kit]=await Promise.all([
    new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/factory-preview/mill-kit.glb`),
    ...['brick','concrete'].flatMap(kind=>['color','normal','roughness'].map(async channel=>{
      const name=`${kind}-${channel}`,t=await loader.loadAsync(`${base}${name}.png`);
      t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;
      t.colorSpace=channel==='color'?THREE.SRGBColorSpace:THREE.NoColorSpace;textures.set(name,t);
    })),
  ]);
  const machines=data.boxes.filter(b=>b.tag==='factory-machine'||b.tag==='factory-upper-machine');
  kit.scene.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(kit.scene),size=bounds.getSize(new THREE.Vector3());
  kit.scene.traverse(object=>{
    const part=object as THREE.Mesh;if(!part.isMesh)return;
    const geom=part.geometry.clone().applyMatrix4(part.matrixWorld);
    geom.translate(-bounds.min.x-size.x/2,-bounds.min.y,-bounds.min.z-size.z/2);
    const mesh=new THREE.InstancedMesh(geom,part.material,machines.length);
    machines.forEach((b,i)=>mesh.setMatrixAt(i,new THREE.Matrix4().compose(
      new THREE.Vector3(b.pos[0],b.pos[1]-b.size[1]/2,b.pos[2]),new THREE.Quaternion(),
      new THREE.Vector3(b.size[0]/size.x,b.size[1]/size.y,b.size[2]/size.z))));
    mesh.castShadow=true;mesh.receiveShadow=true;mesh.name='Blender mill machines';root.add(mesh);
  });
  // Collision shapes retain their original dimensions and contacts.
  for(const b of machines)b.invisible=true;
  for(const b of data.boxes){
    const [x,y,z]=b.pos;if(x<143.5||x>192.5||z< -30.5||z>10.6||y<-.2||y>29)continue;
    if(b.style==='brick'){b.style='mill-brick';b.color='#ffffff';}
    else if(/factory-(storey-floor|main-stair|main-landing|main-half-landing|floor)/.test(b.tag??'')){b.style='mill-concrete';b.color='#ffffff';}
    else if(b.tag==='factory-main-column'){b.style='mill-metal';b.color='#ffffff';}
    else if(b.color==='#394d4c'){b.style='mill-glass';b.color='#ffffff';b.solid=true;}
  }
  const housingMat=new THREE.MeshStandardMaterial({color:'#394a44',roughness:.65,metalness:.6});
  const glowMat=new THREE.MeshStandardMaterial({color:'#efe0ad',emissive:'#ffc874',emissiveIntensity:1.8,roughness:.7});
  const housings=new THREE.InstancedMesh(new THREE.BoxGeometry(2,.18,.65),housingMat,8);
  const lamps=new THREE.InstancedMesh(new THREE.BoxGeometry(1.75,.05,.43),glowMat,8);
  for(let f=0;f<4;f++){
    for(let k=0;k<2;k++){
      const x=k?174:157,z=k?-13:-2,y=f*7+6.15,index=f*2+k;
      housings.setMatrixAt(index,new THREE.Matrix4().makeTranslation(x,y,z));lamps.setMatrixAt(index,new THREE.Matrix4().makeTranslation(x,y-.115,z));
    }
    const lamp=new THREE.SpotLight('#ffd6a2',75,18,Math.PI/3,.85,2);lamp.position.set(157,f*7+5.95,-2);
    lamp.target.position.set(157,f*7,-2);root.add(lamp,lamp.target);
  }
  root.add(housings,lamps);
  root.userData.blenderKit=true;root.userData.machineCount=machines.length;return root;
}
