import {chromium} from 'playwright-core';
import {mkdirSync} from 'node:fs';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium-browser',args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:900,height:800}});const errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`${process.argv[2]??'http://127.0.0.1:4180/rooftop-runner/'}?level=testlevel&play=1&mode=split`);
 await page.waitForFunction(()=>window.game?.players.length===2&&window.game.players.every(p=>p.contactPose),null,{timeout:120000});
 await page.evaluate(()=>{const g=window.game;g.reviewRender=g.renderFrame.bind(g);g.renderFrame=()=>{};g.stepFixed(90);g.followCamera.update=()=>{};});
 mkdirSync('artifacts/outfit',{recursive:true});
 for(const [name,offset,look] of [['outfit',[1.9,1.1,2.7],[0,.05,0]],['shoes',[.75,-.55,.65],[0,-.7,.05]]]){
  const report=await page.evaluate(({offset,look})=>{const g=window.game,p=g.player,t=p.body.translation();g.camera.position.set(t.x+offset[0],t.y+offset[1],t.z+offset[2]);g.camera.lookAt(t.x+look[0],t.y+look[1],t.z+look[2]);g.renderer.setScissorTest(false);g.renderer.setViewport(0,0,900,800);g.camera.aspect=900/800;g.camera.updateProjectionMatrix();g.renderer.render(g.scene,g.camera);const shoes=[];g.players.forEach((p,i)=>p.characterModel.traverse(o=>{if(o.name==='Classic NYL Pure Grey')shoes.push({player:i,parent:o.parent.name,position:o.getWorldPosition(o.position.clone()).toArray()});}));return shoes;},{offset,look});
  await page.screenshot({path:`artifacts/outfit/${name}.jpg`,type:'jpeg',quality:85});console.log(name,report);
 }
 console.log('errors',errors);if(errors.length)process.exitCode=1;
}finally{await browser.close();}
