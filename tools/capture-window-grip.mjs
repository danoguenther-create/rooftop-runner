import {chromium} from 'playwright-core';
import {mkdir} from 'node:fs/promises';
await mkdir('artifacts/window-grip',{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium-browser',args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:960,height:640}});
 await page.goto(`${process.argv[2]??'http://127.0.0.1:4180/rooftop-runner/'}?level=city01&play=1`);
 await page.waitForFunction(()=>window.game?.state==='PLAYING'&&window.game?.player?.animator,null,{timeout:120000});
 console.log(await page.evaluate(()=>{
  const g=window.game,p=g.player;g.reviewRender=g.renderFrame.bind(g);g.renderFrame=()=>{};g.stepFixed(80);
  const input={moveX:0,moveY:1,lookDX:0,lookDY:0,jumpPressed:true,jumpHeld:false,divePressed:false,sprintHeld:false,rollHeld:false,pausePressed:false,respawnPressed:false,flipPressed:null,spinPressed:0};g.inputs[0].poll=()=>input;
  g.followCamera.setYaw(0);p.body.setTranslation({x:150,y:.925,z:11.15},true);p.body.setNextKinematicTranslation({x:150,y:.925,z:11.15});p.velocity.set(0,0,0);p.fsm.transition('RUN');p.grounded=true;g.physics.step();g.stepFixed(1);input.jumpPressed=false;
  for(let i=0;i<65;i++){g.stepFixed(1);if(p.fsm.current==='HANG'){input.moveY=0;break;}}
  g.stepFixed(13);g.followCamera.update=()=>{};g.camera.position.set(153,4.1,16);g.camera.lookAt(150,2.6,11);g.reviewRender(0);
  return{state:p.fsm.current,fromBelow:p.climb.transfer?.fromBelow,clip:p.animationName};
 }));
 await page.screenshot({path:'artifacts/window-grip/catch.png'});
 await page.evaluate(()=>{const g=window.game,p=g.player;g.stepFixed(35);const face=p.climb.grab.face;p.climb.grab.t=face.halfX-.15;const at=p.climb.hangPosition(p.velocity.clone());p.body.setTranslation(at,true);p.body.setNextKinematicTranslation(at);g.physics.step();p.climb.moveAlong(p,.1);g.stepFixed(65);g.camera.position.set(155,4,15);g.camera.lookAt(152,2.7,11);g.reviewRender(0);});
 await page.screenshot({path:'artifacts/window-grip/corner.png'});
}finally{await browser.close();}
