import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium-browser',args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:800,height:600}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(`${process.argv[2]??'http://127.0.0.1:4180/rooftop-runner/'}?level=testlevel&mode=split&play=1`);
 await page.waitForFunction(()=>window.game?.players.length===2&&window.game.players.every(p=>p.contactPose),null,{timeout:120000});
 await page.evaluate(()=>{const g=window.game;g.renderFrame(0);g.reviewRender=g.renderFrame.bind(g);g.renderFrame=()=>{};g.stepFixed(80);});
 for(const i of [0,1]){
  const r=await page.evaluate(i=>{
   const g=window.game,p=g.players[i],code=i?'ArrowUp':'KeyW',key=i?'ArrowUp':'w',x=35+i*5;
   const event=(type,repeat=false)=>window.dispatchEvent(new KeyboardEvent(type,{code,key,repeat}));
   p.respawn();g.stepFixed(80);g.level.registerBoxPhysics([x,-.5,-10],[4,1,60],0,0);g.level.registerBoxPhysics([x,1,-15],[2,2,2],0,0);
   p.body.setTranslation({x,y:.95,z:-20},true);p.body.setNextKinematicTranslation({x,y:.95,z:-20});p.velocity.set(0,0,0);p.fsm.transition('AIR');p.beginAirborne();g.physics.step();g.stepFixed(20);
   event('keydown');g.stepFixed(1);event('keydown',true);g.stepFixed(1);const single=p.diveJumpActive;
   event('keyup');event('keydown');g.stepFixed(1);
   const started=p.diveJumpActive,launch=p.velocity.y,other=g.players[1-i].diveJumpActive;
   if(i===1)event("keyup"); // A short second tap still carries over the box.
   let rolls=0,peak=0,minClear=Infinity,pose=false,landed=null;
   p.bus.on('trick:diveroll',()=>rolls++);
   for(let k=0;k<150;k++){
    g.stepFixed(1);const at=p.body.translation();peak=Math.max(peak,at.y-.9);
    if(at.z>-16.3&&at.z<-13.7)minClear=Math.min(minClear,at.y-.9);
    if(p.diveJumpActive&&p.mesh.rotation.x>.8)pose=true;
    if(rolls&&!landed)landed={...at,clip:p.animator.currentName};
   }
   event('keyup');return{single,started,launch,other,rolls,peak,minClear,pose,landed,state:p.fsm.current,end:p.body.translation(),flip:p.airTricks.active};
  },i);
  console.log('dive',i,r);assert(!r.single&&r.started&&!r.other);assert(r.launch>11&&r.peak>3&&r.minClear>2);assert(r.pose);assert.equal(r.rolls,1);assert(r.landed.z>-13.5);assert.equal(r.landed.clip,'landing-roll');assert.equal(r.state,'RUN');assert(!r.flip);
 }
 for(const height of [6,9,11.9,13]){
  const r=await page.evaluate(height=>{const g=window.game,p=g.player;p.respawn();g.stepFixed(80);p.body.setTranslation({x:35,y:height+.91,z:-20},true);p.body.setNextKinematicTranslation({x:35,y:height+.91,z:-20});p.velocity.set(0,0,0);p.fsm.transition('AIR');p.beginAirborne();p.grounded=false;g.physics.step();let rolls=0;p.bus.on('player:roll',()=>rolls++);g.stepFixed(85);return{rolls,state:p.fsm.current};},height);
  console.log('height',height,r);assert.equal(r.rolls,height<=12?1:0);assert.equal(r.state,height<=12?'RUN':'BAIL');
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
