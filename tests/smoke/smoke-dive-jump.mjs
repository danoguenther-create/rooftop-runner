import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium-browser',args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:800,height:600}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(`${process.argv[2]??'http://127.0.0.1:4180/rooftop-runner/'}?level=testlevel&mode=split&play=1`);
 await page.waitForFunction(()=>window.game?.state==='PLAYING'&&window.game?.players.length===2&&window.game.players.every(p=>p.contactPose),null,{timeout:120000});
 await page.evaluate(()=>{const g=window.game;g.renderFrame(0);g.renderFrame=()=>{};g.stepFixed(80);});
 for(const crate of [false,true])for(const i of [0,1]){
  const r=await page.evaluate(({i,crate})=>{
   const g=window.game,p=g.players[i],code=i?'ArrowUp':'KeyW',key=i?'ArrowUp':'w',x=35+i*8;
   const event=(type,repeat=false)=>window.dispatchEvent(new KeyboardEvent(type,{code,key,repeat}));
   p.respawn();g.stepFixed(80);if(!crate)g.level.registerBoxPhysics([x,-.5,-10],[4,1,60],0,0);
   if(crate)g.level.registerBoxPhysics([x,1,-18.3],[2,2,.8],0,0);
   p.body.setTranslation({x,y:.95,z:-20},true);p.body.setNextKinematicTranslation({x,y:.95,z:-20});p.velocity.set(0,0,0);p.fsm.transition('AIR');p.beginAirborne();g.physics.step();g.stepFixed(20);
   event('keydown');g.stepFixed(1);event('keydown',true);g.stepFixed(1);const single=p.diveJumpActive;
   event('keyup');event('keydown');g.stepFixed(1);
   const started=p.diveJumpActive,launch=p.velocity.y,other=g.players[1-i].diveJumpActive;
   if(i===1)event('keyup');
   const hips=p.contactPose.bones.get('Hips'),hand=p.contactPose.bones.get('LeftHand');
   let prevHip=hips.getWorldQuaternion(hips.quaternion.clone()),prevHand=hand.getWorldPosition(hand.position.clone());
   let rolls=0,peak=0,minClear=Infinity,pose=false,landed=null,minHipUp=1,maxHipStep=0,maxRootPitch=0;
   p.bus.on('trick:diveroll',()=>rolls++);
   for(let k=0;k<150;k++){
    g.stepFixed(1);const at=p.body.translation();peak=Math.max(peak,at.y-.9);
    if(at.z>-18.7&&at.z<-17.9)minClear=Math.min(minClear,at.y-.9);
    const q=hips.getWorldQuaternion(hips.quaternion.clone()),h=hand.getWorldPosition(hand.position.clone());
    const delta=prevHip.angleTo(q);maxHipStep=Math.max(maxHipStep,delta);maxRootPitch=Math.max(maxRootPitch,Math.abs(p.mesh.rotation.x));
    if(p.diveJumpActive&&Math.abs(hips.rotation.x)>.6)pose=true;
    if(rolls&&!landed)landed={...at,clip:p.animator.currentName,timeScale:p.animator.current.getEffectiveTimeScale(),flightSeconds:(k+2)/60,hipStep:delta,handStep:h.distanceTo(prevHand)};
    if(rolls)minHipUp=Math.min(minHipUp,1-2*(q.x*q.x+q.z*q.z));
    prevHip.copy(q);prevHand.copy(h);
   }
   event('keyup');return{single,started,launch,other,rolls,peak,minClear,pose,landed,minHipUp,maxHipStep,maxRootPitch,state:p.fsm.current,flip:p.airTricks.active};
  },{i,crate});
  console.log('dive',JSON.stringify({i,crate,...r}));
  assert(!r.single&&r.started&&!r.other);assert(r.peak<(crate?2.6:1.2));assert(r.peak>(crate?2:0.8));assert(r.pose);assert.equal(r.rolls,1);assert(r.landed.flightSeconds<(crate?.82:.6));assert.equal(r.landed.clip,'sprint-roll');assert(r.landed.hipStep<.12);assert(r.landed.handStep<.3);assert(r.maxHipStep<.65);assert(r.maxRootPitch<.01);assert(r.minHipUp<-.5);assert.equal(r.state,'RUN');assert(!r.flip);
  if(crate)assert(r.minClear>2&&r.landed.z>-17.5);
 }
 const frameRates=[];
 for(const hz of [30,60,120]){
  const r=await page.evaluate(hz=>{
   const g=window.game,p=g.player;window.dispatchEvent(new Event('blur'));p.respawn();g.stepFixed(80);
   if(hz===30)g.level.registerBoxPhysics([60,-.5,-30],[4,1,80],0,0);
   p.body.setTranslation({x:60,y:.95,z:-35},true);p.body.setNextKinematicTranslation({x:60,y:.95,z:-35});
   p.velocity.set(0,0,0);p.fsm.transition('AIR');p.beginAirborne();g.physics.step();g.stepFixed(20);
   const key=(type,code,value)=>window.dispatchEvent(new KeyboardEvent(type,{code,key:value}));
   key('keydown','ShiftLeft','Shift');key('keydown','KeyW','w');g.stepFixed(30);
   // Fixed-step time advances faster than the wall-clock double-tap timer.
   g.inputs[0].lastForwardTap=-Infinity;
   key('keyup','KeyW','w');g.stepFixed(1);key('keydown','KeyW','w');g.stepFixed(1);
   key('keyup','KeyW','w');const before=p.horizontalSpeed;key('keydown','KeyW','w');g.stepFixed(1);
   const launch=p.horizontalSpeed,started=p.diveJumpActive;let peak=0,landed=false,maxAirSpeedStep=0;
   for(let k=0;k<hz*2;k++){
    const air=p.diveJumpActive,old=p.horizontalSpeed;
    g.simulate(1/hz,g.inputs.map(input=>input.poll()));
    if(air&&p.diveJumpActive)maxAirSpeedStep=Math.max(maxAirSpeedStep,Math.abs(p.horizontalSpeed-old));
    peak=Math.max(peak,p.body.translation().y-.9);if(air&&!p.diveJumpActive)landed=true;
   }
   key('keyup','KeyW','w');key('keyup','ShiftLeft','Shift');return{hz,before,launch,started,peak,landed,maxAirSpeedStep,state:p.fsm.current};
  },hz);
  frameRates.push(r);console.log('sprint/frame-rate',r);
  assert(r.started&&r.landed&&r.before>8);assert(Math.abs(r.launch-r.before)<.05);assert(r.peak<1.2&&r.peak>.8);assert(r.maxAirSpeedStep<=18/Math.min(hz,60)+.02);assert.equal(r.state,'RUN');
 }
 assert(Math.max(...frameRates.map(r=>r.peak))-Math.min(...frameRates.map(r=>r.peak))<.05);
 for(const height of [6,9,11.9,13]){
  const r=await page.evaluate(height=>{const g=window.game,p=g.player;p.respawn();g.stepFixed(80);p.body.setTranslation({x:35,y:height+.91,z:-20},true);p.body.setNextKinematicTranslation({x:35,y:height+.91,z:-20});p.velocity.set(0,0,0);p.fsm.transition('AIR');p.beginAirborne();p.grounded=false;g.physics.step();let rolls=0;p.bus.on('player:roll',()=>rolls++);g.stepFixed(85);return{rolls,state:p.fsm.current};},height);
  console.log('height',height,r);assert.equal(r.rolls,height<=12?1:0);assert.equal(r.state,height<=12?'RUN':'BAIL');
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
