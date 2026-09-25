import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium-browser',args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:640,height:480}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(`${process.argv[2]??'http://127.0.0.1:4180/rooftop-runner/'}?level=testlevel&mode=split&play=1`);
 await page.waitForFunction(()=>window.game?.players.length===2&&window.game.players.every(p=>p.contactPose),null,{timeout:120000});
 await page.evaluate(()=>{const g=window.game;g.renderFrame(0);g.renderFrame=()=>{};g.stepFixed(90);});
 // German # key; only P2 sprints, and releases even if the character label changes.
 await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent('keydown',{code:'Backslash',key:'#'})));
 let sprint=await page.evaluate(()=>{window.game.stepFixed(1);return window.game.players.map(p=>p.currentInput.sprintHeld);});assert.deepEqual(sprint,[false,true]);
 await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent('keyup',{code:'Backslash',key:'#'})));
 sprint=await page.evaluate(()=>{window.game.stepFixed(1);return window.game.players.map(p=>p.currentInput.sprintHeld);});assert.deepEqual(sprint,[false,false]);
 await page.evaluate(()=>{window.dispatchEvent(new KeyboardEvent('keydown',{code:'Digit3',key:'#'}));window.game.stepFixed(1);});
 sprint=await page.evaluate(()=>window.game.players.map(p=>p.currentInput.sprintHeld));assert.deepEqual(sprint,[false,true]);
 await page.evaluate(()=>{window.dispatchEvent(new KeyboardEvent('keyup',{code:'Digit3',key:'3'}));window.game.stepFixed(1);});
 sprint=await page.evaluate(()=>window.game.players.map(p=>p.currentInput.sprintHeld));assert.deepEqual(sprint,[false,false]);
 console.log('OK # sprints only P2 and releases cleanly across layouts');
 for(const i of [0,1]){
  const key=i===0?'w':'ArrowUp';await page.keyboard.down(key);
  const roll=await page.evaluate(i=>{
   const g=window.game,p=g.players[i];p.respawn();g.stepFixed(80);
   const pos={x:35+i*4,y:5.4,z:-20}; // use a real test floor outside the obstacle course
   g.level.registerBoxPhysics([35+i*4,-.5,0],[3,1,80],0,0);g.physics.step();
   p.body.setTranslation(pos,true);p.body.setNextKinematicTranslation(pos);p.velocity.set(0,0,6);p.fsm.transition('AIR');p.beginAirborne();p.grounded=false;
   let rolls=0,hard=0,clip=false,speed=0,at=0;p.bus.on('player:roll',()=>rolls++);p.bus.on('player:hardLanding',()=>hard++);
   for(let k=0;k<150;k++){g.stepFixed(1);if(rolls&&at===0){at=p.body.translation().z;speed=p.horizontalSpeed;}if(p.animator.currentName.includes('roll'))clip=true;}
   return{rolls,hard,clip,speed,state:p.fsm.current,distance:p.body.translation().z-at};
  },i);await page.keyboard.up(key);
  assert.equal(roll.rolls,1,JSON.stringify(roll));assert.equal(roll.hard,0);assert(roll.clip&&roll.speed>4&&roll.distance>3);assert.equal(roll.state,'RUN');console.log('OK medium landing rolls and continues running',i,roll);
 }
 for(const [height,expected] of [[1.5,'RUN'],[14,'BAIL']]){
  const boundary=await page.evaluate(height=>{const g=window.game,p=g.player;p.respawn();g.stepFixed(80);p.body.setTranslation({x:35,y:height+.91,z:-20},true);p.body.setNextKinematicTranslation({x:35,y:height+.91,z:-20});p.velocity.set(0,0,0);p.fsm.transition('AIR');p.beginAirborne();p.grounded=false;g.physics.step();let rolls=0;p.bus.on('player:roll',()=>rolls++);g.stepFixed(90);return{state:p.fsm.current,rolls};},height);
  assert.equal(boundary.state,expected,JSON.stringify(boundary));assert.equal(boundary.rolls,0);console.log('OK landing boundary',height,boundary);
 }
 await page.keyboard.down('w');
 const swing=await page.evaluate(()=>{
  const g=window.game,p=g.player;p.respawn();g.stepFixed(70);
  const V=p.mesh.position.constructor;
  g.level.addRail([new V(35,9,0),new V(41,9,0)]);g.physics.step();
  p.body.setTranslation({x:38,y:8.1,z:-.2},true);p.body.setNextKinematicTranslation({x:38,y:8.1,z:-.2});p.velocity.set(0,0,2);p.fsm.transition('AIR');p.grounded=false;
  const phases=[],contacts=[];let release=null;
  for(let k=0;k<1500;k++){
   g.stepFixed(1);const a=p.swinger.visual;
   if(a){phases.push(a.phi);contacts.push(Math.max(...p.contactPose.handErrors));
    if(Math.max(...phases)-Math.min(...phases)>Math.PI*2+.3 && p.velocity.y>7 && Math.abs(p.velocity.z)>5){release={...p.body.translation()};p.swinger.release();p.fsm.transition('AIR');break;}
   }
  }
  if(!release)return{phases:phases.slice(-10),range:Math.max(...phases)-Math.min(...phases)};
  const velocity=p.velocity.toArray();p.airTricks.queueFlip('front');let highest=release.y,flip=false;
  for(let k=0;k<45;k++){g.stepFixed(1);highest=Math.max(highest,p.body.translation().y);flip ||= p.airTricks.tuckWeight>.8;}
  return {range:Math.max(...phases)-Math.min(...phases),contact:Math.max(...contacts),velocity,rise:highest-release.y,distance:Math.abs(p.body.translation().z-release.z),flip};
 });await page.keyboard.up('w');
 assert(swing.range>Math.PI*2,JSON.stringify(swing));assert(swing.contact<.08,JSON.stringify(swing));assert(swing.velocity[1]>9&&swing.rise>2&&swing.distance>3&&swing.flip,JSON.stringify(swing));console.log('OK full bar circle, planted hands, high release and airborne flip',swing);
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
