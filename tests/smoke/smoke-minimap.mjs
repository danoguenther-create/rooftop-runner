import assert from 'node:assert/strict';import {chromium} from 'playwright-core';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium-browser',args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader']});
try{const page=await browser.newPage({viewport:{width:1000,height:700}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(`${process.argv[2]??'http://127.0.0.1:4180/rooftop-runner/'}?level=city01&mode=split&play=1&nochar=1`);await page.waitForFunction(()=>window.game?.state==='PLAYING',null,{timeout:120000});
 const result=await page.evaluate(()=>{const g=window.game;g.stepFixed(1);g.renderFrame=()=>{};
  g.players.forEach((p,i)=>p.body.setTranslation({x:140+i*60,y:.9,z:35},true));
  const s=g.police;s.patrols[0].phase='chasing';s.officers[0].boarded=false;s.officers[0].body.setTranslation({x:145,y:.85,z:35},true);
  g.minimaps.forEach(m=>m.update(1));
  return{shared:g.minimaps[0].background===g.minimaps[1].background,maps:g.minimaps.map(m=>({player:m.element.dataset.player,nearest:m.element.dataset.nearest,nearby:m.element.dataset.nearby,bounds:m.element.getBoundingClientRect().toJSON(),image:m.canvas.toDataURL()}))};});
 assert.equal(result.maps.length,2);assert(result.shared);assert.equal(result.maps[0].nearest,'5');assert.equal(result.maps[1].nearest,'55');assert.equal(result.maps[0].nearby,'1');assert.equal(result.maps[1].nearby,'1');assert.notEqual(result.maps[0].image,result.maps[1].image);assert(result.maps[0].bounds.right<500&&result.maps[1].bounds.left>=500);
 await page.screenshot({path:'artifacts/minimap-split.png'});
 await page.evaluate(()=>{const g=window.game;g.police.officers[0].boarded=true;g.police.patrols[0].phase='idle';g.minimaps.forEach(m=>m.update(1));});assert.deepEqual(await page.locator('.hud-minimap').evaluateAll(m=>m.map(x=>x.dataset.nearest)),['','']);
 assert.deepEqual(errors,[]);console.log('INDEPENDENT SPLIT MINIMAPS, POLICE DISTANCE, MARKERS AND CLEANUP OK');
}finally{await browser.close();}
