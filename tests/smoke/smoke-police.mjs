import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium-browser',args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:800,height:500}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`${process.argv[2]??'http://127.0.0.1:4180/rooftop-runner/'}?level=city01&mode=split&play=1&nochar=1`);
 await page.waitForFunction(()=>window.game?.state==='PLAYING'&&window.game.police,null,{timeout:120000});
 await page.evaluate(()=>{const g=window.game;g.renderFrame(0);g.renderFrame=()=>{};g.stepFixed(30);window.arrests=[0,0];g.players.forEach((p,i)=>p.bus.on('police:arrest',()=>window.arrests[i]++));});
 const teleport=async(i,x,z)=>page.evaluate(({i,x,z})=>{const g=window.game,p=g.players[i];p.respawn();p.body.setTranslation({x,y:.91,z},true);p.body.setNextKinematicTranslation({x,y:.91,z});p.velocity.set(0,0,0);p.fsm.transition('AIR');p.beginAirborne();g.physics.step();g.stepFixed(5);},{i,x,z});
 const state=async(steps=0)=>page.evaluate(steps=>{const g=window.game;g.stepFixed(steps);return{phase:g.police.phase,exposure:g.police.exposure,wanted:[...g.police.wanted],car:g.police.car.root.position.toArray(),officers:g.police.officers.map(o=>({at:o.body.translation(),path:o.path.length,visible:o.model.root.visible})),players:g.players.map(p=>({at:p.body.translation(),detained:p.isDetained})),arrests:window.arrests};},steps);
 await teleport(0,140,27.65);await state(60*20);await teleport(0,115,15);let r=await state();assert.equal(r.exposure[0],0,'Leaving the factory resets the 90 s timer');
 await teleport(0,140,27.65);await teleport(1,140,35);r=await state(60*89);console.log('before alarm',r);assert.equal(r.phase,'idle');r=await state(70);console.log('alarm',r);assert.equal(r.phase,'driving');assert.deepEqual(r.wanted,[0,1]);
 for(let i=0;i<20&&r.phase!=='chasing';i++)r=await state(60);
 console.log('arrival',JSON.stringify(r));assert.equal(r.phase,'chasing');assert(r.officers.every(o=>o.visible));assert(Math.abs(r.car[2]-27.65)<.2);
 await teleport(0,92,-40);
 for(let i=0;i<75;i++){r=await state(60);if(i%10===0)console.log('pursuit',JSON.stringify(r));if(r.phase==='idle')break;}
 console.log('returned',r);assert.equal(r.arrests[0],0);assert.equal(r.arrests[1],1);assert.equal(r.phase,'idle');assert(r.officers.every(o=>!o.visible));assert(Math.abs(r.car[0]-112)<.2&&Math.abs(r.car[2]-77)<.2);assert(Math.abs(r.players[1].at.x-105)<1&&Math.abs(r.players[1].at.z-79)<1);assert.deepEqual(errors,[]);
 // A completed arrest must not suppress later alarms for the same player.
 await teleport(1,140,35);r=await state(60*5);assert.equal(r.phase,'idle');assert.equal(r.exposure[1],0,'Station cooldown suppresses a new countdown');
 r=await state(60*85);assert.equal(r.phase,'idle');r=await state(60*16);assert.equal(r.phase,'driving');assert.deepEqual(r.wanted,[1]);
 for(let i=0;i<20&&r.phase!=='chasing';i++)r=await state(60);
 assert.equal(r.phase,'chasing');await teleport(1,92,-40);
 for(let i=0;i<45&&r.phase!=='idle';i++)r=await state(60);
 assert.equal(r.phase,'idle');assert.deepEqual(r.arrests,[0,1]);assert.deepEqual(errors,[]);
 console.log('POLICE: 90 S, RESET, DRIVE, TWO PLAYERS, ARREST, ESCAPE, RETURN AND REPEAT PATROL OK');
}finally{await browser.close();}
