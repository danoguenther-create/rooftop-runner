/** Review shots of the west bank: river and bridges, the Westturm, townhouses, villas. */
import {chromium} from 'playwright-core';
import {mkdir} from 'node:fs/promises';
await mkdir('artifacts/west-bank',{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium-browser',args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1100,height:680}});
 await page.goto(`${process.argv[2]??'http://127.0.0.1:4180/rooftop-runner/'}?level=city01&play=1`);
 await page.waitForFunction(()=>window.game?.state==='PLAYING'&&window.game?.player?.animator,null,{timeout:120000});
 await page.evaluate(()=>{const g=window.game;g.reviewRender=g.renderFrame.bind(g);g.renderFrame=()=>{};g.police.update=()=>{};g.police.fixedUpdate=()=>{};g.stepFixed(30);g.followCamera.update=()=>{};g.camera.far=900;g.camera.updateProjectionMatrix();});
 const shot=async(name,eye,target)=>{
  await page.evaluate(({eye,target})=>{const g=window.game;g.camera.position.set(...eye);g.camera.lookAt(...target);g.reviewRender(0);},{eye,target});
  await page.screenshot({path:`artifacts/west-bank/${name}.png`});
 };
 const only=process.env.SHOTS?.split(',');
 const shots={
  overview:[[-60,70,-110],[-170,5,10]],
  river:[[-80,14,70],[-107,0,-10]],
  'truss-bridge':[[-88,6,-28],[-107,3,-9]],
  footbridge:[[-90,5,34],[-107,3,21]],
  barges:[[-90,7,64],[-107,0,48]],
  westturm:[[-135,18,-95],[-172,30,-52]],
  'westturm-top':[[-150,70,-80],[-172,58,-52]],
  townhouses:[[-150,12,-14],[-185,9,6]],
  villas:[[-160,16,78],[-195,3,45]],
  'lone-house':[[-215,9,-8],[-236,4,6]],
  'old-town-river':[[-112,22,-80],[-66,10,-35]],
  'old-town-east':[[95,24,-50],[60,12,-24]],
  pavilion:[[90,8,-4],[73.5,3,6]],
  'police-hq':[[124,20,64],[103,6,91]],
  'police-roof':[[118,22,108],[100,12,92]],
 };
 for(const [name,[eye,target]] of Object.entries(shots))if(!only||only.includes(name))await shot(name,eye,target);
}finally{await browser.close();}
