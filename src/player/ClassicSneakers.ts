import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Original, stylized geometry based on the Classic Nylon Pure Grey silhouette.
// Built in rest-pose world space, then bound to each foot so IK and P2 cloning work.
export function fitClassicSneakers(model: THREE.Group): void {
  model.updateMatrixWorld(true);
  const feet: THREE.Bone[]=[];
  model.traverse(o=>{if((o as THREE.Bone).isBone && /(?:Left|Right)Foot$/.test(o.name)) feet.push(o as THREE.Bone);});
  if(feet.length!==2 || model.getObjectByName('Classic NYL Pure Grey')) return;
  const cutoff=Math.min(...feet.map(f=>f.getWorldPosition(new THREE.Vector3()).y))+.046;
  model.traverse(o=>{
    const mesh=o as THREE.SkinnedMesh;
    if(!mesh.isSkinnedMesh) return;
    const geometry=mesh.geometry.clone(),position=geometry.getAttribute('position'),index=geometry.index;
    const below=Array.from({length:position.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld).y<cutoff);
    const kept:number[]=[];
    for(let i=0;i<(index?.count??position.count);i+=3){
      const a=index?index.getX(i):i,b=index?index.getX(i+1):i+1,c=index?index.getX(i+2):i+2;
      if(!(below[a]||below[b]||below[c]))kept.push(a,b,c);
    }
    geometry.setIndex(kept);mesh.geometry=geometry;
  });
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.86});
  const labelCanvas=document.createElement('canvas');labelCanvas.width=512;labelCanvas.height=128;
  const ctx=labelCanvas.getContext('2d')!;
  ctx.fillStyle='#eeefeb';ctx.fillRect(0,0,512,128);
  ctx.fillStyle='#34383c';ctx.font='italic bold 76px Arial';ctx.fillText('Reebok',10,88);
  ctx.fillStyle='#374e6b';ctx.fillRect(369,28,125,72);
  ctx.strokeStyle='#f4f3ed';ctx.lineWidth=15;ctx.beginPath();ctx.moveTo(369,28);ctx.lineTo(494,100);ctx.moveTo(494,28);ctx.lineTo(369,100);ctx.stroke();
  ctx.fillStyle='#eeeeea';ctx.fillRect(414,28,32,72);ctx.fillRect(369,49,125,29);
  ctx.fillStyle='#b9494e';ctx.fillRect(423,28,14,72);ctx.fillRect(369,58,125,11);
  const labelTexture=new THREE.CanvasTexture(labelCanvas);labelTexture.colorSpace=THREE.SRGBColorSpace;
  const labelMaterial=new THREE.MeshStandardMaterial({map:labelTexture,roughness:.85,side:THREE.DoubleSide});
  for(const foot of feet){
    const origin=foot.getWorldPosition(new THREE.Vector3());
    const toe=foot.children.find(c=>c.name.endsWith('ToeBase'))!;
    const forward=toe.getWorldPosition(new THREE.Vector3()).sub(origin).setY(0).normalize();
    const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),forward);
    const group=new THREE.Group();group.name='Classic NYL Pure Grey';
    const frame=new THREE.Matrix4().makeBasis(right,new THREE.Vector3(0,1,0),forward);
    frame.setPosition(origin.x,origin.y-.113,origin.z);
    const local=new THREE.Matrix4().copy(foot.matrixWorld).invert().multiply(frame);
    local.decompose(group.position,group.quaternion,group.scale);foot.add(group);
    const pieces:THREE.BufferGeometry[]=[];
    function add(g:THREE.BufferGeometry,color:string){
      const c=new THREE.Color(color),colors=new Float32Array(g.getAttribute('position').count*3);
      for(let i=0;i<colors.length;i+=3)c.toArray(colors,i);
      g.deleteAttribute('uv');
      g.setAttribute('color',new THREE.BufferAttribute(colors,3));pieces.push(g);
    }
    // Cross sections: heel, waist, ball and rounded toe; Y is sole height.
    const sections=[[-.09,.028,.12],[-.076,.057,.16],[-.025,.062,.166],[.045,.064,.132],[.12,.071,.095],[.195,.065,.07],[.23,.045,.057],[.245,.005,.041]];
    function shell(base:number,height:number,color:string){
      if(height>=0){
        const outline=new THREE.Shape();outline.moveTo(sections[0][1],-sections[0][0]);
        for(const [z,w] of sections.slice(1))outline.lineTo(w,-z);
        for(const [z,w] of [...sections].reverse())outline.lineTo(-w,-z);
        outline.closePath();
        const sole=new THREE.ExtrudeGeometry(outline,{depth:height,bevelEnabled:true,bevelThickness:.0015,bevelSize:.0015,bevelSegments:1,steps:1});
        // The merged shoe uses one material and indexed geometry throughout.
        const count=sole.getAttribute('position').count;sole.setIndex(Array.from({length:count},(_,i)=>i));
        sole.rotateX(-Math.PI/2);sole.translate(0,base,0);add(sole,color);return;
      }
      const pos:number[]=[],indices:number[]=[];const N=16;
      for(const [z,width,top] of sections)for(let k=0;k<=N;k++){
        const a=k/N*Math.PI*2;
        pos.push(Math.cos(a)*width,base+(height<0?Math.max(0,Math.sin(a))*(top-base):(Math.sin(a)>=0?height:0)),z);
      }
      for(let j=0;j<sections.length-1;j++)for(let k=0;k<N;k++){
        const a=j*(N+1)+k,b=a+N+1;indices.push(a,a+1,b,b,a+1,b+1);
      }
      for(const j of [0,sections.length-1])for(let k=1;k<N-1;k++){
        const a=j*(N+1);indices.push(...(j===0?[a,a+k+1,a+k]:[a,a+k,a+k+1]));
      }
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(indices);g.computeVertexNormals();add(g,color);
      if(height<0){const colors=g.getAttribute('color');const suede=new THREE.Color('#7b8287');for(let i=0;i<pos.length/3;i++)if(pos[i*3+2]>.155||pos[i*3+2]<-.045)colors.setXYZ(i,suede.r,suede.g,suede.b);}
    }
    shell(0,.018,'#bfc1bd');shell(.014,.029,'#f0f0e9');shell(.037,-1,'#8e9599');
    // Suede toe cap, heel wrap, eyestays and tongue. Rounded panels share one draw call.
    function oval(x:number,y:number,z:number,sx:number,sy:number,sz:number,color:string){const g=new THREE.SphereGeometry(1,12,8);g.scale(sx,sy,sz);g.translate(x,y,z);add(g,color);}
    oval(0,.143,-.015,.037,.032,.075,'#91989b');
    for(const sign of [-1,1]){
      oval(sign*.043,.118,.036,.014,.023,.077,'#747d82');
      // Paired white leather stripes, each following the side contour.
      for(const shift of [0,.043]){
        const p:number[]=[],indices:number[]=[];
        for(let k=0;k<=12;k++) for(let edge=0;edge<2;edge++){
          const t=k/12,z=THREE.MathUtils.lerp(.116-shift-edge*.025,-.055-shift*.4-edge*.008,t),y=THREE.MathUtils.lerp(.056,.131-edge*.018,t);
          const j=Math.max(0,Math.min(sections.length-2,sections.findIndex(s=>s[0]>z)-1));
          const a=sections[j],b=sections[j+1],f=(z-a[0])/(b[0]-a[0]);
          const w=THREE.MathUtils.lerp(a[1],b[1],f),h=THREE.MathUtils.lerp(a[2],b[2],f);
          const x=w*Math.sqrt(Math.max(0,1-Math.pow((y-.037)/(h-.037),2)))+.003;
          p.push(sign*x,y,z);
        }
        for(let k=0;k<12;k++){const a=k*2;indices.push(...(sign===1?[a,a+1,a+2,a+1,a+3,a+2]:[a,a+2,a+1,a+1,a+2,a+3]));}
        const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(indices);g.computeVertexNormals();add(g,'#eeefea');
      }
      const label=new THREE.Mesh(new THREE.PlaneGeometry(.09,.021),labelMaterial);
      label.userData.preserveColor=true;
      label.position.set(sign*.064,.128,.007);label.rotation.y=sign*Math.PI/2;label.rotation.z=sign*-.15;group.add(label);
    }
    for(let k=0;k<5;k++){
      const z=.087-k*.025,y=.13+k*.007;
      const a=new THREE.Vector3(-.036,y,z),b=new THREE.Vector3(.036,y+.002,z-.008),d=b.clone().sub(a);
      const lace=new THREE.CylinderGeometry(.0035,.0035,d.length(),5);lace.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));lace.translate(...a.add(b).multiplyScalar(.5).toArray());add(lace,'#c4c9c8');
    }
    const shoe=new THREE.Mesh(mergeGeometries(pieces),material);shoe.userData.preserveColor=true;shoe.castShadow=true;group.add(shoe);
    pieces.forEach(g=>g.dispose());
  }
}
