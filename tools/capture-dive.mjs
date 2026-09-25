import {chromium} from 'playwright-core';
import {mkdirSync} from 'node:fs';
const b=await chromium.launch({executablePath:'/usr/bin/chromium-browser',args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await b.newPage({viewport:{width:960,height:640}});page.on('pageerror',e=>{throw e;});
 await page.goto(`${process.argv[2]??'http://127.0.0.1:4180/rooftop-runner/'}?level=testlevel&play=1`);
 await page.waitForFunction(()=>window.game?.state==='PLAYING'&&window.game.player?.contactPose,null,{timeout:120000});
 await page.evaluate(()=>{const g=window.game,p=g.player;g.renderFrame(0);g.reviewRender=g.renderFrame.bind(g);g.renderFrame=()=>{};g.stepFixed(80);g.followCamera.update=()=>{};
  g.level.addBox([0,1,-15],[2,2,2],0,0,'#8f7252');
  p.body.setTranslation({x:0,y:.95,z:-20},true);p.body.setNextKinematicTranslation({x:0,y:.95,z:-20});p.velocity.set(0,0,0);p.fsm.transition('AIR');p.beginAirborne();g.physics.step();g.stepFixed(20);
  const key=type=>window.dispatchEvent(new KeyboardEvent(type,{code:'KeyW',key:'w'}));key('keydown');g.stepFixed(1);key('keyup');key('keydown');g.stepFixed(1);
 });
 mkdirSync('artifacts/dive',{recursive:true});
 for(const [name,frames] of [['launch',8],['flight',23],['descent',26],['roll',30],['run-out',45]]){
  const s=await page.evaluate(frames=>{const g=window.game,p=g.player;g.stepFixed(frames);const at=p.body.translation();g.camera.position.set(at.x+5,at.y+1,at.z+3);g.camera.lookAt(at.x,at.y,at.z);g.reviewRender(0);return{state:p.fsm.current,clip:p.animator.currentName,at};},frames);
  await page.screenshot({path:`artifacts/dive/${name}.jpg`,type:'jpeg',quality:85});console.log(name,s);
 }
}finally{await b.close();}
