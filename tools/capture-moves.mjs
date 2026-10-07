/** Side-view filmstrips of jumps, flips and landings with real inputs (artifacts/moves/). */
import {chromium} from 'playwright-core';
import {mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
await mkdir('artifacts/moves',{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium-browser',args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:420,height:520}});
 await page.goto(`${process.argv[2]??'http://127.0.0.1:4180/rooftop-runner/'}?level=city01&play=1`);
 await page.waitForFunction(()=>window.game?.state==='PLAYING'&&window.game?.player?.animator,null,{timeout:120000});
 await page.evaluate(()=>{const g=window.game;g.reviewRender=g.renderFrame.bind(g);g.renderFrame=()=>{};g.police.update=()=>{};g.police.fixedUpdate=()=>{};g.followCamera.update=()=>{};g.stepFixed(30);
  // Only the 3D view: no HUD, minimap or hints over the filmstrip.
  const canvas=document.querySelector('canvas');document.querySelectorAll('body *').forEach(e=>{if(e!==canvas&&!e.contains(canvas))e.style.visibility='hidden';});
  const input={moveX:0,moveY:0,lookDX:0,lookDY:0,jumpPressed:false,jumpHeld:false,divePressed:false,sprintHeld:false,rollHeld:false,pausePressed:false,respawnPressed:false,flipPressed:null,spinPressed:0};
  g.input.poll=()=>input;window.__in=input;
  window.__place=(x,y,z)=>{const p=g.player;p.respawn();g.stepFixed(2);const at={x,y:y+.93,z};p.body.setTranslation(at,true);p.body.setNextKinematicTranslation(at);p.velocity.set(0,0,0);p.fsm.transition('AIR');g.physics.step();for(let i=0;i<40;i++){g.stepFixed(1);p.update(1/60);}};
  window.__tick=()=>{g.stepFixed(1);g.player.update(1/60);};
  window.__shot=(cx,cz)=>{const t=g.player.body.translation();g.camera.position.set(cx,t.y+.6,cz);g.camera.lookAt(cx,t.y,t.z);g.reviewRender(0);};
 });
 const film=async(name,{start,run=0,sprint=false,flip=null,flipAt=4,frames=90,every=5,yaw=Math.PI/2,side='z',jumpAt=0})=>{
  await page.evaluate(s=>{window.__place(...s);window.game.followCamera.setYaw(window.__yaw);},start);
  await page.evaluate(y=>{window.__yaw=y;window.game.followCamera.setYaw(y);},yaw);
  const shots=[];
  await page.evaluate(({run,sprint})=>{const i=window.__in;i.moveY=run?1:0;i.sprintHeld=sprint;for(let k=0;k<run;k++){window.game.followCamera.setYaw(window.__yaw);window.__tick();}},{run,sprint});
  for(let f=0;f<frames;f++){
   await page.evaluate(({f,flip,flipAt,jumpAt})=>{const i=window.__in;i.jumpPressed=f===jumpAt;i.jumpHeld=f>=jumpAt&&f<jumpAt+10;i.flipPressed=flip&&f===flipAt?flip:null;window.game.followCamera.setYaw(window.__yaw);window.__tick();},{f,flip,flipAt,jumpAt});
   if(f%every===0){
    // Camera beside the path, perpendicular to the run (runs go towards -x).
    await page.evaluate(side=>{const t=window.game.player.body.translation(),g=window.game;const cx=side==='x'?t.x+5.5:t.x,cz=side==='x'?t.z:t.z+5.5;g.camera.position.set(cx,t.y+.6,cz);g.camera.lookAt(t.x,t.y,t.z);g.reviewRender(0);},side);
    const file=`artifacts/moves/.${name}-${String(f).padStart(3,'0')}.png`;
    await page.screenshot({path:file,clip:{x:90,y:110,width:240,height:300}});shots.push(file);
   }
  }
  const state=await page.evaluate(()=>[window.game.player.fsm.current,window.game.player.animationName]);
  execFileSync('python3',['-c',`import sys
from PIL import Image
ims=[Image.open(p) for p in sys.argv[2:]]
s=Image.new('RGB',(sum(i.width for i in ims),ims[0].height))
x=0
for i in ims: s.paste(i,(x,0)); x+=i.width
s.save(sys.argv[1])
import os
[os.remove(p) for p in sys.argv[2:]]`,`artifacts/moves/${name}.png`,...shots]);
  console.log(name,state);
 };
 const only=process.env.MOVES?.split(',');
 const all={
  'standing-jump':{start:[-8.5,12,-21],frames:70},
  'running-jump':{start:[-2,12,-21],run:30,sprint:true,frames:60},
  'back-flip':{start:[-8.5,12,-21],flip:'back',frames:75},
  'ledge-catch':{start:[-86,0,-56],run:12,yaw:-Math.PI/2,side:'z',jumpAt:14,frames:100},
  'front-flip':{start:[-2,12,-21],run:30,sprint:true,flip:'front',frames:70},
 };
 for(const [k,v] of Object.entries(all))if(!only||only.includes(k))await film(k,v);
}finally{await browser.close();}
