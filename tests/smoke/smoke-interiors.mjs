/**
 * Enterable houses (tools/city-interiors.mjs): every house is walked from the
 * ground floor up its whole stair core (to the roof where the hatch is open),
 * every open window is entered from a hang on its sill and left again on
 * foot, and every unlocked door is walked through from the street.
 */
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {planHouse} from '../../tools/city-interiors.mjs';
import {STATION,HELIPAD} from '../../tools/police-station.mjs';
// The police station is built at runtime from the same plan (PoliceModels.ts).
const station={...STATION},roofKit=[{x0:HELIPAD.x-HELIPAD.size/2,x1:HELIPAD.x+HELIPAD.size/2,z0:HELIPAD.z-HELIPAD.size/2,z1:HELIPAD.z+HELIPAD.size/2},{x0:STATION.x-STATION.width/2,x1:STATION.x-STATION.width/2+5,z0:STATION.z+STATION.depth/2-4,z1:STATION.z+STATION.depth/2}];
{const plan=planHouse(station,0,{hash:()=>0,obstacles:roofKit,roofAccess:true,windows:false});station.interior={floors:plan.floors,roofAccess:plan.roofAccess,core:plan.layout,openings:[]};}
const browser=await chromium.launch({executablePath:'/usr/bin/chromium-browser',args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:480,height:320}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(`${process.argv[2]??'http://127.0.0.1:4180/rooftop-runner/'}?level=city01&play=1&nochar=1`);
 await page.waitForFunction(()=>window.game?.state==='PLAYING',null,{timeout:120000});
 const result=await page.evaluate(async([only,station])=>{
  const g=window.game,p=g.player;g.renderFrame=()=>{};g.police.update=()=>{};g.police.fixedUpdate=()=>{};g.minimaps?.forEach(m=>m.update=()=>{});g.stepFixed(30);
  const data=await (await fetch('levels/city01.json')).json();
  const input={moveX:0,moveY:0,lookDX:0,lookDY:0,jumpPressed:false,jumpHeld:false,divePressed:false,sprintHeld:false,rollHeld:false,pausePressed:false,respawnPressed:false,flipPressed:null,spinPressed:0};
  g.input.poll=()=>input;
  const place=(x,y,z,state='RUN')=>{
   p.respawn();g.stepFixed(2);p.climb.regrabAt=0;p.climb.climbCooldownUntil=0;
   const at={x,y,z};p.body.setTranslation(at,true);p.body.setNextKinematicTranslation(at);p.velocity.set(0,0,0);
   p.fsm.transition(state);p.grounded=state==='RUN';g.physics.step();
  };
  const face=(x,z)=>{const at=p.body.translation();g.followCamera.setYaw(Math.atan2(at.x-x,at.z-z));};
  /** Steer through waypoints like a player; returns false if stuck. */
  const follow=(points,maxFrames=900,goalY=null)=>{
   let i=0,stuck=0,last=null;
   for(let f=0;f<maxFrames&&i<points.length;f++){
    const at=p.body.translation(),[x,z]=points[i];
    // Arrived on the goal level: stop like a player would, not run on into a wall.
    if(goalY!==null&&p.grounded&&at.y-.925>goalY-.15){i=points.length;break;}
    if(Math.hypot(at.x-x,at.z-z)<.4){i++;continue;}
    face(x,z);input.moveY=1;g.stepFixed(1);
    const now=p.body.translation();
    stuck=last&&Math.hypot(now.x-last.x,now.z-last.z)+Math.abs(now.y-last.y)<.002?stuck+1:0;last={...now};
    if(stuck>40)break;
   }
   input.moveY=0;g.stepFixed(20);
   return i===points.length;
  };
  const inside=(b,at)=>Math.abs(at.x-b.x)<b.width/2-.3&&Math.abs(at.z-b.z)<b.depth/2-.3;
  const stairs=[],windows=[],doors=[];
  const all=[...data.scenery.buildings.map((b,i)=>[i,b]),...(data.scenery.infills??[]).map((b,i)=>['infill-'+i,b]),...(data.scenery.towers??[]).map((b,i)=>['tower-'+i,b]),['station',station]];
  for(const [index,b] of all){
   if(only&&!only.includes(index))continue;
   const it=b.interior,c=it.core,a=(c.laneA[0]+c.laneA[1])/2,lb=(c.laneB[0]+c.laneB[1])/2;
   const levels=it.roofAccess?[...it.floors,b.height]:it.floors;
   // --- Stair core: ground floor landing up to the last level.
   place(a,it.floors[0]+.93,c.zi-c.sz*.65);
   const route=[];
   for(let k=0;k+1<levels.length;k++)route.push([a,c.zh-c.sz*.65],[lb,c.zh-c.sz*.65],[lb,c.zl+c.sz*.65],[a,c.zl+c.sz*.65]);
   const walked=follow(route,600*levels.length,levels[levels.length-1]);
   const top=p.body.translation();
   // Diagnose a stop: what the body would touch a little further up or ahead.
   const blockers=[];
   if(!walked)for(const [dx,dy,dz] of [[0,.4,0],[0,0,.4],[0,0,-.4],[.4,0,0],[-.4,0,0]])g.physics.world.intersectionsWithShape({x:top.x+dx,y:top.y+dy,z:top.z+dz},{x:0,y:0,z:0,w:1},p.collider.shape,col=>{const t=col.translation(),h=col.shape.halfExtents;blockers.push([dx,dy,dz,+t.x.toFixed(2),+t.y.toFixed(2),+t.z.toFixed(2),h?[h.x*2,h.y*2,h.z*2].map(v=>+v.toFixed(2)):'']);return true;},undefined,undefined,p.collider,p.body);
   stairs.push({index,walked,at:[top.x,top.y,top.z].map(v=>+v.toFixed(2)),blockers:blockers.slice(0,12),reached:+(top.y-.925).toFixed(2),want:levels[levels.length-1],grounded:p.grounded,state:p.fsm.current});
   // --- Open windows: catch the sill from a fall, climb in, walk out again.
   for(const o of it.openings.filter(o=>!o.door)){
    const n=o.face==='z'?[0,o.side]:[o.side,0];
    const wall=o.face==='z'?b.z+o.side*b.depth/2:b.x+o.side*b.width/2;
    // Sill tops and outer edges exactly as CityScenery places them.
    const narrow=o.face==='x'&&data.scenery.buildings.some(q=>q!==b&&Math.abs(q.z-b.z)<(q.depth+b.depth)/2&&(q.x-o.side*q.width/2-(b.x+o.side*(b.width/2+.04)))*o.side>0&&(q.x-o.side*q.width/2-(b.x+o.side*(b.width/2+.04)))*o.side<3);
    const sillTop=o.face==='z'?o.row-.89:o.row-.95;
    const reach=o.face==='z'?.06+.56+.575:.04+(narrow?.32:.9)-.01;
    const out=wall+o.side*(reach+.35),feet=sillTop-1.85;
    const at=o.face==='z'?[o.u,feet+.9,out]:[out,feet+.9,o.u];
    place(at[0],at[1],at[2],'AIR');p.velocity.y=-1;
    g.followCamera.setYaw(Math.atan2(n[0],n[1]));input.moveY=1;
    let hung=false;
    for(let f=0;f<40&&!hung;f++){g.stepFixed(1);hung=p.fsm.current==='HANG';}
    // Hold forward: mantle, then keep walking into the room.
    const deep=o.face==='z'?[o.u,b.z+o.side*(b.depth/2-2.2)]:[b.x+o.side*(b.width/2-2.2),o.u];
    let entered=false;
    for(let f=0;f<400&&!entered;f++){
     if(p.fsm.current!=='HANG')face(deep[0],deep[1]);
     input.moveY=1;g.stepFixed(1);
     const now=p.body.translation();entered=p.fsm.current==='RUN'&&p.grounded&&inside(b,now)&&Math.abs(now.y-.925-o.floor)<.3;
    }
    input.moveY=0;g.stepFixed(10);
    // Leave: from the room straight out through the opening.
    const outside=o.face==='z'?[o.u,b.z+o.side*(b.depth/2+3)]:[b.x+o.side*(b.width/2+3),o.u];
    const left=entered&&(()=>{for(let f=0;f<240;f++){face(outside[0],outside[1]);input.moveY=1;input.jumpPressed=f%40===39;g.stepFixed(1);if(!inside(b,p.body.translation()))return true;}return false;})();
    input.moveY=0;input.jumpPressed=false;
    windows.push({index,face:o.face+o.side,floor:o.floor,hung,entered,left,at:Object.values(p.body.translation()).map(v=>+v.toFixed(2)),state:p.fsm.current});
   }
   // --- The rare unlocked door, from the pavement.
   for(const o of it.openings.filter(o=>o.door)){
    place(o.u,1.1,b.z+o.side*(b.depth/2+3));
    const walked=follow([[o.u,b.z+o.side*(b.depth/2+.5)],[o.u,b.z+o.side*(b.depth/2-2.5)]],400);
    const now=p.body.translation();
    doors.push({index,walked,inside:inside(b,now),y:+now.y.toFixed(2)});
   }
  }
  // --- Roof annexes and stair sheds: in through their doorway from the roof.
  const rooms=[];
  for(const [n,r] of (data.scenery.rooms??[]).entries()){
   if(only&&!only.includes('room-'+n))continue;
   const o=r.door,wall=r.z+o.side*r.depth/2;
   place(o.u,r.base+.95,wall+o.side*1.6);
   const walked=follow([[o.u,wall+o.side*.4],[o.u,r.z]],300);
   const now=p.body.translation();
   rooms.push({index:'room-'+n,walked,inside:Math.abs(now.x-r.x)<r.width/2-.3&&Math.abs(now.z-r.z)<r.depth/2-.3&&Math.abs(now.y-.925-r.base)<.2});
  }
  return {stairs,windows,doors,rooms};
 },[process.env.INTERIOR_ONLY?process.env.INTERIOR_ONLY.split(',').map(v=>isNaN(+v)?v:+v):null,station]);
 const bad={stairs:result.stairs.filter(s=>!s.walked||Math.abs(s.reached-s.want)>.15),windows:result.windows.filter(w=>!w.hung||!w.entered||!w.left),doors:result.doors.filter(d=>!d.walked||!d.inside),rooms:result.rooms.filter(r=>!r.walked||!r.inside)};
 console.log(JSON.stringify({counts:{stairs:result.stairs.length,windows:result.windows.length,doors:result.doors.length,rooms:result.rooms.length},bad},null,1));
 assert.equal(errors.length,0,errors.join('\n'));
 assert.ok(process.env.INTERIOR_ONLY||result.stairs.length>=42&&result.windows.length>0&&result.doors.length>0,'every house is tested');
 assert.deepEqual(bad.stairs,[],'stair cores walkable to the top');
 assert.deepEqual(bad.windows,[],'open windows enterable and leavable');
 assert.deepEqual(bad.doors,[],'unlocked doors walkable');
 assert.deepEqual(bad.rooms,[],'roof rooms enterable');
 console.log('INTERIORS: STAIR CORES, OPEN WINDOWS, DOORS AND ROOF ROOMS OK');
} finally { await browser.close(); }
