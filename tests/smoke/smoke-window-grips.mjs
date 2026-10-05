import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium-browser',args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:640,height:420}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(`${process.argv[2]??'http://127.0.0.1:4180/rooftop-runner/'}?level=testlevel&mode=split&play=1&nochar=1`);
 await page.waitForFunction(()=>window.game?.state==='PLAYING',null,{timeout:120000});
 const result=await page.evaluate(()=>{
  const g=window.game;g.renderFrame=()=>{};g.stepFixed(80);
  const idle={moveX:0,moveY:0,lookDX:0,lookDY:0,jumpPressed:false,jumpHeld:false,divePressed:false,sprintHeld:false,rollHeld:false,pausePressed:false,respawnPressed:false,flipPressed:null,spinPressed:0};
  const inputs=[{...idle},{...idle}];g.inputs.forEach((i,n)=>i.poll=()=>inputs[n]);
  g.level.addBox([80,-.5,-82],[70,1,15],0,0,'#888');
  // A 40 cm sill, a deeper sill with enough room to climb onto, and an oversized ceiling.
  for(const [x,depth] of [[60,.4],[70,1.1],[80,3]])g.level.addBox([x,2.4,-82],[3,.2,depth],0,0,'#aaa');
  g.physics.step();const cases=[];
  for(const [index,x,z,speed] of [[0,60,-82.15,0],[1,70,-82.5,3],[0,80,-82,0]]){
   const p=g.players[index];p.respawn();g.stepFixed(50);const at={x,y:.925,z};p.body.setTranslation(at,true);p.body.setNextKinematicTranslation(at);p.velocity.set(0,0,speed);g.followCameras[index].setYaw(Math.PI);p.fsm.transition('RUN');p.grounded=true;g.physics.step();
   inputs[index]={...idle,moveY:1,jumpPressed:true};g.stepFixed(1);inputs[index].jumpPressed=false;
   let caught=false,fromBelow=false;for(let i=0;i<55;i++){g.stepFixed(1);if(p.fsm.current==='HANG'){caught=true;fromBelow=!!p.climb.transfer?.fromBelow;inputs[index].moveY=0;break;}}
   g.stepFixed(35);const hang=p.body.translation();let climbed=false;
   if(x===70&&caught){inputs[index].moveY=1;for(let i=0;i<70;i++){g.stepFixed(1);if(p.grounded&&p.body.translation().y>3.3){climbed=true;break;}}inputs[index].moveY=0;}
   cases.push({x,caught,fromBelow,hang,climbed});inputs[index]={...idle};
  }
  // All four thin-sill corners, while keeping the movement key held after turning.
  const p=g.player,face=g.level.topFaces.find(f=>f.cx===60&&Math.abs(f.y-2.5)<.01),corners=[];
  for(const axis of ['x','z'])for(const sign of [-1,1]){
   inputs[0]={...idle};p.fsm.transition('AIR');p.climb.grab={face,axis,sign,t:(axis==='x'?face.halfZ:face.halfX)-Math.min(.15,(axis==='x'?face.halfZ:face.halfX)*.25)};
   const at=p.climb.hangPosition(p.velocity.clone());p.body.setTranslation(at,true);p.body.setNextKinematicTranslation(at);g.physics.step();p.fsm.transition('HANG');g.stepFixed(20);
   p.climb.moveAlong(p,.04);const started=!!p.climb.transfer;g.stepFixed(65);corners.push({axis,sign,started,end:p.climb.grab?.axis,state:p.fsm.current});
  }
  return {cases,corners};
 });console.log(JSON.stringify(result));
 assert(result.cases[0].caught&&result.cases[0].fromBelow,'P1 must catch a shallow sill from below');
 assert(result.cases[1].caught&&result.cases[1].fromBelow&&result.cases[1].climbed,'P2 must catch then climb onto the deeper sill');
 assert(!result.cases[2].caught,'Do not pull through deep ceilings');
 assert(result.corners.every(c=>c.started&&c.end!==c.axis&&c.state==='HANG'),'Thin sill corner coverage');
 await page.goto(`${process.argv[2]??'http://127.0.0.1:4180/rooftop-runner/'}?level=city01&mode=split&play=1&nochar=1`);
 await page.waitForFunction(()=>window.game?.state==='PLAYING',null,{timeout:120000});
 const factory=await page.evaluate(()=>{
  const g=window.game,p=g.player;g.renderFrame=()=>{};g.stepFixed(80);
  const input={moveX:0,moveY:1,lookDX:0,lookDY:0,jumpPressed:true,jumpHeld:false,divePressed:false,sprintHeld:false,rollHeld:false,pausePressed:false,respawnPressed:false,flipPressed:null,spinPressed:0};g.inputs[0].poll=()=>input;
  g.followCamera.setYaw(0);p.body.setTranslation({x:150,y:.925,z:11.15},true);p.body.setNextKinematicTranslation({x:150,y:.925,z:11.15});p.velocity.set(0,0,0);p.fsm.transition('RUN');p.grounded=true;g.physics.step();g.stepFixed(1);input.jumpPressed=false;
  let caught=false;for(let i=0;i<65;i++){g.stepFixed(1);if(p.fsm.current==='HANG'){caught=!!p.climb.transfer?.fromBelow;input.moveY=0;break;}}
  g.stepFixed(40);const face=p.climb.grab?.face;let corner=false,endAxis=null;
  if(face){p.climb.grab.t=face.halfX-.15;const at=p.climb.hangPosition(p.velocity.clone());p.body.setTranslation(at,true);p.body.setNextKinematicTranslation(at);g.physics.step();p.climb.moveAlong(p,.1);corner=!!p.climb.transfer;g.stepFixed(65);endAxis=p.climb.grab?.axis;}
  return{caught,corner,endAxis,state:p.fsm.current,sill:face?{x:face.cx,z:face.cz,y:face.y,depth:face.halfZ*2}:null};
 });console.log('factory',JSON.stringify(factory));assert(factory.caught&&factory.corner&&factory.endAxis==='x'&&factory.state==='HANG');
 assert.deepEqual(errors,[]);console.log('WINDOW UNDERSIDE CATCH, BOTH PLAYERS, MANTLE, THIN CORNERS, BLOCKED CEILING AND REAL FACTORY SILL OK');
}finally{await browser.close();}
