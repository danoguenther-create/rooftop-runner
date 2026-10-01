import {chromium} from 'playwright-core';
import {mkdirSync} from 'node:fs';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium-browser',args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1000,height:650}});
 await page.goto(`${process.argv[2]??'http://127.0.0.1:4180/rooftop-runner/'}?level=city01&play=1`);
 await page.waitForFunction(()=>window.game?.state==='PLAYING'&&window.game.player?.contactPose,null,{timeout:120000});
 await page.evaluate(()=>{const g=window.game;g.reviewRender=g.renderFrame.bind(g);g.renderFrame=()=>{};g.stepFixed(1);g.followCamera.update=()=>{};g.camera.position.set(119,10,66);g.camera.lookAt(103,2,86);g.reviewRender(0);});
 mkdirSync('artifacts/police',{recursive:true});await page.screenshot({path:'artifacts/police/station.jpg',type:'jpeg',quality:85});
 await page.evaluate(()=>{const g=window.game,p=g.player;p.respawn();p.body.setTranslation({x:140,y:.92,z:35},true);p.body.setNextKinematicTranslation({x:140,y:.92,z:35});g.physics.step();g.stepFixed(5500);for(let i=0;i<1200&&g.police.phase!=='chasing';i++)g.stepFixed(1);g.stepFixed(90);g.camera.position.set(111,6,36);g.camera.lookAt(120,1,28);g.reviewRender(0);});
 await page.screenshot({path:'artifacts/police/pursuit.jpg',type:'jpeg',quality:85});
 console.log('POLICE STATION AND PATROL CAPTURED');
}finally{await browser.close();}
