import {chromium} from 'playwright-core';
import {mkdirSync,writeFileSync} from 'node:fs';
const b=await chromium.launch({executablePath:'/usr/bin/chromium-browser',args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await b.newPage({viewport:{width:800,height:600}});page.setDefaultTimeout(120000);
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`${process.argv[2]??'http://127.0.0.1:4180/rooftop-runner/'}?level=city01&play=1`);
 await page.waitForFunction(()=>window.game?.state==='PLAYING');
 await page.evaluate(()=>{const g=window.game;g.stepFixed(60);g.followCamera.update=()=>{};g.reviewRender=g.renderFrame.bind(g);g.renderFrame=()=>{};});
 mkdirSync('artifacts/factory',{recursive:true});
 for(const [name,pos,look] of [
  ['baggy',[-5,13.8,-21],[-8.5,13,-24]],
  ['factory-yard',[121,18,52],[170,3,0]],
  ['factory-hole',[119,2.2,31],[130,1.5,27.6]],
  ['factory-window',[156,4,18],[164,2.5,9]],
  ['factory-interior',[165,4,5],[169,3,-19]],
  ['factory-upper',[182,8,-19],[153,4,-9]],
  ['marina',[-34,2,-40],[-29,1.3,-44]],
 ]){
  await page.evaluate(({pos,look})=>{const g=window.game;g.camera.position.set(...pos);g.camera.lookAt(...look);g.reviewRender(0);g.hintEl.style.display='none';},{pos,look});
  await page.screenshot({path:`artifacts/factory/${name}.jpg`,type:'jpeg',quality:80});
 }
 const report=await page.evaluate(()=>({calls:window.game.renderer.info.render.calls,rails:window.game.level.rails.length,faces:window.game.level.topFaces.length,baggy:(()=>{const meshes=[];window.game.player.characterModel.traverse(c=>{if(c.isSkinnedMesh)meshes.push(c.geometry.userData);});return meshes;})()}));
 writeFileSync('artifacts/factory/report.json',JSON.stringify({report,errors},null,2));console.log({report,errors});if(errors.length)process.exitCode=1;
}finally{await b.close();}
