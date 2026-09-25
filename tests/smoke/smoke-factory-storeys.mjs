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
   for(let i=0;i<240;i++){
    const at=p.body.translation(),dx=target[0]-at.x,dz=target[2]-at.z;
    g.followCamera.yaw=p.cameraYaw=Math.atan2(-dx,-dz);
    if(Math.hypot(dx,dz)<.4&&Math.abs(at.y-target[1])<.4&&p.grounded){reached=true;break;}
    g.stepFixed(1);states.add(p.fsm.current);if(i===0&&jump)key('keyup','Space',' ');
   }
   key('keyup','KeyW','w');return{reached,pos:p.body.translation(),states:[...states]};
  },{target,jump});console.log('waypoint',target,r);assert(r.reached&&!r.states.includes('BAIL'),JSON.stringify(r));
 };
 // Hidden fence breach now requires two turns behind a screen.
 await prepare([118,.95,24.5]);
 for(const point of [[121.4,.91,24.5],[121.4,.91,27.65],[130,.91,27.65]])await route(point);
 console.log('OK concealed dogleg through fence');
 // Walk every main stair flight up AND down without teleporting between floors.
 await prepare([183,.95,-26.5]);
 for(let floor=0;floor<3;floor++){
  await route([183,floor*7+4.41,-14.5]);
  await route([188,floor*7+4.41,-14.5]);
  await route([188,(floor+1)*7+.91,-26.5]);
  await route([183,(floor+1)*7+.91,-26.5]);
 }
 for(let floor=2;floor>=0;floor--){
  await route([188,(floor+1)*7+.91,-26.5]);
  await route([188,floor*7+4.41,-14.5]);
  await route([183,floor*7+4.41,-14.5]);
  await route([183,floor*7+.91,-26.5]);
 }
 console.log('OK all four storeys continuously walkable both ways');
 // Ground approach -> roof -> interior -> same rooftop exit.
 await prepare([163,.95,34]);
 for(const point of [[166,2.01,34],[169,3.41,36],[172,5.11,40],[175,6.61,40],[178,8.01,40],[181,8.04,36]])await route(point,true);
 await route([190,8.04,37.5]);
 await route([190,1.2,23]);
 await route([190,8.04,37.5]);
 console.log('OK workshop roof-only entry AND exit via stairs');
 // Elevated boiler entrance, no teleport between freight steps or window sides.
 await prepare([225,.95,57]);
 for(const point of [[228,2.11,57],[231,3.61,55],[234,5.01,53.2],[237,6.51,53.2],[237,7.41,47]])await route(point,true);
 await route([252.5,7.41,43]);
 await route([253,7.41,36.5]);
 await route([253,1.15,22.5]);
 await route([253,7.41,36.5]);
 await route([252.5,7.41,43]);
 await route([237,7.41,48.7]);
 await route([237,6.51,53.2],true);
 console.log('OK boiler first-floor window accessible in both directions');
 // Former workshop window and boiler ground-floor window are now solid walls.
 for(const [x,z] of [[186.5,38],[237,50]]){
  await prepare([x,.95,z+2]);await page.evaluate(()=>{const g=window.game;g.followCamera.yaw=0;window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW',key:'w'}));g.stepFixed(90);window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW',key:'w'}));});
  const at=await page.evaluate(()=>window.game.player.body.translation());assert(at.z>z+.3,JSON.stringify(at));
 }
 assert.deepEqual(errors,[]);console.log('FACTORY STOREYS + RESTRICTED ACCESS OK');
}finally{await browser.close();}
