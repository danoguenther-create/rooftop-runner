import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium-browser',args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:800,height:600}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(`${process.argv[2]??'http://127.0.0.1:4180/rooftop-runner/'}?level=city01&play=1`);
 await page.waitForFunction(()=>window.game?.state==='PLAYING'&&window.game.player?.contactPose,null,{timeout:120000});
 await page.evaluate(()=>{const g=window.game;g.renderFrame(0);g.renderFrame=()=>{};g.stepFixed(80);});
 const prepare=async(pos)=>page.evaluate(pos=>{
  const g=window.game,p=g.player;window.dispatchEvent(new Event('blur'));p.respawn();g.stepFixed(80);
  p.body.setTranslation({x:pos[0],y:pos[1],z:pos[2]},true);p.body.setNextKinematicTranslation({x:pos[0],y:pos[1],z:pos[2]});p.velocity.set(0,0,0);p.grounded=false;p.fsm.transition('AIR');p.beginAirborne();g.physics.step();g.stepFixed(15);
 },pos);
 const route=async(target,jump=false)=>{
  // A deliberate traversal segment, not a double tap; do not inject a dive.
  await page.waitForTimeout(310);
  const r=await page.evaluate(({target,jump})=>{
   const g=window.game,p=g.player;const key=(type,code,key)=>window.dispatchEvent(new KeyboardEvent(type,{code,key}));
   key('keydown','KeyW','w');if(jump)key('keydown','Space',' ');
   let reached=false;const states=new Set();
   for(let i=0;i<480;i++){
    const at=p.body.translation(),dx=target[0]-at.x,dz=target[2]-at.z;
    g.followCamera.yaw=p.cameraYaw=Math.atan2(-dx,-dz);
    if(Math.hypot(dx,dz)<.4&&Math.abs(at.y-target[1])<.4&&p.grounded){reached=true;break;}
    g.stepFixed(1);states.add(p.fsm.current);if(i===0&&jump)key('keyup','Space',' ');
   }
   key('keyup','KeyW','w');const contacts=[];if(!reached)for(let c=0;c<p.cc.numComputedCollisions();c++){const hit=p.cc.computedCollision(c);contacts.push({pos:hit.collider.translation(),size:hit.collider.halfExtents(),normal:hit.normal1});}return{reached,pos:p.body.translation(),states:[...states],contacts};
  },{target,jump});console.log('waypoint',target,r);assert(r.reached&&!r.states.includes('BAIL'),JSON.stringify(r));
 };
 // One continuous journey from the yard, through every building, and back.
 await prepare([207,.95,54]);
 await route([207,-5.59,37]);await route([207,-5.59,17]);
 for(const x of [194,176,158,155.2])await route([x,-5.59,17]);
 for(const z of [0,-18,-29])await route([155.2,-5.59,z]);
 await route([158,-5.59,-29]);await route([158,.91,-12.6]);
 console.log('OK sewer reaches main mill');
 await route([158,-5.59,-29]);await route([155.2,-5.59,-29]);
 for(const z of [-12,5,17])await route([155.2,-5.59,z]);
 await route([176,-5.59,17]);await route([176,.91,36.4]);await route([179,.95,36.4]);
 console.log('OK sewer reaches workshop');
 await route([176,.91,36.4]);await route([176,-5.59,20]);await route([176,-5.59,17]);
 for(const x of [194,210,222])await route([x,-5.59,17]);
 await route([222,.91,38.5]);console.log('OK sewer reaches boiler ground floor');
 await route([222,-5.59,22]);await route([225,-5.59,22]);
 for(const z of [4,-14,-32,-46])await route([225,-5.59,z]);
 await route([222,-5.59,-46]);await route([222,.91,-29.6]);await route([225,.91,-29.6]);
 console.log('OK sewer reaches turbine hall');
 await route([222,.91,-29.6]);await route([222,-5.59,-46]);await route([225,-5.59,-46]);
 for(const z of [-28,-10,8,17])await route([225,-5.59,z]);
 await route([207,-5.59,17]);await route([207,-5.59,37]);await route([207,.91,54]);
 assert.deepEqual(errors,[]);console.log('SEWER NETWORK: ALL FOUR BUILDINGS AND RETURN TO YARD OK');
}finally{await browser.close();}
