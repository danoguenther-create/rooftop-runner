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
  s.officers[1].boarded=true;s.officers[1].collider.setEnabled(false);
  const o=s.officers[0],results=[];
  // The far west target is the A1 roof: A0 now rises 6 m above it as a
  // climbers-only landmark (tools/gen-city01.mjs).
  for(const target of [[180,7.125,32],[183.5,21,-26.35],[238,0,-27],[237,6.5,35],[-8.5,12,-24],[-49.5,11,-54]]){
   s.navigation.reset();o.boarded=false;o.collider.setEnabled(true);o.path=[];o.action=null;o.yieldTo=null;o.yieldFor=null;o.repath=0;o.stuck=0;o.goal.set(Infinity,Infinity,Infinity);
   const start={x:140,y:.85,z:35};o.body.setTranslation(start,true);o.body.setNextKinematicTranslation(start);g.physics.step();
   let frames=0,peak=0,minY=0;
   for(;frames<12000;frames++){
    const chase=[...target];if(target[0]===180)chase[0]+=Math.sin(frames/120)*1.5;
    o.planned.copy(o.body.translation());s.walk(o,v(...chase),1/60);g.physics.step();
    const at=o.body.translation();peak=Math.max(peak,at.y);minY=Math.min(minY,at.y);
    if(v(at.x,at.y-.85,at.z).distanceTo(v(...chase))<1.1)break;
   }
   results.push({target,frames,at:o.body.translation(),peak,minY,path:o.path.slice(0,3),action:o.action});
  }
  return results;
 });
 console.log('movement',JSON.stringify(movement));
 for(const r of movement)assert(r.frames<12000,`Officer must physically reach ${r.target}: ${JSON.stringify(r)}`);
 assert.deepEqual(errors,[]);console.log('POLICE FACTORY ROOF, UPPER STOREY AND BUILDING INTERIORS OK');
}finally{await browser.close();}
