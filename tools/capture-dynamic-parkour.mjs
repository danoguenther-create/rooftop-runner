import {chromium} from 'playwright-core';
import {mkdir} from 'node:fs/promises';
await mkdir('artifacts/dynamic-parkour',{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium-browser',args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:960,height:640}});
 await page.goto(`${process.argv[2]??'http://127.0.0.1:4180/rooftop-runner/'}?level=testlevel&play=1`);
 await page.waitForFunction(()=>window.game?.player?.animator,null,{timeout:120000});
 await page.evaluate(()=>{const g=window.game;g.reviewRender=g.renderFrame.bind(g);g.renderFrame=()=>{};g.stepFixed(80);g.level.addBox([50,-.5,-82],[30,1,30],0,0,'#aaaaaa');g.level.addBox([50,.9,-82],[3,1.8,4],0,0,'#876b51');g.level.addBox([60,1.45,-82],[3,.8,1.8],0,0,'#876b51');g.physics.step();});
 for(const [name,x,z,roll] of [['reach',50,-84.95,false],['slide',60,-84,true]]){
  console.log(await page.evaluate(({name,x,z,roll})=>{
   const g=window.game,p=g.player;p.respawn();g.stepFixed(60);
   const input={moveX:0,moveY:1,lookDX:0,lookDY:0,jumpPressed:false,jumpHeld:false,divePressed:false,sprintHeld:false,rollHeld:roll,pausePressed:false,respawnPressed:false,flipPressed:null,spinPressed:0};
   g.inputs[0].poll=()=>input;p.body.setTranslation({x,y:.925,z},true);p.body.setNextKinematicTranslation({x,y:.925,z});p.velocity.set(0,0,6);p.cameraYaw=Math.PI;p.fsm.transition('RUN');p.grounded=true;p.parkour.readyAt=0;g.physics.step();p.handleFrameInput(input);
   const plan=p.parkour.plan(p);if(!plan)throw Error(`No ${name} plan`);p.pendingVault=plan;p.fsm.transition('VAULT');input.moveY=0;g.stepFixed(Math.round(plan.duration*.45*60));
   const at=p.body.translation();g.followCamera.update=()=>{};g.camera.position.set(at.x+5,at.y+1.4,at.z-4);g.camera.lookAt(at.x,at.y,at.z);g.reviewRender(0);
   return{name,kind:p.activeVault?.kind,phase:p.vaultProgress,handErrors:p.contactPose.handErrors};
  },{name,x,z,roll}));
  await page.screenshot({path:`artifacts/dynamic-parkour/${name}.png`});
 }
}finally{await browser.close();}
