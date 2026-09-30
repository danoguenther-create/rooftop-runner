import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const b=await chromium.launch({executablePath:'/usr/bin/chromium-browser',args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await b.newPage({viewport:{width:800,height:500}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`${process.argv[2]??'http://127.0.0.1:4180/rooftop-runner/'}?level=testlevel&mode=split&play=1`);
 await page.waitForFunction(()=>window.game?.state==='PLAYING'&&window.game.players.every(p=>p.contactPose),null,{timeout:120000});
 const result=await page.evaluate(()=>{
  const g=window.game;g.renderFrame(0);g.renderFrame=()=>{};g.stepFixed(80);
  const bodies=g.players.map(p=>{let body;p.characterModel.traverse(m=>{if(m.material?.userData.fabricPreview)body=m;});return body;});
  const results=g.players.map((p,i)=>{
   const a=p.animator;a.update(0,'RUN',6,0,false);a.current.time=a.current.getClip().duration*.43;
   a.update(0,'RUN',9,0,false);const sprintPhase=a.current.time/a.current.getClip().duration;
   a.update(0,'RUN',6,0,false);const runPhase=a.current.time/a.current.getClip().duration;
   p.respawn();g.stepFixed(80);const x=35+i*5;g.level.registerBoxPhysics([x,-.5,-10],[4,1,40],0,0);
   p.body.setTranslation({x,y:2.4,z:-20},true);p.body.setNextKinematicTranslation({x,y:2.4,z:-20});
   p.velocity.set(0,0,0);p.grounded=false;p.fsm.transition('AIR');p.beginAirborne();g.physics.step();
   let compression=0,minFoot=Infinity,landed=false;
   for(let k=0;k<95;k++){
    g.stepFixed(1);
    if(p.fsm.current==='RUN'){
     landed=true;compression=Math.max(compression,-.9-p.characterModel.position.y);
     for(const leg of p.contactPose.legs)minFoot=Math.min(minFoot,leg.end.getWorldPosition(leg.end.position.clone()).y);
    }
   }
   const body=bodies[i];return{sprintPhase,runPhase,landed,compression,minFoot,root:p.characterModel.position.y,
    fabric:!!body,mask:body?!!body.geometry.attributes.clothMask:false,key:body?.material.customProgramCacheKey(),state:p.fsm.current};
  });
  return{results,independent:bodies[0].material!==bodies[1].material};
 });
 console.log(JSON.stringify(result,null,2));assert(result.independent);
 for(const r of result.results){assert(r.fabric&&r.mask&&r.key==='runner-cloth-trial-v1');assert(Math.abs(r.sprintPhase-.43)<.001&&Math.abs(r.runPhase-.43)<.001);assert(r.landed&&r.state==='RUN');assert(r.compression>.035&&r.compression<.11);assert(r.minFoot>-.08);assert(Math.abs(r.root+.9)<.005);}
 assert.deepEqual(errors,[]);console.log('VISUAL CHARACTER: BOTH PLAYERS, PHASE-SYNC AND LANDING CONTACT OK');
}finally{await b.close();}
