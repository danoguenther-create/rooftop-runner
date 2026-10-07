/**
 * West bank (tools/west-bank.mjs): every bridge can be crossed on foot, the
 * footbridge arch can be walked to its crown, the barges and mooring piles
 * make a jumping line across the river, and falling into the water puts the
 * runner back on the bank instead of at the spawn.
 */
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium-browser',args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:480,height:320}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(`${process.argv[2]??'http://127.0.0.1:4180/rooftop-runner/'}?level=city01&play=1&nochar=1`);
 await page.waitForFunction(()=>window.game?.state==='PLAYING',null,{timeout:120000});
 const result=await page.evaluate(()=>{
  const g=window.game,p=g.player;g.renderFrame=()=>{};g.police.update=()=>{};g.police.fixedUpdate=()=>{};g.minimaps?.forEach(m=>m.update=()=>{});g.stepFixed(30);
  const input={moveX:0,moveY:0,lookDX:0,lookDY:0,jumpPressed:false,jumpHeld:false,divePressed:false,sprintHeld:false,rollHeld:false,pausePressed:false,respawnPressed:false,flipPressed:null,spinPressed:0};
  g.input.poll=()=>input;
  const at=()=>p.body.translation();
  const place=(x,y,z)=>{
   p.respawn();g.stepFixed(2);const to={x,y:y+.93,z};p.body.setTranslation(to,true);p.body.setNextKinematicTranslation(to);p.velocity.set(0,0,0);
   p.fsm.transition('AIR');g.physics.step();g.stepFixed(30);
  };
  const face=(x,z)=>{const a=at();g.followCamera.setYaw(Math.atan2(a.x-x,a.z-z));};
  /** Run to (x,z); returns the highest feet level seen and where it ended. */
  const run=(x,z,frames=900,sprint=false)=>{
   let top=-Infinity;input.sprintHeld=sprint;
   for(let f=0;f<frames;f++){
    const a=at();top=Math.max(top,a.y-.925);
    if(Math.hypot(a.x-x,a.z-z)<.5)break;
    face(x,z);input.moveY=1;g.stepFixed(1);
   }
   input.moveY=0;input.sprintHeld=false;g.stepFixed(15);
   const a=at();return {top:+top.toFixed(2),end:[a.x,a.y-.925,a.z].map(v=>+v.toFixed(2)),state:p.fsm.current};
  };
  const near=(r,x,z,d=1.2)=>Math.hypot(r.end[0]-x,r.end[2]-z)<d;
  const out={};
  // Road bridge, footbridge deck and harbour bridge: east quay to west bank.
  place(-90,0,-9);out.road=run(-126,-9);out.road.ok=near(out.road,-126,-9)&&Math.abs(out.road.end[1])<.3;
  place(-90,0,21);out.foot=run(-126,21);out.foot.ok=near(out.foot,-126,21)&&out.foot.top>2.2;
  place(-90,0,94);out.harbour=run(-126,94);out.harbour.ok=near(out.harbour,-126,94);
  // The arch rib: from the east quay up to the crown.
  place(-95.4,0,23.4);out.arch=run(-107,23.4,700);out.arch.ok=out.arch.top>5;
  // Fall into the river from the quay: back on the bank, not at the spawn.
  let splashed=0;g.bus?.on?.('player:splash',()=>splashed++);
  place(-93,0,30);run(-95,30,200);
  input.moveY=1;face(-107,30);for(let f=0;f<240;f++){face(-107,30);g.stepFixed(1);}
  input.moveY=0;g.stepFixed(30);
  const back=at();out.water={end:[back.x,back.y-.925,back.z].map(v=>+v.toFixed(2)),splashed,ok:back.x>-96.6&&back.y-.925>-.3&&Math.hypot(back.x+95,back.z-30)<6};
  // Barge line in one run: east quay, near barge, pile, far barge.
  place(-93,0,50);
  {
   input.moveY=1;let jumps=0,top=0,low=0;
   for(let f=0;f<420;f++){
    const a=at();face(-130,50);
    // Take off at the barge's west edge and again from the pile.
    const edge=(a.x<-102.2&&a.x>-103.1)||(a.x<-106.6&&a.x>-107.7);
    input.jumpPressed=input.jumpHeld=p.grounded&&edge;if(input.jumpPressed)jumps++;
    g.stepFixed(1);low=Math.min(low,at().y-.925);
    if(at().x< -112&&p.grounded)break;
   }
   input.moveY=0;input.sprintHeld=false;input.jumpPressed=input.jumpHeld=false;g.stepFixed(20);
   const a=at();out.barges={jumps,low:+low.toFixed(2),end:[a.x,a.y-.925,a.z].map(v=>+v.toFixed(2))};
   out.barges.ok=a.x<-110.5&&a.y-.925>-.5;
  }
  return out;
 });
 console.log(JSON.stringify(result,null,1));
 assert.equal(errors.length,0,errors.join('\n'));
 assert.ok(result.road.ok,'road bridge crossable');
 assert.ok(result.foot.ok,'footbridge crossable over its crown');
 assert.ok(result.harbour.ok,'harbour bridge crossable');
 assert.ok(result.arch.ok,'arch rib walkable to the crown');
 assert.ok(result.water.ok,'water puts the runner back on the bank');
 assert.ok(result.barges.ok,'barges and piles form a jumping line');
 console.log('WEST BANK: BRIDGES, ARCH, WATER RESET AND BARGE LINE OK');
} finally { await browser.close(); }
