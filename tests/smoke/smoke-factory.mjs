import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium-browser',args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:640,height:480}});
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>{Math.random=()=>.5;});
 await page.goto(`${process.argv[2]??'http://127.0.0.1:4180/rooftop-runner/'}?level=city01&play=1`);
 await page.waitForFunction(()=>window.game?.player?.contactPose,null,{timeout:120000});
 await page.evaluate(()=>{const g=window.game;g.renderFrame(0);g.renderFrame=()=>{};});
 const prepare=async(pos,yaw=0)=>page.evaluate(({pos,yaw})=>{
  const g=window.game,p=g.player;window.dispatchEvent(new Event("blur"));p.respawn();g.stepFixed(70);g.followCamera.yaw=yaw;p.cameraYaw=yaw;
  p.body.setTranslation({x:pos[0],y:pos[1],z:pos[2]},true);p.body.setNextKinematicTranslation({x:pos[0],y:pos[1],z:pos[2]});p.velocity.set(0,-.1,0);p.grounded=false;g.physics.step();g.stepFixed(3);
 },{pos,yaw});
 const walk=async(n,jump=false)=>{await page.keyboard.down('w');if(jump)await page.keyboard.press('Space');await page.evaluate(n=>window.game.stepFixed(n),n);await page.keyboard.up('w');return page.evaluate(()=>({state:window.game.player.fsm.current,...window.game.player.body.translation()}));};
 await prepare([122,.95,-8],-Math.PI/2);let state=await walk(110);assert(state.x<125.6,JSON.stringify(state));console.log('OK locked factory gate blocks passage',state);
 await prepare([122,.95,27.6],-Math.PI/2);state=await walk(100);assert(state.x>130,JSON.stringify(state));console.log('OK broken fence is a usable entrance',state);
 await prepare([196,.95,-21],Math.PI/2);state=await walk(90);assert(state.x>192,JSON.stringify(state));console.log('OK boarded factory door blocks passage',state);
 await prepare([164,2.05,12.5],0);state=await walk(70,true);assert(state.z<9,JSON.stringify(state));console.log('OK running jump through open factory window',state);
 // Real generated windowsill: both grips and a collision-free top-out.
 const sill=await page.evaluate(()=>{
  const g=window.game;const f=g.level.topFaces.find(f=>Math.abs(f.halfX-.95)<.001&&Math.abs(f.halfZ-.575)<.001&&Math.abs(f.y-3.81)<.001&&f.cz>-54&&f.cz<-40);return f;
 });assert(sill,'window ledge registered');
 await prepare([sill.cx,sill.y-.7,sill.cz+sill.halfZ+.45],0);
 await page.evaluate(sill=>{const p=window.game.player;const f=p.level.topFaces.find(f=>f.cx===sill.cx&&f.cz===sill.cz&&f.y===sill.y);p.fsm.transition('AIR');p.climb.grab={face:f,axis:'z',sign:1,t:0};p.fsm.transition('HANG');window.game.stepFixed(18);},sill);
 await page.keyboard.down('w');state=await page.evaluate(()=>{const g=window.game,p=g.player;for(let i=0;i<60;i++){g.stepFixed(1);if(p.fsm.current==='RUN')break;}return {state:p.fsm.current,...p.body.translation()};});await page.keyboard.up('w');assert.equal(state.state,'RUN',JSON.stringify(state));assert(state.y>sill.y+.8);console.log('OK physical windowsill supports mantle',state);
 // Marina frontage railing is a real balance target; feet alternate, rather than slide frozen.
 const target=await page.evaluate(()=>{
  const g=window.game;return g.level.rails.map((r,i)=>({i,p:r.curve.getPointAt(.5)})).find(r=>Math.abs(r.p.x+29)<.1&&Math.abs(r.p.y-1.25)<.01&&r.p.z<-40&&r.p.z>-50);
 });assert(target,'Marina balance rail exists');
 await prepare([target.p.x,target.p.y+1.03,target.p.z],-Math.PI/2);
 await page.keyboard.down('w');
 const gait=await page.evaluate(()=>{
  const g=window.game,p=g.player,samples=[];
  for(let i=0;i<34;i++){
   g.stepFixed(1);
   const feet=p.contactPose.legs.map(l=>l.end.getWorldPosition(l.end.position.clone()));
   samples.push({state:p.fsm.current,feet:feet.map(v=>v.toArray())});
  }
  return samples;
 });await page.keyboard.up('w');
 assert(gait.every(s=>s.state==='BALANCE'),JSON.stringify(gait.slice(-3)));
 const deltas=gait.map(s=>s.feet[0][1]-s.feet[1][1]);
 assert(Math.max(...deltas)>.06&&Math.min(...deltas)<-.06,JSON.stringify(deltas));
 console.log('OK Marina rail has alternating lifted steps');
 assert.deepEqual(errors,[]);console.log('FACTORY + CITY CONTACTS OK');
}finally{await browser.close();}
