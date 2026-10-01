import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium-browser',args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:640,height:420}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`${process.argv[2]??'http://127.0.0.1:4180/rooftop-runner/'}?level=city01&mode=split&play=1&nochar=1`);
 await page.waitForFunction(()=>window.game?.state==='PLAYING',null,{timeout:120000});
 await page.evaluate(()=>{
  const g=window.game,s=g.police;g.renderFrame=()=>{};g.stepFixed(1);
  // Hold two observable, uncapturable targets to isolate dispatch timing from pursuit tactics.
  g.players.forEach((p,i)=>{p.fixedUpdate=()=>{};const at={x:i?123:140,y:8,z:35};p.body.setTranslation(at,true);p.body.setNextKinematicTranslation(at);});
  s.lineOfSight=()=>true;s.savedPath=s.navigation.path.bind(s.navigation);s.navigation.path=()=>[];g.physics.step();
 });
 const snapshot=n=>page.evaluate(n=>{const g=window.game;g.stepFixed(n);const s=g.police;return{time:s.pursuitTime,wanted:[...s.wanted],count:s.pursuingCount,patrols:s.patrols.map(p=>({phase:p.phase,at:p.pos.toArray(),visible:p.officers.filter(o=>!o.boarded).length})),hud:[...document.querySelectorAll('.police-status')].map(e=>e.textContent)};},n);
 let r=await snapshot(5402);assert.deepEqual(r.wanted,[0,1],'One intruder must alarm both players, including the player outside the factory');assert.equal(r.count,2);
 r=await snapshot(60*119);assert.equal(r.patrols.length,1);assert(r.hud.every(t=>t.includes('Verfolgung 1:59')&&t.includes('2 Polizisten')));
 const paused=await page.evaluate(()=>{const g=window.game,t=g.police.pursuitTime;g.pause();g.stepFixed(600);const frozen=g.police.pursuitTime===t;g.resume();return frozen;});assert(paused);
 r=await snapshot(60);console.log('first reinforcement',r);assert.equal(r.count,4);assert.equal(r.patrols.length,2);assert.equal(r.patrols[1].phase,'driving');
 r=await snapshot(60*18);assert.equal(r.patrols[1].phase,'chasing');assert.equal(r.patrols[1].visible,2);assert(r.patrols[1].at[2]>r.patrols[0].at[2]+6,'Separate vehicle parking bays');
 r=await snapshot(60*102);assert.equal(r.count,6);assert.equal(r.patrols.length,3);assert(r.hud.every(t=>t.includes('6 Polizisten')));
 r=await snapshot(60*480);assert.equal(r.count,12);assert.equal(r.patrols.length,6,'Reinforcement cap bounds browser resource use');console.log('maximum patrols',JSON.stringify(r));
 await page.evaluate(()=>{const g=window.game,s=g.police;s.navigation.path=s.savedPath;g.players.forEach((p,i)=>{const at={x:40+i*3,y:.9,z:-70};p.body.setTranslation(at,true);p.body.setNextKinematicTranslation(at);});g.physics.step();});
 for(let i=0;i<150;i++){r=await snapshot(60);if(r.patrols.every(p=>p.phase==='idle'))break;}
 console.log('all patrols returned',JSON.stringify(r));assert(r.patrols.every(p=>p.phase==='idle'));assert.equal(r.count,0);assert.deepEqual(r.wanted,[]);assert.deepEqual(errors,[]);
 console.log('SHARED ALARM, HUD, PAUSE, REINFORCEMENTS, TWELVE-OFFICER CAP AND CONVOY RETURN OK');
}finally{await browser.close();}
