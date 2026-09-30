import * as THREE from 'three';

export type CitySurface = 'plaster' | 'concrete' | 'asphalt' | 'metal' | 'brick' | 'wood' | 'damp' | 'sand' | 'foliage' | 'water';
const maps = new Map<string, THREE.Texture>();
let ready = false;
export const cityPBRReady = (): boolean => ready;
export const cityBakedTexture = (name: string): THREE.Texture | undefined => maps.get(name);

/** One shared set of small baked maps, independent of building/instance count. */
export async function loadCityPBR(): Promise<void> {
  if (ready) return;
  const loader = new THREE.TextureLoader();
  const loaded = await Promise.all(['plaster','asphalt','wood','metal','brick','concrete'].flatMap(kind =>
    ['color','normal','roughness'].map(async channel => {
      const directory = kind === 'brick' || kind === 'concrete' ? 'factory-preview' : 'city';
      const name = `${kind}-${channel}`;
      const texture = await loader.loadAsync(`${import.meta.env.BASE_URL}textures/${directory}/${name}.png`);
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = 4;
      texture.colorSpace = channel === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      return [name, texture] as const;
    })));
  for (const [name, texture] of loaded) maps.set(name, texture);
  ready = true;
}

/** World projection also works on merged scenery and rotated instances. */
export function cityFinish(mat: THREE.MeshStandardMaterial, kind: CitySurface): THREE.MeshStandardMaterial {
  const textureKind = kind === 'damp' ? 'concrete' : ['sand','foliage','water'].includes(kind) ? 'plaster' : kind;
  const facade = !!mat.map;
  const building = !!mat.userData.cityBuilding;
  const previous = mat.onBeforeCompile.bind(mat), previousKey = mat.customProgramCacheKey();
  if (!facade) mat.map = maps.get(`${textureKind}-color`)!;
  mat.normalMap = maps.get(`${textureKind}-normal`)!;
  mat.roughnessMap = maps.get(`${textureKind}-roughness`)!;
  const normal = kind === 'metal' ? .14 : kind === 'foliage' ? .08 : kind === 'brick' ? .5 : .28;
  mat.normalScale.set(normal, normal);
  mat.userData.citySurface = kind;
  mat.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    shader.uniforms.cityWeatherMap = {value: maps.get('concrete-color')};
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 vCityWorld;\nvarying vec3 vCityNormal;\nvoid main() {')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vec4 cp=vec4(transformed,1.0);vec3 cn=objectNormal;
        #ifdef USE_INSTANCING
        cp=instanceMatrix*cp;cn=mat3(instanceMatrix)*cn;
        #endif
        vCityWorld=(modelMatrix*cp).xyz;vCityNormal=normalize(mat3(modelMatrix)*cn);
        vec3 ca=abs(vCityNormal);
        vec2 cityUV=(ca.y>.65?vCityWorld.xz:(ca.x>ca.z?vCityWorld.zy:vCityWorld.xy))/${kind === 'brick' ? '3.6' : kind === 'wood' ? '2.0' : '4.0'};
        ${facade ? '' : 'vMapUv=cityUV;'}
        vNormalMapUv=cityUV;vRoughnessMapUv=cityUV;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'varying vec3 vCityWorld;\nvarying vec3 vCityNormal;\nuniform sampler2D cityWeatherMap;\nvoid main() {')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 ca=abs(vCityNormal);
        vec2 weatherUV=ca.y>.65?vCityWorld.xz:(ca.x>ca.z?vCityWorld.zy:vCityWorld.xy);
        float weather=texture2D(cityWeatherMap,weatherUV*.065).r;
        ${kind === 'concrete' || kind === 'damp' || kind === 'brick' ? 'diffuseColor.rgb*=1.6;' : ''}
        diffuseColor.rgb*=.88+weather*.30;
        ${kind === 'plaster' ? `float baseDirt=(1.-smoothstep(0.,2.2,vCityWorld.y))*(1.-step(.65,ca.y));
        diffuseColor.rgb*=1.-baseDirt*.23;
        ${building ? 'if(vCityNormal.y>.65)diffuseColor.rgb=vec3(.34,.365,.35)*(.82+weather*.5);' : ''}` : ''}
        ${kind === 'concrete' ? `if(ca.y>.65){vec2 seam=abs(fract(vCityWorld.xz/2.)-.5);float line=smoothstep(.486,.499,max(seam.x,seam.y));diffuseColor.rgb*=1.-line*.15;}` : ''}
        ${kind === 'damp' ? 'diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.65,.78,.61),.35);' : ''}
        ${kind === 'wood' ? `vec2 board=abs(fract(weatherUV/vec2(.22,3.))-.5);float seam=smoothstep(.475,.499,board.x);diffuseColor.rgb*=1.-seam*.24;` : ''}
        ${kind === 'metal' ? 'diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.12,.85,.64),smoothstep(.32,.5,weather)*.16);' : ''}`);
    if (facade) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `vec3 cityFlatNormal=normal;
        #include <normal_fragment_maps>
        normal=normalize(mix(normal,cityFlatNormal,cityGlass));`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        float cityGlass=vSide*(1.-smoothstep(.23,.43,dot(texture2D(map,vMapUv).rgb,vec3(.2126,.7152,.0722))));
        roughnessFactor=mix(roughnessFactor,.24,cityGlass);`);
    }
  };
  mat.customProgramCacheKey = () => `${previousKey}-city-pbr-${kind}-${facade ? 'facade' : 'world'}-${building ? 'roof' : 'prop'}-v1`;
  return mat;
}
