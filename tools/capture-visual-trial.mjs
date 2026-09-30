import {chromium} from 'playwright-core';
import {mkdirSync,writeFileSync} from 'node:fs';
const b=await chromium.launch({executablePath:'/usr/bin/chromium-browser',args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader']});
const root=process.argv[2]??'http://127.0.0.1:4180/rooftop-runner/';
const reports=[];mkdirSync('artifacts/visual-trial',{recursive:true});
try{
 for(const look of ['original','trial'])for(const mode of ['solo','split']){
  const page=await b.newPage({viewport:{width:1280,height:800}});page.setDefaultTimeout(120000);const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`${root}?level=city01&showcase=mill&mode=${mode}&play=1&look=${look}`);
  await page.waitForFunction(()=>window.game?.state==='PLAYING'&&window.game.players.every(p=>p.contactPose));
  const report=await page.evaluate(()=>{
   const g=window.game;g.stepFixed(60);g.reviewRender=g.renderFrame.bind(g);g.renderFrame=()=>{};
   g.renderer.info.autoReset=false;g.renderer.info.reset();g.reviewRender(0);
   const calls=g.renderer.info.render.calls,triangles=g.renderer.info.render.triangles;
   return{players:g.players.length,calls,triangles,faces:g.level.topFaces.length,rails:g.level.rails.length,
    materials:g.players.map(p=>{const r=[];p.characterModel.traverse(m=>{if(m.material?.userData.fabricPreview)r.push({mask:!!m.geometry.attributes.clothMask,key:m.material.customProgramCacheKey()});});return r;})};
  });
  await page.screenshot({path:`artifacts/visual-trial/${look}-${mode}.jpg`,type:'jpeg',quality:88});
  if(mode==='solo')for(const [name,pos,lookAt] of [
   ['interior',[169,3.1,4],[155,2,-15]],['machines',[158,2.7,-2],[155,1.3,-8]],
   ['character',[166.8,1.6,.6],[165,1,3]],['exterior',[132,13,25],[166,12,0]],
  ]){
   await page.evaluate(({pos,lookAt})=>{const g=window.game;g.followCamera.update=()=>{};g.camera.position.set(...pos);g.camera.lookAt(...lookAt);g.reviewRender(0);},{pos,lookAt});
   await page.screenshot({path:`artifacts/visual-trial/${look}-${name}.jpg`,type:'jpeg',quality:88});
  }
  reports.push({look,mode,...report,errors});console.log(JSON.stringify(reports.at(-1)));await page.close();
 }
 writeFileSync('artifacts/visual-trial/comparison.json',JSON.stringify(reports,null,2));
 if(reports.some(r=>r.errors.length))process.exitCode=1;
}finally{await b.close();}
