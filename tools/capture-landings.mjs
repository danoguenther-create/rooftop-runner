/** Landing review: precision on a narrow wall, standing and running roof landings, phase by phase. */
import {chromium} from 'playwright-core';
import {mkdir} from 'node:fs/promises';
await mkdir('artifacts/landings',{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium-browser',args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:720,height:720}});
 await page.goto(`${process.argv[2]??'http://127.0.0.1:4180/rooftop-runner/'}?level=city01&play=1`);
 await page.waitForFunction(()=>window.game?.state==='PLAYING'&&window.game?.player?.animator,null,{timeout:120000});
 await page.evaluate(()=>{const g=window.game;g.reviewRender=g.renderFrame.bind(g);g.renderFrame=()=>{};g.police.update=()=>{};g.police.fixedUpdate=()=>{};g.followCamera.update=()=>{};g.hintEl&&(g.hintEl.style.display='none');g.stepFixed(30);
  window.__drop=(x,y,z,vx,vz)=>{const p=g.player;p.respawn();g.stepFixed(2);const at={x,y:y+.93,z};p.body.setTranslation(at,true);p.body.setNextKinematicTranslation(at);p.fsm.transition('AIR');p.beginAirborne();p.velocity.set(vx,0,vz);g.physics.step();};
  window.__frame=(dt)=>{const g=window.game;g.stepFixed(1);g.player.update(1/60);};
  window.__view=(side)=>{const g=window.game,t=g.player.body.translation();g.camera.position.set(t.x+side[0],t.y+side[1],t.z+side[2]);g.camera.lookAt(t.x,t.y-.3,t.z);g.reviewRender(0);};
 });
 const scenario=async(name,drop,side,offsets)=>{
  await page.evaluate(d=>window.__drop(...d),drop);
  // Descend until just before touchdown for the "reach" shot.
  await page.evaluate(()=>{const g=window.game,p=g.player;for(let i=0;i<300&&p.fsm.current==='AIR';i++){window.__frame();const t=p.body.translation();const v=-p.velocity.y;if(v>1.5){const hit=g.physics.world.castRay({origin:{x:t.x,y:t.y,z:t.z},dir:{x:0,y:-1,z:0}},6,true,undefined,undefined,p.collider,p.body);if(hit&&(hit.timeOfImpact-.925)/v<.12)break;}}});
  await page.evaluate(s=>window.__view(s),side);await page.screenshot({path:`artifacts/landings/${name}-0-reach.png`});
  let age=0;
  for(const [k,off] of offsets.entries()){
   await page.evaluate(n=>{for(let i=0;i<n;i++)window.__frame();},Math.round((off-age)*60));age=off;
   await page.evaluate(s=>window.__view(s),side);await page.screenshot({path:`artifacts/landings/${name}-${k+1}-${Math.round(off*1000)}ms.png`});
  }
 };
 await scenario('precision-wall',[-240,3.2,12.7,0,0],[2.6,.2,1.6],[.12,.22,.35,.5]);
 await scenario('standing-roof',[-8.5,14,-21,0,0],[2.6,.4,1.8],[.12,.22,.35]);
 await scenario('running-roof',[-15,13.6,-21,6.5,0],[1.5,.4,3],[.08,.18,.3]);
}finally{await browser.close();}
