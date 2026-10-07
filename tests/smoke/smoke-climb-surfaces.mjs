import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium-browser',args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:480,height:320}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(`${process.argv[2]??'http://127.0.0.1:4180/rooftop-runner/'}?level=city01&mode=split&play=1&nochar=1`);
 await page.waitForFunction(()=>window.game?.state==='PLAYING',null,{timeout:120000});
 const result=await page.evaluate(async()=>{
  const g=window.game;g.renderFrame=()=>{};g.police.update=()=>{};g.police.fixedUpdate=()=>{};g.stepFixed(1);
  const data=await (await fetch('levels/city01.json')).json();
  const idle={moveX:0,moveY:0,lookDX:0,lookDY:0,jumpPressed:false,jumpHeld:false,divePressed:false,sprintHeld:false,rollHeld:false,pausePressed:false,respawnPressed:false,flipPressed:null,spinPressed:0};
  const inputs=[{...idle},{...idle}];g.inputs.forEach((i,n)=>i.poll=()=>inputs[n]);
  const containers=data.boxes.filter(b=>b.size[0]===6.1&&b.size[1]===2.6&&b.size[2]===2.44).slice(0,2);
  const states=[[],[]];
  g.players.forEach((p,i)=>{
   const b=containers[i],at={x:b.pos[0]-1.5,y:3.525,z:b.pos[2]+b.size[2]/2-.38};
   p.respawn();p.body.setTranslation(at,true);p.body.setNextKinematicTranslation(at);p.velocity.set(0,0,0);p.fsm.transition('RUN');p.grounded=true;g.followCameras[i].setYaw(-Math.PI/2);inputs[i].moveY=1;
  });g.physics.step();
  for(let frame=0;frame<25;frame++){g.stepFixed(1);g.players.forEach((p,i)=>states[i].push(p.fsm.current));}
  inputs.forEach(i=>i.moveY=0);
  const marina=data.scenery.buildings[2],z=marina.z+marina.depth/2+2.1;
  const rail=g.level.rails.find(r=>r.samples.some(s=>Math.abs(s.x-marina.x)<.1&&Math.abs(s.y-1.25)<.01&&Math.abs(s.z-z)<.01));
  const p=g.player;p.respawn();const at={x:marina.x,y:2.15,z};p.body.setTranslation(at,true);p.body.setNextKinematicTranslation(at);p.velocity.set(0,0,0);g.physics.step();
  const marinaSnap=p.balancer.trySnap();if(marinaSnap)p.balancer.jumpOff(0);
  // P1: a sloped rail must exit onto a clear roof, not into a flush roof annex.
  // P2: consecutive sills/canopies must allow another ascent after the first mantle.
  const routes=[];
  for(const [index,buildingIndex] of [[0,1],[1,2]]){
   const player=g.players[index],b=data.scenery.buildings[buildingIndex],z=b.z+b.depth/2+1.45;
   player.respawn();g.stepFixed(3);
   const ray={origin:{x:b.x,y:b.height+35,z},dir:{x:0,y:-1,z:0}};
   const floor=g.physics.world.castRay(ray,b.height+50,true,undefined,undefined,player.collider,player.body);
   const at={x:b.x,y:ray.origin.y-floor.timeOfImpact+.925,z};
   player.body.setTranslation(at,true);player.body.setNextKinematicTranslation(at);player.velocity.set(0,0,0);player.fsm.transition('RUN');player.grounded=true;g.followCameras[index].setYaw(0);g.physics.step();inputs[index].moveY=1;
   let reached=false;
   for(let frame=0;frame<900;frame++){
    inputs[index].jumpPressed=player.fsm.current==='RUN'&&frame%45===0;g.stepFixed(1);
    const at=player.body.translation();
    if(player.fsm.current==='RUN'&&player.grounded&&at.y-.9>=b.height-.12&&Math.abs(at.x-b.x)<b.width/2-.1&&Math.abs(at.z-b.z)<b.depth/2-.1){reached=true;break;}
   }
   inputs[index]={...idle};routes.push({player:index+1,building:buildingIndex,reached,at:player.body.translation()});
  }
  return {states,routes,marinaPresent:!!rail,marinaSnap,rails:g.level.rails.length,authored:data.rails.length,streetRails:data.scenery.buildings.filter((b,i)=>!b.kind&&i%8===2).length};
 });
 console.log(JSON.stringify(result));
 assert(result.states.every(states=>states.every(s=>s!=='BALANCE')),'Both players must walk along container rims without balance capture');
 assert.equal(result.rails,result.authored+result.streetRails,'Decorative trim must not generate implicit rails');
 assert(result.marinaPresent&&result.marinaSnap,'The freestanding Marina rail remains balanceable');
 assert(result.routes.every(r=>r.reached),'Roof rail exits and repeated window ascents must stay traversable for both players');
 assert.deepEqual(errors,[]);console.log('CONTAINER EDGES, BOTH PLAYERS, AUTHORED RAILS AND MARINA BALANCE OK');
} finally {await browser.close();}
