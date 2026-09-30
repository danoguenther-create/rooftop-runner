import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { cityPBRReady, loadCityPBR } from './CityPBR';
import type { BoxData, BoxStyle, LevelData } from './levelTypes';

const timber = new Set(['#896f50','#766047','#7a6a55','#675c4b','#655448','#594b42']);
const metals = new Set(['#5d646e','#7f8a92','#787d84','#4d5751','#434a45','#242f2d','#414c42']);
/** Material choice does not change serialized styles or collider promotion rules. */
export function cityBoxStyle(box: BoxData): BoxStyle | undefined {
  if (!cityPBRReady() || box.style !== 'plain') return box.style;
  const tag=box.tag??'', color=box.color??'';
  if (tag.startsWith('sewer-')) return 'city-damp';
  if (color==='#394d4c') return 'city-glass';
  if (color==='#343b40' || tag==='factory-ground' || tag==='industrial-outskirts') return 'city-asphalt';
  if (/boarded|crate/.test(tag) || timber.has(color)) return 'city-wood';
  if (/container|fence|crane|machine|catwalk|locked-gate/.test(tag) || metals.has(color)) return 'city-metal';
  if (box.size[1]>3 && box.size[0]>5 && box.size[2]>5 && !tag.startsWith('factory')) return 'city-plaster';
  return 'city-concrete';
}

export async function prepareCityLook(data: LevelData): Promise<THREE.Group> {
  await loadCityPBR();
  const root=new THREE.Group();root.name='City material upgrade';
  // Replace only the existing flat HVAC boxes; the same collision proxies remain.
  const vents=data.boxes.filter(b=>!b.invisible&&b.color==='#7f8a92'&&b.size[0]===2.2&&b.size[1]===.6&&b.size[2]===1.6);
  try {
    const kit=await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/city/roof-vent.glb`);
    kit.scene.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(kit.scene),size=bounds.getSize(new THREE.Vector3());
    kit.scene.traverse(object=>{
      const part=object as THREE.Mesh;if(!part.isMesh)return;
      const geometry=part.geometry.clone().applyMatrix4(part.matrixWorld);
      geometry.translate(-bounds.min.x-size.x/2,-bounds.min.y,-bounds.min.z-size.z/2);
      const mesh=new THREE.InstancedMesh(geometry,part.material,vents.length);
      vents.forEach((box,i)=>mesh.setMatrixAt(i,new THREE.Matrix4().compose(
        new THREE.Vector3(box.pos[0],box.pos[1]-box.size[1]/2,box.pos[2]),
        new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP,box.rotY??0),
        new THREE.Vector3(box.size[0]/size.x,box.size[1]/size.y,box.size[2]/size.z))));
      mesh.castShadow=mesh.receiveShadow=true;mesh.name='Blender rooftop ventilation';root.add(mesh);
    });
    for(const box of vents)box.invisible=true;
    root.userData.ventCount=vents.length;
  } catch(error) {console.warn('Dachlüfter bleiben als vorhandene Modelle verfügbar.',error);}
  root.userData.materials='Baked city PBR';
  return root;
}
