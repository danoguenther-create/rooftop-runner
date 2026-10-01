import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium-browser',args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:640,height:420}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`${process.argv[2]??'http://127.0.0.1:4180/rooftop-runner/'}?level=city01&mode=split&play=1&nochar=1`);
 await page.waitForFunction(()=>window.game?.state==='PLAYING',null,{timeout:120000});
 const movement=await page.evaluate(()=>{
  const g=window.game,s=g.police;g.renderFrame=()=>{};g.stepFixed(1);
  const v=(x,y,z)=>s.car.root.position.clone().set(x,y,z);
  const box=(pos,size)=>g.level.addBox(pos,size,0,0,'#777777');
  box([55,-.5,-100],[16,1,8]);
  for(const z of [-101.1,-99.6])box([55,1,z],[6,2,.2]);
  box([76,-.5,-100],[16,1,8]);box([80,.9,-100],[2,1.8,6]);
  box([65,3.5,-100],[2,1,3]);box([68,3.5,-100],[2,1,3]);
  box([65,-.5,-106],[110,1,4]);
  g.physics.step();s.navigation.indexFloors();
  const place=(o,x,y,z)=>{o.boarded=false;o.collider.setEnabled(true);o.body.setTranslation({x,y,z},true);o.body.setNextKinematicTranslation({x,y,z});o.path=[];o.goal.set(Infinity,Infinity,Infinity);o.action=null;o.yieldTo=null;};
  place(s.officers[0],53.5,.85,-100.35);place(s.officers[1],57.5,.85,-100.35);g.physics.step();
  let separation=Infinity;
  for(let k=0;k<1200;k++){
   s.officers.forEach(o=>o.planned.copy(o.body.translation()));
   s.walk(s.officers[0],v(59.5,0,-100.35),1/60);s.walk(s.officers[1],v(51.5,0,-100.35),1/60);g.physics.step();
   separation=Math.min(separation,v(0,0,0).copy(s.officers[0].body.translation()).distanceTo(s.officers[1].body.translation()));
  }
  const passing=s.officers.map(o=>o.body.translation());
  place(s.officers[0],78.5,.85,-100.35);place(s.officers[1],79.5,2.65,-100.35);g.physics.step();
  for(let k=0;k<1200;k++){
   s.officers.forEach(o=>o.planned.copy(o.body.translation()));
   s.walk(s.officers[0],v(80.5,1.8,-100.35),1/60);s.walk(s.officers[1],v(77.5,0,-100.35),1/60);g.physics.step();
  }
  const ledgePassing=s.officers.map(o=>o.body.translation());
  s.officers[1].boarded=true;s.officers[1].collider.setEnabled(false);
  const run=(start,target,frames=600)=>{
   const o=s.officers[0];place(o,...start);g.physics.step();let peak=start[1],modes=new Set();
   for(let k=0;k<frames;k++){o.planned.copy(o.body.translation());s.walk(o,v(...target),1/60);if(o.action)modes.add(o.action.mode);g.physics.step();peak=Math.max(peak,o.body.translation().y);}
   return{at:o.body.translation(),peak,modes:[...modes]};
  };
  const climb=run([77.5,.85,-100.35],[80.5,1.8,-100.35]);
  const jump=run([65.5,4.85,-100.35],[68.5,4,-100.35]);
  const stairs=run([183.5,.85,-26.35],[183.5,21,-26.35],7200);
  s.createPatrol();s.officers.forEach(o=>{o.boarded=true;o.collider.setEnabled(false);});
  const measure=(o,moving)=>{
   place(o,20.5,.85,-106.35);o.yieldFor=null;o.stuck=0;o.repath=0;g.physics.step();
   let caughtAt=null;
   for(let k=0;k<240;k++){
    o.planned.copy(o.body.translation());const x=moving?26.5+(k+1)*9/60:95.5;
    s.walk(o,v(x,0,-106.35),1/60);g.physics.step();
    if(moving&&x-o.body.translation().x<1.15){caughtAt=(k+1)/60;break;}
   }
   const result={speed:(o.body.translation().x-20.5)/4,gap:62.5-o.body.translation().x,caughtAt};
   o.boarded=true;o.collider.setEnabled(false);return result;
  };
  const speeds=[measure(s.officers[0],false),measure(s.officers[2],false)];
  const pursuit=[measure(s.officers[0],true),measure(s.officers[2],true)];
  return{passing,ledgePassing,separation,climb,jump,stairs,speeds,pursuit};
 });
 console.log('movement',JSON.stringify(movement));
 assert(movement.passing[0].x>59&&movement.passing[1].x<52,'Head-on officers must pass the narrow corridor');assert(movement.separation>.55,'Officers must keep capsule separation');
 assert(movement.ledgePassing[0].y>2.5&&movement.ledgePassing[1].x<78,'Opposite climbing directions must reserve the ledge and yield');
 assert(movement.climb.modes.includes('climb')&&movement.climb.at.y>2.5&&movement.climb.at.x>80,'Climb must reach the crate top');
 assert(movement.jump.modes.includes('jump')&&movement.jump.peak>5.3&&movement.jump.at.x>68&&movement.jump.at.y>4.7,'Jump must cross the gap and land on the raised platform');
 assert(movement.stairs.at.y>21.7,'Police must climb all three flights of the actual factory stairwell');
 assert(Math.abs(movement.speeds[0].speed-9)<.15&&Math.abs(movement.speeds[1].speed-10.8)<.15,'Actual grid travel must match player sprint / 120% sprint');
 assert(movement.pursuit[0].caughtAt===null&&Math.abs(movement.pursuit[0].gap-6)<.3,'First unit must maintain sprinting player distance');
 assert(movement.pursuit[1].caughtAt!==null,'Second unit must close the gap on a sprinting target');
 assert.deepEqual(errors,[]);console.log('POLICE PASSING, SEPARATION, CLIMB AND GAP JUMP OK');
}finally{await browser.close();}
