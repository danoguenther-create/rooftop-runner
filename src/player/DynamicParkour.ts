import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type {PlayerController} from './PlayerController';
import type {VaultPlan} from './Vault';
import {CAPSULE_HALFHEIGHT,CAPSULE_RADIUS,GRAVITY,JUMP_VELOCITY,SPRINT_SPEED} from './tuning';
import {simNow} from '../core/SimClock';

// Browser adaptation of the action selection, target matching and jump prediction
// concepts in Èric Canela's Dynamic Parkour System (MIT). See public/licenses/.
const FULL=CAPSULE_HALFHEIGHT+CAPSULE_RADIUS;
const ROT={x:0,y:0,z:0,w:1};
export function traversalPoint(plan:VaultPlan,t:number,out=new THREE.Vector3()):THREE.Vector3{
 if(plan.points){const times=[0,.23,.72,1];let i=0;while(i<2&&t>times[i+1])i++;
  const u=THREE.MathUtils.smoothstep(t,times[i],times[i+1]);return out.copy(plan.points[i]).lerp(plan.points[i+1],u);}
 const u=1-t;return out.copy(plan.start).multiplyScalar(u*u).addScaledVector(plan.control,2*u*t).addScaledVector(plan.end,t*t);
}
export function clearTraversal(p:PlayerController,from:THREE.Vector3,to:THREE.Vector3,half=.16,radius=.3):boolean{
 return !p.physics.world.castShape(from,ROT,to.clone().sub(from),new RAPIER.Capsule(half,radius),.005,1,true,undefined,undefined,p.collider,p.body);
}
export class DynamicParkour {
 private readyAt=0;
 jumpTarget:THREE.Vector3|null=null;
 private jumpRemaining=0;
 private jumpDirection=new THREE.Vector3();
 private ray(p:PlayerController,from:THREE.Vector3,dir:THREE.Vector3,length:number){return p.physics.world.castRayAndGetNormal(new RAPIER.Ray(from,dir),length,true,undefined,undefined,p.collider,p.body);}
 private floor(p:PlayerController,x:number,y:number,z:number,depth:number):number|null{
  const h=this.ray(p,new THREE.Vector3(x,y,z),new THREE.Vector3(0,-1,0),depth);return h&&h.normal.y>.75?y-h.timeOfImpact:null;
 }
 private standing(p:PlayerController,at:THREE.Vector3):boolean{return !p.physics.world.intersectionWithShape(at,ROT,new RAPIER.Capsule(CAPSULE_HALFHEIGHT,CAPSULE_RADIUS-.02),undefined,undefined,p.collider,p.body);}
 plan(p:PlayerController):VaultPlan|null{
  if(!p.grounded||simNow()<this.readyAt||p.diveRecoveryActive)return null;
  const dir=p.getWishDir(new THREE.Vector3());if(!dir||p.horizontalSpeed<2.8)return null;
  const start=new THREE.Vector3().copy(p.body.translation()),feet=start.y-FULL;
  if(p.currentInput?.rollHeld){const slide=this.slide(p,start,dir,feet);if(slide)return slide;const down=this.down(p,start,dir,feet);if(down)return down;}
  const hit=this.ray(p,start.clone().setY(feet+.42),dir,1.05);
  if(!hit||Math.abs(hit.normal.y)>.3||-dir.dot(new THREE.Vector3().copy(hit.normal))<.65)return null;
  const contact=start.clone().addScaledVector(dir,hit.timeOfImpact+.12);
  const top=this.floor(p,contact.x,feet+2.35,contact.z,2.5);if(top===null||top-feet<.45||top-feet>2.05)return null;
  contact.y=top+.035;
  // Scan depth and the landing, instead of selecting an animation from height alone.
  let exit:number|null=null;
  for(let d=hit.timeOfImpact+.2;d<hit.timeOfImpact+3.7;d+=.15){
   if(this.floor(p,start.x+dir.x*d,top+.12,start.z+dir.z*d,.24)===null){exit=d;break;}
  }
  let end:THREE.Vector3,kind:VaultPlan['kind'];
  if(exit!==null&&top-feet<=1.25){
   end=start.clone().addScaledVector(dir,exit+.55);const land=this.floor(p,end.x,top+1,end.z,4);
   if(land===null||land>top-.15||top-land>2.7)return null;end.y=land+FULL+.025;kind='speed';
  }else{
   end=start.clone().addScaledVector(dir,hit.timeOfImpact+.65);const land=this.floor(p,end.x,top+.1,end.z,.25);
   if(land===null||Math.abs(land-top)>.12)return null;end.y=top+FULL+.025;kind='reach';
  }
  if(!this.standing(p,end))return null;
  const high=Math.max(start.y,top+.49),lift=start.clone().setY(high),across=end.clone().setY(high);
  return this.validate(p,{start,control:lift.clone(),end,contact,direction:dir.clone(),obstacleHeight:top-feet,kind,
   duration:THREE.MathUtils.clamp(start.distanceTo(end)/Math.max(p.horizontalSpeed,4)+.2,.45,.9),points:[start.clone(),lift,across,end.clone()],halfHeight:.16});
 }
 private validate(p:PlayerController,plan:VaultPlan):VaultPlan|null{
  let previous=plan.start;for(let i=1;i<=24;i++){const next=traversalPoint(plan,i/24);
   if(plan.kind==='slide'){const floor=this.floor(p,next.x,plan.start.y+.1,next.z,1.2);if(floor===null||Math.abs(floor-(plan.start.y-FULL))>.2)return null;}
   if(!clearTraversal(p,previous,next,plan.halfHeight??.16))return null;previous=next;}
  this.readyAt=simNow()+plan.duration*1000+350;return plan;
 }
 private slide(p:PlayerController,start:THREE.Vector3,dir:THREE.Vector3,feet:number):VaultPlan|null{
  if(p.horizontalSpeed<4)return null;
  const head=this.ray(p,start.clone().setY(feet+1.3),dir,1.5);if(!head)return null;
  if(this.ray(p,start.clone().setY(feet+.38),dir,head.timeOfImpact+.5))return null;
  for(let d=head.timeOfImpact+1;d<5.5;d+=.25){
   const end=start.clone().addScaledVector(dir,d),floor=this.floor(p,end.x,feet+.3,end.z,.6);
   if(floor===null||Math.abs(floor-feet)>.15)continue;end.y=floor+FULL+.025;if(!this.standing(p,end))continue;
   const lower=start.clone().setY(feet+.38),through=end.clone().setY(feet+.38);
   return this.validate(p,{start,control:lower.clone(),end,contact:lower.clone(),direction:dir.clone(),obstacleHeight:0,kind:'slide',halfHeight:.05,
    duration:THREE.MathUtils.clamp(d/p.horizontalSpeed+.15,.55,1.05),points:[start.clone(),lower,through,end.clone()]});
  }return null;
 }
 private down(p:PlayerController,start:THREE.Vector3,dir:THREE.Vector3,feet:number):VaultPlan|null{
  const edge=start.clone().addScaledVector(dir,.9);if(this.floor(p,edge.x,feet+.15,edge.z,.5)!==null)return null;
  const end=start.clone().addScaledVector(dir,1.55),floor=this.floor(p,end.x,feet-.5,end.z,2.5);if(floor===null||feet-floor<.8)return null;
  end.y=floor+FULL+.025;if(!this.standing(p,end))return null;
  const lift=start.clone().setY(start.y+.18),across=end.clone().setY(start.y+.18);
  return this.validate(p,{start,control:lift.clone(),end,contact:edge,direction:dir.clone(),obstacleHeight:feet-floor,kind:'drop',halfHeight:.16,duration:.6,points:[start.clone(),lift,across,end.clone()]});
 }
 /** Predict a physically clear landing without replacing the AIR state or flips. */
 predictJump(p:PlayerController):void{
  this.jumpTarget=null;const dir=p.getWishDir(new THREE.Vector3());if(!dir||p.horizontalSpeed<2)return;
  const start=new THREE.Vector3().copy(p.body.translation()),feet=start.y-FULL;
  // On continuous ground keep the original free jump unchanged.
  const ahead=start.clone().addScaledVector(dir,1.1),floor=this.floor(p,ahead.x,feet+.2,ahead.z,.5);
  if(floor!==null&&!this.ray(p,start,dir,1.2))return;
  let score=Infinity,target:THREE.Vector3|null=null,flight=0;
  for(const f of p.level.topFaces){
   if(f.halfX<.3||f.halfZ<.3||f.y-feet>1.4||f.y-feet< -2.5)continue;
   const c=Math.cos(f.rotY),s=Math.sin(f.rotY),guess=start.clone().addScaledVector(dir,p.horizontalSpeed*.75),dx=guess.x-f.cx,dz=guess.z-f.cz;
   const lx=THREE.MathUtils.clamp(dx*c-dz*s,-f.halfX+.28,f.halfX-.28),lz=THREE.MathUtils.clamp(dx*s+dz*c,-f.halfZ+.28,f.halfZ-.28);
   const end=new THREE.Vector3(f.cx+lx*c+lz*s,f.y+FULL+.025,f.cz-lx*s+lz*c),delta=end.clone().sub(start),distance=Math.hypot(delta.x,delta.z);
   if(distance<1.8||distance>8||delta.clone().setY(0).normalize().dot(dir)<.94)continue;
   const discriminant=JUMP_VELOCITY**2-2*GRAVITY*delta.y;if(discriminant<=0)continue;
   const time=(JUMP_VELOCITY+Math.sqrt(discriminant))/GRAVITY,speed=distance/time;
   if(speed>SPRINT_SPEED*1.1||Math.abs(speed-p.horizontalSpeed)>2||!this.standing(p,end))continue;
   const rank=Math.abs(speed-p.horizontalSpeed)+distance*.04;if(rank>=score)continue;
   let previous=start,clear=true;
   for(let i=1;i<=20;i++){const t=time*i/20,next=start.clone().addScaledVector(delta,t/time);next.y=start.y+JUMP_VELOCITY*t-.5*GRAVITY*t*t;
    if(!clearTraversal(p,previous,next,CAPSULE_HALFHEIGHT,CAPSULE_RADIUS-.02)){clear=false;break;}previous=next;}
   if(clear){score=rank;target=end;flight=time;}
  }
  if(target){this.jumpTarget=target;this.jumpRemaining=flight;this.jumpDirection.copy(dir);p.velocity.x=(target.x-start.x)/flight;p.velocity.z=(target.z-start.z)/flight;}
 }
 guideJump(p:PlayerController,dt:number):void{
  if(!this.jumpTarget)return;this.jumpRemaining-=dt;
  const dir=p.getWishDir(new THREE.Vector3());
  if(this.jumpRemaining<.03||p.currentInput?.rollHeld||p.diveJumpActive||(!p.airTricks.active&&(!dir||dir.dot(this.jumpDirection)<.85))){this.jumpTarget=null;return;}
  const at=p.body.translation(),target=this.jumpTarget;
  const desired=new THREE.Vector3((target.x-at.x)/this.jumpRemaining,0,(target.z-at.z)/this.jumpRemaining).clampLength(0,SPRINT_SPEED*1.1);
  const blend=Math.min(1,dt*8);p.velocity.x=THREE.MathUtils.lerp(p.velocity.x,desired.x,blend);p.velocity.z=THREE.MathUtils.lerp(p.velocity.z,desired.z,blend);
 }
}
