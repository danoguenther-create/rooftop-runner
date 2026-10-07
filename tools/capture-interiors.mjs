/** Review shots of the enterable houses: open window, room and stairs, roof hatch, unlocked door. */
import {chromium} from 'playwright-core';
import {mkdir,readFile} from 'node:fs/promises';
await mkdir('artifacts/interiors',{recursive:true});
const data=JSON.parse(await readFile('public/levels/city01.json','utf8'));
const houses=data.scenery.buildings;
const windowHouse=houses.findIndex(b=>b.interior.openings.some(o=>!o.door&&o.face==='z'&&o.floor>3));
const hatchHouse=houses.findIndex(b=>b.interior.roofAccess&&b.interior.floors.length>=3);
const doorHouse=houses.findIndex(b=>b.interior.openings.some(o=>o.door));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium-browser',args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:960,height:640}});
 await page.goto(`${process.argv[2]??'http://127.0.0.1:4180/rooftop-runner/'}?level=city01&play=1`);
 await page.waitForFunction(()=>window.game?.state==='PLAYING'&&window.game?.player?.animator,null,{timeout:120000});
 await page.evaluate(()=>{const g=window.game;g.reviewRender=g.renderFrame.bind(g);g.renderFrame=()=>{};g.police.update=()=>{};g.police.fixedUpdate=()=>{};g.stepFixed(60);g.followCamera.update=()=>{};});
 const shot=async(name,player,eye,target)=>{
  await page.evaluate(({player,eye,target})=>{
   const g=window.game,p=g.player;
   if(player){p.respawn();p.body.setTranslation({x:player[0],y:player[1],z:player[2]},true);p.body.setNextKinematicTranslation({x:player[0],y:player[1],z:player[2]});p.velocity.set(0,0,0);p.fsm.transition('RUN');p.grounded=true;g.physics.step();g.stepFixed(20);}
   g.camera.position.set(...eye);g.camera.lookAt(...target);g.reviewRender(0);
  },{player,eye,target});
  await page.screenshot({path:`artifacts/interiors/${name}.png`});
 };
 {
  const b=houses[windowHouse],o=b.interior.openings.find(o=>!o.door&&o.face==='z'&&o.floor>3),wall=b.z+o.side*b.depth/2;
  await shot('window-outside',null,[o.u+3.5,o.row+1.2,wall+o.side*6],[o.u,o.row,wall]);
  await shot('window-inside',[o.u+1.5,o.floor+.93,wall-o.side*2.5],[o.u-2,o.floor+1.7,wall-o.side*5.5],[o.u,o.floor+1.2,wall]);
  const c=b.interior.core,f=b.interior.floors[1];
  await shot('room-stairs',null,[b.x-c.sx*(b.width/2-1.2),f+1.7,b.z-c.sz*(b.depth/2-1.5)],[(c.hole.x0+c.hole.x1)/2,f+.8,(c.hole.z0+c.hole.z1)/2]);
 }
 {
  const b=houses[hatchHouse],c=b.interior.core,f=b.interior.floors[1],mx=(c.hole.x0+c.hole.x1)/2,mz=(c.hole.z0+c.hole.z1)/2;
  await shot('stairwell',null,[c.hole.x0+(c.sx>0?-1.4:4),f+2.4,c.zi-c.sz*.4],[mx,f-1,mz]);
  await shot('roof-hatch',[mx-c.sx*3,b.height+.93,mz],[mx-c.sx*6,b.height+4,mz+c.sz*4],[mx,b.height,mz]);
 }
 {
  const b=houses[doorHouse],o=b.interior.openings.find(o=>o.door),wall=b.z+o.side*b.depth/2;
  await shot('door',[o.u,1.1,wall+o.side*2.5],[o.u+3,2.2,wall+o.side*8],[o.u,1.4,wall]);
 }
 console.log('captured',{windowHouse,hatchHouse,doorHouse});
}finally{await browser.close();}
