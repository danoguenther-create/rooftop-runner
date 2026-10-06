import assert from 'node:assert/strict';import {chromium} from 'playwright-core';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium-browser',args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader']});
try{const page=await browser.newPage({viewport:{width:800,height:600}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(`${process.argv[2]??'http://127.0.0.1:4180/rooftop-runner/'}?level=testlevel&mode=split&play=1&nochar=1`);await page.waitForFunction(()=>window.game?.state==='PLAYING',null,{timeout:120000});
 await page.keyboard.down('c');assert.deepEqual(await page.evaluate(()=>window.game.inputs.map(i=>i.poll().rollHeld)),[true,false]);await page.keyboard.up('c');
 await page.keyboard.down('-');assert.deepEqual(await page.evaluate(()=>window.game.inputs.map(i=>i.poll().rollHeld)),[false,true]);await page.keyboard.up('-');
 for(const key of ['ControlLeft','ControlRight']){await page.keyboard.down(key);assert.deepEqual(await page.evaluate(()=>window.game.inputs.map(i=>i.poll().rollHeld)),[false,false]);await page.keyboard.up(key);}
 const result=await page.evaluate(()=>{
  const g=window.game;g.renderFrame=()=>{};g.stepFixed(80);
  let input={moveX:0,moveY:0,lookDX:0,lookDY:0,jumpPressed:false,jumpHeld:false,divePressed:false,sprintHeld:false,rollHeld:false,pausePressed:false,respawnPressed:false,flipPressed:null,spinPressed:0};
  g.inputs[0].poll=()=>input;
  const p=g.player,v=(x,y,z)=>p.velocity.clone().set(x,y,z),box=(pos,size)=>g.level.addBox(pos,size,0,0,'#888888');
  box([80,-.5,-82],[110,1,30]);box([40,.5,-82],[3,1,1]);box([50,.9,-82],[3,1.8,4]);box([60,1.45,-82],[3,.8,1.8]);box([70,.7,-82],[3,.6,1.8]);box([80,1.3,-84],[3,2.6,4]);
  box([90,.5,-82],[3,1,2.4]);
  box([100,1.7,-82],[2,3.4,4]);box([100,5,-82],[2,.2,4]);box([103,5,-82],[2,.2,4]);
  g.level.addBox([140,2.25,-82],[2,4.5,4],.65,0,'#888888');
  box([120,3.5,-87],[3,1,4]);box([120,3.5,-80],[3,1,4]);g.physics.step();
  const place=(x,y,z,speed=6)=>{input={...input,moveX:0,moveY:0,jumpPressed:false,rollHeld:false,flipPressed:null};p.respawn();g.stepFixed(50);p.body.setTranslation({x,y,z},true);p.body.setNextKinematicTranslation({x,y,z});p.velocity.set(0,0,speed);p.cameraYaw=Math.PI;p.fsm.transition('RUN');p.grounded=true;p.parkour.readyAt=0;g.physics.step();input.moveY=1;p.handleFrameInput(input);};
  const actions=[];
  for(const [x,y,z,roll] of [[40,.925,-83.45,false],[90,.925,-84.15,false],[50,.925,-84.95,false],[60,.925,-84,true],[70,.925,-84,true],[80,3.525,-82.7,true]]){
   place(x,y,z);input.rollHeld=roll;p.handleFrameInput(input);const plan=p.parkour.plan(p);
   if(!plan){actions.push({x,kind:null});continue;}
   p.pendingVault=plan;p.fsm.transition('VAULT');input.moveY=0;input.rollHeld=false;
   for(let k=0;k<120&&p.fsm.current==='VAULT';k++)g.stepFixed(1);
   g.stepFixed(5);actions.push({x,kind:plan.kind,at:p.body.translation(),end:plan.end.toArray(),state:p.fsm.current,half:p.collider.halfHeight()});
  }
  // A new obstruction appearing after selection must abort the active path.
  place(40,.925,-83.45);const blockedPlan=p.parkour.plan(p);p.pendingVault=blockedPlan;p.fsm.transition('VAULT');input.moveY=0;
  box([40,3,-82.7],[3,6,.2]);g.physics.step();
  for(let k=0;k<90&&p.fsm.current==='VAULT';k++)g.stepFixed(1);
  const blocked={state:p.fsm.current,z:p.body.translation().z,half:p.collider.halfHeight()};
  place(80,3.525,-82.5,0);input.rollHeld=true;g.stepFixed(1);const dropStarted=p.fsm.current==='HANG'&&!!p.climb.transfer;
  input.moveY=0;input.rollHeld=false;g.stepFixed(65);const dropHang={started:dropStarted,state:p.fsm.current,y:p.climb.grab?.face.y,z:p.body.translation().z};
  place(100,2.7,-79.55,0);input.moveY=0;p.handleFrameInput(input);p.climb.grab={face:g.level.topFaces.find(f=>f.cx===100&&Math.abs(f.y-3.4)<.01),axis:'z',sign:1,t:0};p.fsm.transition('AIR');p.fsm.transition('HANG');g.stepFixed(20);
  const lowerBraced=p.climb.braced;input.moveY=1;input.jumpPressed=true;g.stepFixed(1);const up=!!p.climb.transfer;input.moveY=0;input.jumpPressed=false;g.stepFixed(65);const upperY=p.climb.grab?.face.y,upperBraced=p.climb.braced;
  input.moveX=-1;input.jumpPressed=true;g.stepFixed(1);const side=!!p.climb.transfer;input.moveX=0;input.jumpPressed=false;g.stepFixed(65);const sideX=p.climb.grab?.face.cx;
  // Return to the original wall to check controlled downward transfer.
  p.climb.releaseGrab();p.climb.grab={face:g.level.topFaces.find(f=>f.cx===100&&Math.abs(f.y-5.1)<.01),axis:'z',sign:1,t:0};const at=p.climb.hangPosition(v(0,0,0));p.body.setTranslation(at,true);p.body.setNextKinematicTranslation(at);g.physics.step();
  input.moveY=-1;g.stepFixed(1);const down=!!p.climb.transfer;input.moveY=0;g.stepFixed(65);const downY=p.climb.grab?.face.y;
  p.climb.grab.t=.85;const cornerAt=p.climb.hangPosition(v(0,0,0));p.body.setTranslation(cornerAt,true);p.body.setNextKinematicTranslation(cornerAt);g.physics.step();p.climb.moveAlong(p,.1);const corner=!!p.climb.transfer;g.stepFixed(65);const cornerAxis=p.climb.grab?.axis;
  const corners=[];
  for(const axis of ['x','z'])for(const sign of [-1,1]){
    input.moveX=0;input.moveY=0;input.jumpPressed=false;p.fsm.transition('AIR');
    const face=g.level.topFaces.find(f=>f.cx===140&&Math.abs(f.y-4.5)<.01);
    p.climb.grab={face,axis,sign,t:(axis==='x'?face.halfZ:face.halfX)-.16};
    const at=p.climb.hangPosition(v(0,0,0));p.body.setTranslation(at,true);p.body.setNextKinematicTranslation(at);g.physics.step();p.fsm.transition('HANG');g.stepFixed(20);
    p.climb.moveAlong(p,.1);const started=!!p.climb.transfer;input.moveX=-1;g.stepFixed(65);input.moveX=0;corners.push({axis,sign,started,end:p.climb.grab?.axis,state:p.fsm.current});
  }
  place(120,4.925,-85.6);p.velocity.y=8;p.parkour.predictJump(p);const jump=p.parkour.jumpTarget?.toArray()??null;p.fsm.transition('AIR');p.grounded=false;
  let landing=null;for(let k=0;k<90;k++){g.stepFixed(1);if(p.grounded){landing=p.body.translation();break;}}
  place(120,4.925,-85.6);p.velocity.y=8;p.parkour.predictJump(p);p.fsm.transition('AIR');p.grounded=false;input.moveY=-1;input.flipPressed='back';g.stepFixed(1);input.flipPressed=null;
  const flip=p.airTricks.active,assistRetained=p.parkour.jumpTarget!==null;
  input.moveY=1;let flipLanding=null;for(let k=0;k<90;k++){g.stepFixed(1);if(p.grounded){flipLanding=p.body.translation();break;}}
  const p2=g.players[1];g.inputs[1].poll=()=>({...input,moveY:0,flipPressed:null});p2.respawn();g.stepFixed(50);
  p2.body.setTranslation({x:50,y:.925,z:-84.95},true);p2.body.setNextKinematicTranslation({x:50,y:.925,z:-84.95});p2.velocity.set(0,0,6);p2.cameraYaw=Math.PI;p2.fsm.transition('RUN');p2.grounded=true;p2.parkour.readyAt=0;g.physics.step();p2.handleFrameInput({...input,moveY:1,flipPressed:null,rollHeld:false});
  const secondPlan=p2.parkour.plan(p2);if(secondPlan){p2.pendingVault=secondPlan;p2.fsm.transition('VAULT');g.stepFixed(90);}
  const second={kind:secondPlan?.kind,y:p2.body.translation().y,independent:p2.parkour!==p.parkour};
  return{corners,dropHang,blocked,second,actions,lowerBraced,up,upperY,upperBraced,side,sideX,down,downY,corner,cornerAxis,jump,landing,flip,assistRetained,flipLanding,players:g.players.length};
 });console.log(JSON.stringify(result));
 assert.deepEqual(result.actions.map(a=>a.kind),['speed','reach','reach','slide',null,'drop']);
 for(const a of result.actions.filter(a=>a.kind)){assert(Math.hypot(a.at.x-a.end[0],a.at.z-a.end[2])<.8);assert(Math.abs(a.half-.55)<1e-6);assert.notEqual(a.state,'VAULT');}
 assert(result.lowerBraced&&result.up&&Math.abs(result.upperY-5.1)<.02&&!result.upperBraced);assert(result.side&&result.sideX===103);assert(result.down&&Math.abs(result.downY-3.4)<.02);
 assert(result.corners.every(c=>c.started&&c.end!==c.axis&&c.state==='HANG'));
 assert(result.dropHang.started&&result.dropHang.state==='HANG'&&Math.abs(result.dropHang.y-2.6)<.02&&result.dropHang.z> -82);
 assert.equal(result.blocked.state,'AIR');assert(result.blocked.z< -83.1);assert(Math.abs(result.blocked.half-.55)<1e-6);
 assert(result.corner&&result.cornerAxis==='x');
 assert(result.jump&&result.landing&&result.landing.y>4.8&&result.landing.z> -82.3);assert(result.flip&&result.assistRetained);assert(result.flipLanding&&result.flipLanding.y>4.8&&result.flipLanding.z> -82.3);assert.equal(result.players,2);assert.equal(result.second.kind,'reach');assert(result.second.y>2.6&&result.second.independent);assert.deepEqual(errors,[]);
 console.log('DYNAMIC ACTIONS, BLOCKED SLIDE, LEDGE TRANSFERS, FREE HANG, JUMP PREDICTION AND ASSISTED FLIP LANDING OK');
}finally{await browser.close();}
