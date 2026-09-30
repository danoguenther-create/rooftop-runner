import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium-browser',args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader']});
const root=process.argv[2]??'http://127.0.0.1:4180/rooftop-runner/';
const output='artifacts/city-look';mkdirSync(output,{recursive:true});const reports=[];
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
try {
 for(const look of ['original','trial']){
  const page=await browser.newPage({viewport:{width:1200,height:760}}),errors=[];
  page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`${root}?level=city01&mode=split&play=1&look=${look}`);
  await page.waitForFunction(()=>window.game?.state==='PLAYING'&&window.game.players.every(p=>p.contactPose));
  const state=await page.evaluate(()=>{
   const g=window.game;g.stepFixed(30);g.reviewRender=g.renderFrame.bind(g);g.renderFrame=()=>{};
   g.renderer.info.autoReset=false;g.renderer.info.reset();g.reviewRender(0);
   const surfaces={};g.scene.traverse(m=>{const kind=m.material?.userData.citySurface;if(kind)surfaces[kind]=(surfaces[kind]??0)+1;});
   return {faces:g.level.topFaces.map(f=>[f.cx,f.cz,f.y,f.halfX,f.halfZ,f.rotY]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),rails:g.level.rails.map(r=>r.samples.map(v=>v.toArray())).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),surfaces,upgrade:g.scene.getObjectByName('City material upgrade')?.userData,calls:g.renderer.info.render.calls,triangles:g.renderer.info.render.triangles,players:g.players.length};
  });
  await page.screenshot({path:`${output}/${look}-split.jpg`,type:'jpeg',quality:88});
  const views=[['street',[-18,2.5,-39],[-29,5,-54]],['rooftop',[-45,14,-64],[-49.5,11.5,-58.3]],['workshop',[164,3,48],[176,4,35]],['sewer',[155.2,-3.3,-10],[155.2,-4.8,-27]],['coast',[14,4,117],[2,2,143]]];
  const captures=[];
  for(const [name,pos,target] of views){
   const stats=await page.evaluate(({pos,target})=>{
    const g=window.game;g.mode='solo';g.renderer.setViewport(0,0,1200,760);g.camera.aspect=1200/760;g.camera.updateProjectionMatrix();
    g.camera.position.set(...pos);g.camera.lookAt(...target);g.player.body.setTranslation({x:target[0],y:target[1],z:target[2]},true);
    g.renderer.info.reset();g.reviewRender(0);return {calls:g.renderer.info.render.calls,triangles:g.renderer.info.render.triangles};
   },{pos,target});
   await page.screenshot({path:`${output}/${look}-${name}.jpg`,type:'jpeg',quality:88});captures.push({name,...stats});
  }
  const report={look,faces:state.faces.length,rails:state.rails.length,faceHash:hash(state.faces),railHash:hash(state.rails),surfaces:state.surfaces,upgrade:state.upgrade,calls:state.calls,triangles:state.triangles,players:state.players,captures,errors};
  reports.push(report);console.log(JSON.stringify(report));assert.deepEqual(errors,[]);await page.close();
 }
 assert.equal(reports[0].faceHash,reports[1].faceHash,'All traversal surfaces must remain identical');assert.equal(reports[0].railHash,reports[1].railHash,'All rails must remain identical');
 assert(reports[1].upgrade.ventCount>=30);for(const kind of ['plaster','asphalt','wood','metal','damp','brick','concrete','water','foliage','sand'])assert(reports[1].surfaces[kind]>0,`${kind} missing`);
 writeFileSync(`${output}/comparison.json`,JSON.stringify(reports,null,2));
 console.log('CITY LOOK: SURFACES, RAILS, BOTH PLAYERS AND BROWSER RENDERS OK');
}finally{await browser.close();}
