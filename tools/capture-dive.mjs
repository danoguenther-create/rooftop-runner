import {chromium} from 'playwright-core';
import {mkdirSync} from 'node:fs';
const b=await chromium.launch({executablePath:'/usr/bin/chromium-browser',args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader']});
try{
 for(const crate of [false,true]){
 const page=await b.newPage({viewport:{width:960,height:640}});page.on('pageerror',e=>{throw e;});
 await page.goto(`${process.argv[2]??'http://127.0.0.1:4180/rooftop-runner/'}?level=testlevel&play=1`);
 await page.waitForFunction(()=>window.game?.state==='PLAYING'&&window.game.player?.contactPose,null,{timeout:120000});
 await page.evaluate(crate=>{const g=window.game,p=g.player;g.renderFrame(0);g.reviewRender=g.renderFrame.bind(g);g.renderFrame=()=>{};g.stepFixed(80);g.followCamera.update=()=>{};
  g.level.addBox([35,-.5,-10],[4,1,60],0,0,'#727e72');if(crate)g.level.addBox([35,1,-18.3],[2,2,.8],0,0,'#8f7252');
  p.body.setTranslation({x:35,y:.95,z:-20},true);p.body.setNextKinematicTranslation({x:35,y:.95,z:-20});p.velocity.set(0,0,0);p.fsm.transition('AIR');p.beginAirborne();g.physics.step();g.stepFixed(20);
  const key=type=>window.dispatchEvent(new KeyboardEvent(type,{code:'KeyW',key:'w'}));key('keydown');g.stepFixed(1);key('keyup');key('keydown');g.stepFixed(1);
 },crate);
 mkdirSync('artifacts/dive',{recursive:true});
 const phases=crate?[['launch',6],['flight',16],['descent',15],['roll',20],['run-out',40]]:[['launch',4],['flight',11],['descent',9],['roll',18],['run-out',40]];
 for(const [name,frames] of phases){
  const s=await page.evaluate(frames=>{const g=window.game,p=g.player;g.stepFixed(frames);const at=p.body.translation();g.camera.position.set(at.x+5,at.y+1,at.z+3);g.camera.lookAt(at.x,at.y,at.z);g.reviewRender(0);return{state:p.fsm.current,clip:p.animator.currentName,at};},frames);
  await page.screenshot({path:`artifacts/dive/${crate?'crate':'flat'}-${name}.jpg`,type:'jpeg',quality:85});console.log(crate,name,s);
 }
 await page.close();
 }
}finally{await b.close();}
