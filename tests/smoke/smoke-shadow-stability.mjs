import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium-browser',args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:800,height:500}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(`${process.argv[2]??'http://127.0.0.1:4180/rooftop-runner/'}?level=city01&showcase=mill&mode=split&play=1`);
 await page.waitForFunction(()=>window.game?.state==='PLAYING'&&window.game.players.every(p=>p.contactPose),null,{timeout:120000});
 const r=await page.evaluate(()=>{
  const g=window.game,render=g.renderFrame.bind(g);g.renderFrame=()=>{};
  render(0);const sun=g.sun,origin=sun.target.position.clone();
  const right=sun.shadow.camera.matrixWorld.elements.slice(0,3);
  let updates=0;const update=sun.shadow.updateMatrices.bind(sun.shadow);
  sun.shadow.updateMatrices=(...args)=>{updates++;return update(...args);};
  const snapshots=[];
  for(const distance of [0,.002,.06]){
   g.player.body.setTranslation({x:origin.x+right[0]*distance,y:origin.y+right[1]*distance,z:origin.z+right[2]*distance},true);
   updates=0;render(0);
   const uv=origin.clone().applyMatrix4(sun.shadow.matrix);
   snapshots.push({uv:uv.toArray(),updates});
  }
  const floorTops=[];
  g.level.group.traverse(mesh=>{
   if(!mesh.isInstancedMesh||mesh.material.customProgramCacheKey()!=='mill-concrete-blender-pbr-v1')return;
   const matrix=sun.shadow.matrix.clone();
   for(let i=0;i<mesh.count;i++){
    mesh.getMatrixAt(i,matrix);const e=matrix.elements;
    if(Math.abs(e[13]+.03)<.001&&Math.abs(e[14]+10)<.001)floorTops.push(e[13]+e[5]/2);
   }
  });
  return {floorTops,snapshots,mapWidth:sun.shadow.mapSize.x,players:g.players.length};
 });
 console.log(JSON.stringify(r));assert.equal(r.players,2);assert.equal(r.floorTops.length,2);assert(r.floorTops.every(y=>y>.019&&y<.021),'Mill floor must not overlap the yard surface');
 for(const s of r.snapshots)assert.equal(s.updates,1,'One shadow-map update shared by both views');
 for(let i=0;i<3;i++)assert(Math.abs(r.snapshots[0].uv[i]-r.snapshots[1].uv[i])<1e-7,'Subtexel movement must not move static shadows');
 const delta=(r.snapshots[2].uv[0]-r.snapshots[0].uv[0])*r.mapWidth;
 assert(Math.abs(delta)>=1&&Math.abs(delta-Math.round(delta))<1e-6,'Shadow movement must land on whole texels');
 assert.deepEqual(errors,[]);console.log('FACTORY SHADOW STABILITY + SHARED SPLIT MAP OK');
}finally{await browser.close();}
