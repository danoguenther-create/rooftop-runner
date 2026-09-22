/** Real collider/rig regressions for rotated ledges, blocked top-outs and both players. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium-browser',args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:640,height:480}});
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(`${process.argv[2]??'http://127.0.0.1:4180/rooftop-runner/'}?level=testlevel&mode=split&play=1`);
 await page.waitForFunction(()=>window.game?.players.length===2&&window.game.players.every(p=>p.contactPose),null,{timeout:120000});
 const result=await page.evaluate(()=>{
  const g=window.game;g.renderFrame(0);g.renderFrame=()=>{};g.stepFixed(65);
  const models=g.players.map(p=>{const meshes=[];p.characterModel.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);});return meshes;});
  const clothing=models.map(meshes=>meshes.some(m=>m.geometry.userData.baggyPants));
  const independent=models[0][0].skeleton.bones[0]!==models[1][0].skeleton.bones[0];
  const grips=[];
  for(const [i,p] of g.players.entries()){
   const x=400+i*20,rot=(i===0?1:-1)*Math.PI/4;
   g.level.registerBoxPhysics([x,1.5,0],[4,3,2],rot,0);
   const face=g.level.topFaces.at(-1);g.physics.step();
   for(const axis of ['x','z'])for(const sign of [-1,1]){
    p.climb.grab={face,axis,sign,t:0};
    const out=p.mesh.position.clone();
    grips.push({valid:p.climb.validGrip(p),clear:p.climb.mantleTarget(p,out)});
   }
   // A covering ceiling must prevent a top-out even though the edge itself is valid.
   p.climb.grab={face,axis:'z',sign:1,t:0};
   g.level.registerBoxPhysics([x,4.5,0],[6,.2,6],rot,0);g.physics.step();
   grips.push({valid:p.climb.validGrip(p),blocked:!p.climb.mantleTarget(p,p.mesh.position.clone())});
   p.climb.grab={face:{...face,y:face.y+.5},axis:'z',sign:1,t:0};
   grips.push({phantomRejected:!p.climb.validGrip(p)});
   p.climb.grab=null;
  }
  const shoes=g.players.map(p=>{const found=[];p.characterModel.traverse(o=>{if(o.name==='Classic NYL Pure Grey')found.push({parent:o.parent.name,meshes:o.children.filter(c=>c.isMesh).map(c=>({vertices:c.geometry.getAttribute('position').count,color:c.material.color.getHexString()}))});});return found;});
  return {clothing,independent,grips,shoes};
 });
 assert.deepEqual(result.clothing,[true,true]);assert(result.independent);
 for(const grip of result.grips)for(const value of Object.values(grip))assert.equal(value,true,JSON.stringify(result));
 for(const pair of result.shoes){assert.equal(pair.length,2);assert(pair.every(s=>s.parent.endsWith('Foot')&&s.meshes.every(m=>m.vertices>0&&m.color==='ffffff')));}
 console.log('OK grey Classic Nylon shoes on both independent foot rigs');
 console.log('OK both players have baggy trousers and independent skeletons');
 console.log('OK rotated collider edges, blocked top-outs and phantom ledge rejection',result.grips);
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
