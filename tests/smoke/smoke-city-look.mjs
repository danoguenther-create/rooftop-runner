import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium-browser',args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader']});
const root=process.argv[2]??'http://127.0.0.1:4180/rooftop-runner/';
try {
 for(const fallback of [false,true]){
  const page=await browser.newPage({viewport:{width:800,height:500}}),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('net::ERR_FAILED'))errors.push(m.text());});
  if(fallback)await page.route('**/textures/city/**',route=>route.abort());
  await page.goto(`${root}?level=city01&mode=split&play=1`);
  await page.waitForFunction(()=>window.game?.state==='PLAYING'&&window.game.players.every(p=>p.contactPose),null,{timeout:120000});
  const result=await page.evaluate(()=>{
   const g=window.game;g.renderFrame(0);g.renderFrame=()=>{};
   const surfaces=new Set(),invalid=[];
   g.scene.traverse(m=>{const mat=m.material;if(!mat?.userData.citySurface)return;surfaces.add(mat.userData.citySurface);if(!mat.normalMap?.image||!mat.roughnessMap?.image)invalid.push(mat.userData.citySurface);});
   g.setQuality(false);const low=g.sun.castShadow;g.setQuality(true);
   return{players:g.players.length,faces:g.level.topFaces.length,rails:g.level.rails.length,upgrade:g.scene.getObjectByName('City material upgrade')?.userData??null,surfaces:[...surfaces],invalid,qualityRestored:!low&&g.sun.castShadow};
  });
  console.log(JSON.stringify({fallback,...result,errors}));assert.equal(result.players,2);assert.equal(result.faces,5977);assert.equal(result.rails,275);assert(result.qualityRestored);assert.deepEqual(result.invalid,[]);assert.deepEqual(errors,[]);
  if(fallback)assert.equal(result.upgrade,null);else{assert.equal(result.upgrade.ventCount,30);for(const kind of ['plaster','concrete','brick','metal','wood','asphalt','damp','sand','foliage','water'])assert(result.surfaces.includes(kind));}
  await page.close();
 }
 console.log('CITY PBR, SPLITSCREEN, QUALITY SWITCH AND ASSET FALLBACK OK');
}finally{await browser.close();}
