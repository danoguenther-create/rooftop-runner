import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium-browser',args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:640,height:480}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(`${process.argv[2]??'http://127.0.0.1:4180/rooftop-runner/'}?level=city01&play=1`);
 await page.waitForFunction(()=>window.game?.player?.contactPose,null,{timeout:120000});
 await page.evaluate(()=>{const g=window.game;g.renderFrame(0);g.renderFrame=()=>{};});
 const prepare=async(pos,yaw)=>page.evaluate(({pos,yaw})=>{
  const g=window.game,p=g.player;window.dispatchEvent(new Event('blur'));p.respawn();g.stepFixed(70);g.followCamera.yaw=yaw;p.cameraYaw=yaw;
  p.body.setTranslation({x:pos[0],y:pos[1],z:pos[2]},true);p.body.setNextKinematicTranslation({x:pos[0],y:pos[1],z:pos[2]});p.velocity.set(0,0,0);p.grounded=false;p.fsm.transition('AIR');p.beginAirborne();g.physics.step();g.stepFixed(15);
 },{pos,yaw});
 const route=async(target,jump=false,max=180)=>{
  await page.waitForTimeout(320); // Separate deliberate jumps from the new double-tap dive.
  await page.keyboard.down('w');if(jump)await page.keyboard.press('Space');
  const result=await page.evaluate(({target,max})=>{const g=window.game,p=g.player;const states=new Set();let reached=false;
   for(let i=0;i<max;i++){g.stepFixed(1);states.add(p.fsm.current);const v=p.body.translation();if(p.fsm.current==='RUN'&&Math.abs(v.x-target[0])<1.35&&Math.abs(v.z-target[2])<.65&&Math.abs(v.y-target[1])<.35){reached=true;break;}}
   return {reached,states:[...states],...p.body.translation(),state:p.fsm.current,fall:p.lastFallHeight,peak:p.peakY,flip:p.airTricks.active,pending:p.pendingLanding};
  },{target,max});await page.keyboard.up('w');console.log('route',target,result);return result;
 };
 // Entire crane approach, no teleport between obstacles or fence sides.
 await prepare([109,.96,-40],-Math.PI/2);
 for(const target of [[112,1.8,-40],[115,3.3,-40],[119,5.7,-40],[124.5,6.51,-40],[128,6.51,-40],[135,6.51,-40]]){
  const r=await route(target,target[0]<128);assert(r.reached&&!r.states.includes('BAIL'),JSON.stringify(r));
 }
 console.log('OK continuous container/crane route crosses the perimeter');
 // Window-only access for every building, including both expanded halls.
 for(const [name,x,z,y,inside] of [['main',164,12.5,2,6],['workshop',186.5,40.2,1.72,35],['turbine',237.5,-2.8,2.02,-9],['boiler',236.5,53.2,2.02,47]]){
  await prepare([x,y,z],0);await page.keyboard.down('w');await page.keyboard.press('Space');
  const r=await page.evaluate(inside=>{const g=window.game,p=g.player;const states=new Set();for(let i=0;i<180;i++){g.stepFixed(1);states.add(p.fsm.current);if(p.body.translation().z<inside)break;}return{...p.body.translation(),states:[...states]};},inside);
  await page.keyboard.up('w');assert(r.z<inside,`${name}: ${JSON.stringify(r)}`);console.log('OK accessible window',name,r);
 }
 // Doorways remain blocked instead of hiding passable gaps behind timber.
 for(const [x,z] of [[192,-21],[173,30],[258,-27],[256,35]]){
  const west=x===173;await prepare([x+(west?-3:3),.95,z],west?-Math.PI/2:Math.PI/2);
  await page.keyboard.down('w');const end=await page.evaluate(()=>{window.game.stepFixed(90);return window.game.player.body.translation();});await page.keyboard.up('w');
  assert(west?end.x<x:end.x>x,JSON.stringify(end));console.log('OK boarded door blocks',x,z);
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
