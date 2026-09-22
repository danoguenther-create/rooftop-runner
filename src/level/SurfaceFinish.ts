import * as THREE from "three";
let noiseTexture: THREE.DataTexture | undefined;
function finishTexture(): THREE.DataTexture {
  if (noiseTexture) return noiseTexture;
  const pixels = new Uint8Array(256 * 256 * 4);
  let seed = 173;
  for (let i = 0; i < 256 * 256; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const n = 70 + (seed >>> 24) * 0.6;
    pixels.set([n, n, n, 255], i * 4);
  }
  noiseTexture = new THREE.DataTexture(pixels, 256, 256);
  noiseTexture.wrapS = noiseTexture.wrapT = THREE.RepeatWrapping;
  noiseTexture.minFilter = THREE.LinearMipmapLinearFilter;
  noiseTexture.magFilter = THREE.LinearFilter;
  noiseTexture.generateMipmaps = true;
  noiseTexture.needsUpdate = true;
  return noiseTexture;
}
/** World-space material grain with mipmaps: consistent scale and no procedural shader noise cost. */
export function surfaceFinish(
  mat: THREE.MeshStandardMaterial,
  kind: "plaster" | "concrete" | "asphalt" | "metal" | "brick" = "concrete",
): THREE.MeshStandardMaterial {
  const previous = mat.onBeforeCompile.bind(mat);
  const key = mat.customProgramCacheKey();
  mat.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    shader.uniforms.finishMap = { value: finishTexture() };
    shader.vertexShader = shader.vertexShader
      .replace(
        "void main() {",
        "varying vec3 vFinishWorld;\nvarying vec3 vFinishNormal;\nvoid main() {",
      )
      .replace(
        "#include <worldpos_vertex>",
        `#include <worldpos_vertex>
      vec4 finishP=vec4(transformed,1.0);
      #ifdef USE_INSTANCING
      finishP=instanceMatrix*finishP;
      #endif
      vFinishWorld=(modelMatrix*finishP).xyz;
      vFinishNormal=normalize(mat3(modelMatrix)*objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "void main() {",
        `varying vec3 vFinishWorld;
      varying vec3 vFinishNormal;
      uniform sampler2D finishMap;
      void main() {`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
      vec3 fn=abs(vFinishNormal);
      vec2 fp=fn.y>.65?vFinishWorld.xz:(fn.x>fn.z?vFinishWorld.zy:vFinishWorld.xy);
      float fine=texture2D(finishMap,fp*${kind === "asphalt" ? "0.8" : "0.5"}).r;
      float weather=texture2D(finishMap,fp*.025).r;
      diffuseColor.rgb *= ${kind === "metal" ? "0.97 + fine*.06" : "0.76 + fine*.28 + weather*.16"};
      ${kind === "brick" ? `if(fn.y<.75){vec2 cell=fp/vec2(.55,.23);cell.x+=mod(floor(cell.y),2.)*.5;vec2 brick=fract(cell);float mortar=1.-smoothstep(.015,.05,min(brick.x,brick.y));diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.2,.205,.17),mortar*.65);}` : ""}
      ${kind === "asphalt" ? "diffuseColor.rgb += vec3(.026)*step(.76,fine);" : ""}
      ${kind === "concrete" ? `if(fn.y>.75){vec2 grid=abs(fract(vFinishWorld.xz/2.)-.5);float joint=smoothstep(.49,.499,max(grid.x,grid.y));diffuseColor.rgb*=1.-joint*.18;}` : ""}`,
      );
  };
  mat.customProgramCacheKey = () => key + "-finish-" + kind;
  return mat;
}
