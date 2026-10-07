/** Filmstrip of catching a ledge from a jump at a facade (artifacts/moves/ledge-catch.png). */
import {chromium} from 'playwright-core';
import {execFileSync} from 'node:child_process';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium-browser',args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:420,height:520}});
 await page.goto(`${process.argv[2]??'http://127.0.0.1:4180/rooftop-runner/'}?level=city01&play=1`);
 await page.waitForFunction(()=>window.game?.state==='PLAYING'&&window.game?.player?.animator,null,{timeout:120000});
 const states=await page.evaluate(()=>{const g=window.game,p=g.player;g.reviewRender=g.renderFrame.bind(g);g.renderFrame=()=>{};g.police.update=()=>{};g.police.fixedUpdate=()=>{};g.followCamera.update=()=>{};g.stepFixed(30);
  const canvas=document.querySelector('canvas');document.querySelectorAll('body *').forEach(e=>{if(e!==canvas&&!e.contains(canvas))e.style.visibility='hidden';});
  const input={moveX:0,moveY:1,lookDX:0,lookDY:0,jumpPressed:false,jumpHeld:false,divePressed:false,sprintHeld:false,rollHeld:false,pausePressed:false,respawnPressed:false,flipPressed:null,spinPressed:0};g.input.poll=()=>input;
  p.respawn();g.stepFixed(2);p.climb.regrabAt=0;p.climb.climbCooldownUntil=0;
  const at={x:-80.2,y:1.4,z:-56};p.body.setTranslation(at,true);p.body.setNextKinematicTranslation(at);p.fsm.transition('AIR');p.beginAirborne();p.velocity.set(3,6.5,0);g.physics.step();
  return [];});
 const shots=[];
 for(let f=0;f<84;f++){
  const st=await page.evaluate(()=>{const g=window.game,p=g.player;g.followCamera.setYaw(-Math.PI/2);g.stepFixed(1);p.update(1/60);return p.fsm.current+' '+p.animationName;});
  if(f%4===0){
   await page.evaluate(()=>{const g=window.game,t=g.player.body.translation();g.camera.position.set(t.x-1.5,t.y+.4,t.z+4.8);g.camera.lookAt(t.x,t.y+.2,t.z);g.reviewRender(0);});
   const file=`artifacts/moves/.catch-${String(f).padStart(3,'0')}.png`;await page.screenshot({path:file,clip:{x:90,y:90,width:240,height:320}});shots.push(file);states.push(st);
  }
 }
 console.log(states.join(' | '));
 execFileSync('python3',['-c',`import sys,os
from PIL import Image
ims=[Image.open(p) for p in sys.argv[2:]]
s=Image.new('RGB',(sum(i.width for i in ims),ims[0].height))
x=0
for i in ims: s.paste(i,(x,0)); x+=i.width
s.save(sys.argv[1])
[os.remove(p) for p in sys.argv[2:]]`,'artifacts/moves/ledge-catch.png',...shots]);
}finally{await browser.close();}
