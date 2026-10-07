import {chromium} from 'playwright-core';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {STATION} from './police-station.mjs';
const data=JSON.parse(await readFile('public/levels/city01.json','utf8'));
const buildings=data.scenery.buildings.map((b,i)=>({id:`city-${i}`,x:b.x,z:b.z,w:b.width,d:b.depth,h:b.height}));
buildings.push({id:'main-mill',x:168,z:-10,w:48.5,d:40.5,h:28},{id:'workshop',x:186.5,z:30,w:27.45,d:16.45,h:7.125},{id:'turbine',x:238,z:-27,w:40.5,d:42.5,h:11},{id:'boiler',x:237,z:35,w:38.5,d:30.5,h:14});
// The eave ring overhangs the walls by 0.3 m (PoliceModels).
buildings.push({id:'police-station',x:STATION.x,z:STATION.z,w:STATION.width+.6,d:STATION.depth+.6,h:STATION.height});
for(const [kind,list] of [['infill',data.scenery.infills??[]],['tower',data.scenery.towers??[]]])list.forEach((b,i)=>buildings.push({id:`${kind}-${i}`,x:b.x,z:b.z,w:b.width,d:b.depth,h:b.height}));
(data.scenery.rooms??[]).forEach((b,i)=>buildings.push({id:`room-${i}`,x:b.x,z:b.z,w:b.width,d:b.depth,h:b.base+b.height,base:b.base}));
for(const [index,box] of data.boxes.entries()){
 const [w,h,d]=box.size;if(box.solid===false||box.invisible||box.pos[1]<.4||h<2.4||Math.min(w,d)<2||/stair|sewer|fence|gate/.test(box.tag??''))continue;
 const b={id:`structure-${index}`,x:box.pos[0],z:box.pos[2],w,d,rotY:box.rotY??0,h:box.pos[1]+h/2};
 if(!buildings.some(a=>Math.abs(a.x-b.x)<.01&&Math.abs(a.z-b.z)<.01&&Math.abs(a.w-w)<.01&&Math.abs(a.d-d)<.01&&Math.abs(a.h-b.h)<.01))buildings.push(b);
}
// Open factory windows are entrances, not facades: sideways to the masonry beside them.
const openings=[{x:238,z:-27+42.5/2,half:1.9,clear:2.6},{x:237,z:35+30.5/2,half:1.9,clear:2.6},
 ...data.boxes.filter(o=>o.tag==='factory-open-window-sill').map(o=>({x:o.pos[0],z:o.pos[2],half:o.size[0]/2+1.4,clear:o.size[0]/2+1.6}))];
// Open house windows and doors are entrances too (tools/city-interiors.mjs).
for(const b of data.scenery.buildings)for(const o of b.interior?.openings??[])
 openings.push(o.face==='z'?{x:o.u,z:b.z+o.side*b.depth/2,half:2.2,clear:2.4}:{axis:'x',x:b.x+o.side*b.width/2,z:o.u,half:2.2,clear:2.4});
// Hollow buildings: a start floor inside one (through a hatch) is no facade approach.
const hollow=[...data.scenery.buildings,...(data.scenery.infills??[]),...(data.scenery.towers??[])].map(b=>({x:b.x,z:b.z,w:b.width,d:b.depth,top:b.height}))
 .concat((data.scenery.rooms??[]).map(r=>({x:r.x,z:r.z,w:r.width,d:r.depth,top:r.base+r.height})));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium-browser',args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader']});
const results=[];
try{
 const page=await browser.newPage({viewport:{width:480,height:320}});
 await page.goto(`${process.argv[2]??'http://127.0.0.1:4180/rooftop-runner/'}?level=city01&play=1&nochar=1`);
 await page.waitForFunction(()=>window.game?.state==='PLAYING',null,{timeout:120000});
 await page.evaluate(()=>{const g=window.game;g.renderFrame=()=>{};g.police.update=()=>{};g.police.fixedUpdate=()=>{};g.minimaps.forEach(m=>m.update=()=>{});g.stepFixed(60);});
 const fractions=process.env.CLIMB_DENSE==='1'?[-.65,0,.65]:[0];
 const samples=(b,axis)=>{
  const spacing=Number(process.env.CLIMB_SPACING??0);if(!spacing)return fractions;
  const length=axis==='x'?b.d:b.w,span=Math.max(0,length-1.2),steps=Math.ceil(span/spacing);
  return [...new Set([0,...Array.from({length:steps+1},(_,i)=>steps?(-span/2+span*i/steps)/(length/2):0)])].sort((a,b)=>a-b);
 };
 const limit=Number(process.env.CLIMB_LIMIT??buildings.length);
 // CLIMB_RETRY=<report.json>: only re-run the cases that failed in an earlier report.
 const retry=process.env.CLIMB_RETRY?JSON.parse(await readFile(process.env.CLIMB_RETRY,'utf8')).results.filter(r=>!r.success):null;
 for(const b of buildings.slice(Number(process.env.CLIMB_FROM??0),limit))for(const axis of ['x','z'])for(const sign of [-1,1])for(const fraction of samples(b,axis)){
  if(process.env.CLIMB_FRACTION&&fraction!==Number(process.env.CLIMB_FRACTION))continue;
  if(process.env.CLIMB_FACE&&`${axis}:${sign}`!==process.env.CLIMB_FACE)continue;
  if(retry&&!retry.some(r=>r.id===b.id&&r.axis===axis&&r.sign===sign&&Math.abs(r.fraction-fraction)<1e-9))continue;
  if(process.env.CLIMB_ONLY&&!process.env.CLIMB_ONLY.split(',').includes(b.id))continue;
  const r=await page.evaluate(({hollow,openings,b,axis,sign,fraction,evalCode,trace,hangJump})=>{
   const g=window.game,p=g.player;
   const input={moveX:0,moveY:0,lookDX:0,lookDY:0,jumpPressed:false,jumpHeld:false,divePressed:false,sprintHeld:false,rollHeld:false,pausePressed:false,respawnPressed:false,flipPressed:null,spinPressed:0};g.input.poll=()=>input;
   p.respawn();g.stepFixed(3);p.climb.climbCooldownUntil=0;p.climb.regrabAt=0;
   const c=Math.cos(b.rotY??0),s=Math.sin(b.rotY??0),nx=axis==='x'?sign:0,nz=axis==='z'?sign:0;
   const normal=p.velocity.clone().set(nx*c+nz*s,0,-nx*s+nz*c);
   const lx=axis==='x'?sign*(b.w/2+1.45):fraction*b.w/2,lz=axis==='z'?sign*(b.d/2+1.45):fraction*b.d/2;
   let x=b.x+lx*c+lz*s,z=b.z-lx*s+lz*c;
   const interiors=[{x:168,z:-10,w:48,d:40,ceilings:[6.825,13.825,20.825,28]},{x:186.5,z:30,w:27,d:16,ceilings:[7]},{x:238,z:-27,w:40,d:42,ceilings:[10.98]},{x:237,z:35,w:38,d:30,ceilings:[6.15,13.98]}];
   const room=b.id.startsWith('structure-')?interiors.find(r=>Math.abs(b.x-r.x)<r.w/2&&Math.abs(b.z-r.z)<r.d/2):null;
   const ceiling=room?.ceilings.find(y=>y>b.h+.2);
   const ray={origin:{x,y:ceiling?Math.min(b.h+3.5,ceiling-.15):b.h+35,z},dir:{x:0,y:-1,z:0}};
   // A sample can land in a slot narrower than the body (e.g. between two crates).
   // Step outward until the standing capsule is actually free, like a player would stand.
   // Falls back to the original sample (the solver then pushes the body free).
   let floor=null,y=0;
   // Closer to the wall first (a narrow roof strip in front of a roof room), then outward.
   for(const out of [0,-.4,-.8,...Array.from({length:16},(_,k)=>.25*(k+1))]){
    ray.origin.x=x+normal.x*out;ray.origin.z=z+normal.z*out;
    const hit=g.physics.world.castRay(ray,b.h+50,true,undefined,undefined,p.collider,p.body);if(!hit)continue;
    const at={x:ray.origin.x,y:ray.origin.y-hit.timeOfImpact+.925,z:ray.origin.z};
    if(at.y<.6)continue; // a manhole shaft is no approach to a facade
    // A roof room is approached from its roof, not from a balcony below the roof edge.
    if(b.base!==undefined&&at.y-.925<b.base-.3)continue;
    // Nor a floor inside a hollow building (seen through its roof hatch).
    if(hollow.some(f=>Math.abs(at.x-f.x)<f.w/2-.3&&Math.abs(at.z-f.z)<f.d/2-.3&&at.y-.925<f.top-.5))continue;

    if(!g.physics.world.intersectionWithShape({...at,y:at.y+.02},{x:0,y:0,z:0,w:1},p.collider.shape,undefined,undefined,p.collider,p.body)){floor=hit;y=at.y;x=at.x;z=at.z;break;}
   }
   ray.origin.x=x;ray.origin.z=z;
   if(!floor)return{id:b.id,axis,sign,fraction,success:false,reason:'no-start-floor'};
   p.body.setTranslation({x,y,z},true);p.body.setNextKinematicTranslation({x,y,z});p.velocity.set(0,0,0);p.fsm.transition('RUN');p.grounded=true;g.followCamera.setYaw(Math.atan2(normal.x,normal.z));g.physics.step();input.moveY=1;
   // The central factory windows are entrances. Reach the roof via their adjacent
   // masonry, walking sideways from the original sample (never teleporting mid-route).
   let approachFrames=0;
   const opening=b.id.startsWith('structure-')?null:axis==='z'?openings.find(o=>!o.axis&&Math.abs(x-o.x)<o.half&&Math.abs(z-o.z)<6)
    :openings.find(o=>o.axis==='x'&&Math.abs(z-o.z)<o.half&&Math.abs(x-o.x)<6);
   if(opening&&axis==='z'){
    // Step aside to the nearer masonry that still lies in front of this facade.
    const targetX=[opening.x+opening.clear,opening.x-opening.clear].filter(t=>Math.abs(t-b.x)<b.w/2-.8).sort((p,q)=>Math.abs(p-x)-Math.abs(q-x))[0]??x;
    const side=targetX>=x?1:-1;g.followCamera.setYaw(-side*Math.PI/2);
    for(;approachFrames<90&&side*(targetX-p.body.translation().x)>.1;approachFrames++)g.stepFixed(1);
    g.followCamera.setYaw(Math.atan2(normal.x,normal.z));
   }else if(opening){
    const targetZ=[opening.z+opening.clear,opening.z-opening.clear].filter(t=>Math.abs(t-b.z)<b.d/2-.8).sort((p,q)=>Math.abs(p-z)-Math.abs(q-z))[0]??z;
    const side=targetZ>=z?1:-1;g.followCamera.setYaw(side>0?Math.PI:0);
    for(;approachFrames<90&&side*(targetZ-p.body.translation().z)>.1;approachFrames++)g.stepFixed(1);
    g.followCamera.setYaw(Math.atan2(normal.x,normal.z));
   }
   const history=[];let success=false,peak=y,stalled=0,lastY=y,balance=0,frames=0;
   // A 58 m tower is some 36 courses: allow roughly a second per metre.
   for(const limit=Math.max(1800,b.h*75);frames<limit;frames++){
    const before=p.body.translation(),bx=(before.x-b.x)*c-(before.z-b.z)*s,bz=(before.x-b.x)*s+(before.z-b.z)*c;
    // Brake over the landing instead of running straight off a small rooftop box.
    // At roof height but outside the plot (a cornice or gutter ledge): turn to the roof like a player would.
    if(p.fsm.current!=='HANG'&&before.y-.9>=b.h-.12&&!(Math.abs(bx)<b.w/2-.1&&Math.abs(bz)<b.d/2-.1))g.followCamera.setYaw(Math.atan2(before.x-b.x,before.z-b.z));
    input.moveY=p.fsm.current!=='HANG'&&before.y-.9>=b.h-.12&&Math.abs(bx)<b.w/2-.1&&Math.abs(bz)<b.d/2-.1?0:1;
    input.jumpPressed=(hangJump&&p.fsm.current==='HANG'&&!p.climb.transfer&&p.mantleProgress<0)||(p.fsm.current==='SWING'||p.fsm.current==='BALANCE'||(p.fsm.current==='RUN'&&(p.body.translation().y-.9<b.h-.12||stalled>20)))&&frames%45===0;g.stepFixed(1);const at=p.body.translation();peak=Math.max(peak,at.y);
    if(p.fsm.current==='BALANCE')balance++;if(trace&&frames%5===0)history.push([frames,p.fsm.current,{...at},p.activeVault?.kind,[p.velocity.x,p.velocity.y,p.velocity.z],input.jumpPressed,p.grounded]);
    if(p.fsm.current==='RUN'&&p.grounded&&at.y-.9>=b.h-.12&&Math.abs((at.x-b.x)*c-(at.z-b.z)*s)<b.w/2-.1&&Math.abs((at.x-b.x)*s+(at.z-b.z)*c)<b.d/2-.1&&!g.physics.world.intersectionWithShape(at,{x:0,y:0,z:0,w:1},p.collider.shape,undefined,undefined,p.collider,p.body)){success=true;break;}
    if(Math.abs(at.y-lastY)<.02)stalled++;else stalled=0;lastY=at.y;
    if(stalled>220||at.y< -9||Math.hypot(at.x-b.x,at.z-b.z)>Math.hypot(b.w,b.d)/2+6)break;
   }
   const at=p.body.translation(),grab=p.climb.grab;
   const diagnostics=!success&&grab?{mantle:p.climb.mantleTarget(p,p.velocity.clone()),nearby:g.level.topFaces.filter(f=>f.y>grab.face.y+.12&&f.y<grab.face.y+2.3&&Math.abs(f.cx-at.x)<f.halfX+2&&Math.abs(f.cz-at.z)<f.halfZ+2).map(f=>[f.cx,f.y,f.cz,f.halfX,f.halfZ]).slice(0,25)}:null;
   let groundDebug;
   if(trace&&!success&&!grab){p.velocity.y=8;groundDebug={grounded:p.grounded,airTrick:p.airTricks.active,under:p.climb.tryUnderhangGrab(p),nearby:g.level.topFaces.filter(f=>Math.abs(f.cx-at.x)<f.halfX+1&&Math.abs(f.cz-at.z)<f.halfZ+1&&f.y>at.y-.9&&f.y<at.y+2).map(f=>[f.cx,f.y,f.cz,f.halfX,f.halfZ])};}
   // CLIMB_EVAL=<js>: diagnostic expression over (g,p,THREE-free state) after a failed case.
   const probe=evalCode&&!success?(0,eval)(`(g,p,b)=>{${evalCode}}`)(g,p,b):undefined;
   return{probe,groundDebug,history:trace?history:undefined,diagnostics,id:b.id,axis,sign,fraction,success,frames,approachFrames,peak,startY:y,at,state:p.fsm.current,balance,grab:grab?{x:grab.face.cx,z:grab.face.cz,y:grab.face.y,axis:grab.axis,sign:grab.sign}:null};
  },{hollow,openings,b,axis,sign,fraction,evalCode:process.env.CLIMB_EVAL,trace:!!process.env.CLIMB_TRACE,hangJump:!!process.env.CLIMB_HANG_JUMP});results.push(r);console.log(JSON.stringify(r));
 }
}finally{await browser.close();await mkdir('artifacts/climb-audit',{recursive:true});await writeFile(process.env.CLIMB_REPORT??'artifacts/climb-audit/latest.json',JSON.stringify({total:results.length,passed:results.filter(r=>r.success).length,skipped:results.filter(r=>r.reason==='no-start-floor').length,results},null,2));}
const skipped=results.filter(r=>r.reason==='no-start-floor').length;
console.log(`CLIMB ROUTES ${results.filter(r=>r.success).length}/${results.length-skipped}${skipped?` (${skipped} samples without approach floor skipped)`:''}`);
