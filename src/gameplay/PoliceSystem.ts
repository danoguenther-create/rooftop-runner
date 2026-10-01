import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type {PhysicsWorld} from '../physics/PhysicsWorld';
import type {LevelLoader} from '../level/LevelLoader';
import type {PlayerController} from '../player/PlayerController';
import {RUN_SPEED,SPRINT_SPEED} from '../player/tuning';
import {PoliceNavigation,traversalPosition,POLICE_QUERY_GROUPS,OFFICER_COLLISION_GROUPS,type PoliceWaypoint,type Traversal} from './PoliceNavigation';
import {buildStation,buildPatrolCar,buildOfficer} from './PoliceModels';

export const POLICE_DELAY=90;
export const POLICE_REINFORCEMENT_SPEED=SPRINT_SPEED*1.2;
export const REINFORCEMENT_INTERVAL=120;
export const MAX_PATROLS=6;
type Phase='idle'|'driving'|'exiting'|'chasing'|'boarding'|'returning';
interface Action {from:THREE.Vector3;to:THREE.Vector3;mode:Traversal;age:number;duration:number}
export interface Officer {
 id:number;patrol:number;model:ReturnType<typeof buildOfficer>;body:RAPIER.RigidBody;collider:RAPIER.Collider;controller:RAPIER.KinematicCharacterController;
 path:PoliceWaypoint[];goal:THREE.Vector3;repath:number;stride:number;boarded:boolean;
 planned:THREE.Vector3;motion:THREE.Vector3;planStart:THREE.Vector3;yieldTo:THREE.Vector3|null;yieldFor:number|null;stuck:number;action:Action|null;
}
interface Patrol {
 car:ReturnType<typeof buildPatrolCar>;body:RAPIER.RigidBody;collider:RAPIER.Collider;pos:THREE.Vector3;
 phase:Phase;age:number;route:THREE.Vector3[];routeIndex:number;yaw:number;speed:number;doorAngle:number;officers:Officer[];
}
/** A shared alarm, individual escape/arrest state, and reusable reinforcement patrols. */
export class PoliceSystem {
 readonly exposure:number[];
 readonly wanted=new Set<number>();
 readonly officers:Officer[]=[];
 readonly patrols:Patrol[]=[];
 readonly navigation:PoliceNavigation;
 pursuitTime=0;
 private nextReinforcement=REINFORCEMENT_INTERVAL;
 private carShape=new RAPIER.Cuboid(.92,.64,2.18);
 private time=0;
 private cooldown=0;
 private notice:string[];
 private noticeTime:number[];
 private labels:HTMLDivElement[]=[];
 private target=new THREE.Vector3();
 private position=new THREE.Vector3();
 get car(){return this.patrols[0].car;}
 get carPos(){return this.patrols[0].pos;}
 get phase():Phase {
  if(this.patrols.every(p=>p.phase==='idle'))return'idle';
  if(this.wanted.size)return this.patrols.some(p=>p.phase==='chasing')?'chasing':this.patrols[0].phase;
  return this.patrols.some(p=>p.phase==='boarding')?'boarding':'returning';
 }
 get pursuingCount():number {return this.patrols.filter(p=>['driving','exiting','chasing'].includes(p.phase)).length*2;}
 constructor(private physics:PhysicsWorld,level:LevelLoader,private scene:THREE.Scene,private players:PlayerController[],hudRoots:HTMLElement[]){
  scene.add(buildStation(level));
  this.exposure=players.map(()=>0);this.notice=players.map(()=>'');this.noticeTime=players.map(()=>0);
  this.createPatrol();this.navigation=new PoliceNavigation(physics,()=>this.patrols.map(p=>p.collider));
  hudRoots.forEach(root=>{const label=document.createElement('div');label.className='police-status';label.style.cssText='position:absolute;left:12px;top:116px;max-width:calc(100% - 24px);padding:7px 10px;border-radius:5px;background:#102333dd;color:#eaf3ff;font:600 13px sans-serif;white-space:pre-line;display:none;';root.appendChild(label);this.labels.push(label);});
  this.update(0);
 }
 private createPatrol():Patrol {
  const id=this.patrols.length,home=new THREE.Vector3(112-id*3.6,0,77),parkZ=27.65+id*7;
  const car=buildPatrolCar();this.scene.add(car.root);
  const body=this.physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(home.x,.85,home.z));
  const collider=this.physics.world.createCollider(RAPIER.ColliderDesc.cuboid(.92,.64,2.18),body);
  const patrol:Patrol={car,body,collider,pos:home.clone(),phase:'idle',age:0,route:[home,new THREE.Vector3(home.x,0,70),new THREE.Vector3(117,0,70),new THREE.Vector3(118,0,Math.max(52,parkZ+4)),new THREE.Vector3(118,0,parkZ)],routeIndex:1,yaw:Math.PI,speed:0,doorAngle:0,officers:[]};
  this.patrols.push(patrol);
  for(let i=0;i<2;i++){
   const model=buildOfficer(this.officers.length);model.root.visible=false;this.scene.add(model.root);
   const body=this.physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(home.x,.88,home.z));
   const collider=this.physics.world.createCollider(RAPIER.ColliderDesc.capsule(.55,.28).setCollisionGroups(OFFICER_COLLISION_GROUPS),body);collider.setEnabled(false);
   const controller=this.physics.world.createCharacterController(.02);controller.enableAutostep(.5,.2,true);controller.enableSnapToGround(.3);
   const officer:Officer={id:this.officers.length,patrol:id,model,body,collider,controller,path:[],goal:new THREE.Vector3(Infinity,Infinity,Infinity),repath:0,stride:0,boarded:true,planned:new THREE.Vector3(),motion:new THREE.Vector3(),planStart:new THREE.Vector3(),yieldTo:null,yieldFor:null,stuck:0,action:null};
   this.officers.push(officer);patrol.officers.push(officer);
  }
  return patrol;
 }
 private dispatch(){
  const patrol=this.patrols.find(p=>p.phase==='idle')??(this.patrols.length<MAX_PATROLS?this.createPatrol():null);
  if(!patrol)return;patrol.routeIndex=1;patrol.speed=0;this.change(patrol,'driving');this.navigation.reset();
 }
 private inside(p:PlayerController):boolean {const t=p.body.translation();return t.x>126&&t.x<270&&t.z> -60&&t.z<65&&t.y> -8&&t.y<45;}
 private change(p:Patrol,phase:Phase){p.phase=phase;p.age=0;}
 private message(i:number,text:string){this.notice[i]=text;this.noticeTime[i]=5;}
 private lineOfSight(from:THREE.Vector3,p:PlayerController):boolean {
  const delta=new THREE.Vector3().copy(p.body.translation()).sub(from),length=delta.length();if(length<.01)return true;
  return !this.physics.world.castRay(new RAPIER.Ray(from,delta.divideScalar(length)),Math.max(0,length-.4),true,RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC|RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC);
 }
 fixedUpdate(dt:number):void {
  this.time+=dt;this.cooldown=Math.max(0,this.cooldown-dt);this.noticeTime=this.noticeTime.map(t=>Math.max(0,t-dt));
  for(const o of this.officers){o.planned.copy(o.body.translation());o.motion.set(0,0,0);}
  if(this.phase==='idle'){
   this.players.forEach((p,i)=>{this.exposure[i]=this.inside(p)&&!p.isDetained&&this.cooldown===0?this.exposure[i]+dt:0;});
   if(this.exposure.some(t=>t>=POLICE_DELAY)){
    this.players.forEach((p,i)=>{if(!p.isDetained)this.wanted.add(i);});
    this.pursuitTime=0;this.nextReinforcement=REINFORCEMENT_INTERVAL;this.dispatch();
   }
  }
  if(this.wanted.size){
   this.pursuitTime+=dt;
   if(this.pursuitTime>=this.nextReinforcement){this.nextReinforcement+=REINFORCEMENT_INTERVAL;this.dispatch();}
  }
  const wasActive=this.phase!=='idle';
  for(const patrol of this.patrols){
   patrol.age+=dt;
   if(!this.wanted.size&&['driving','exiting','chasing'].includes(patrol.phase)){
    if(patrol.officers.every(o=>o.boarded)){patrol.routeIndex=Math.max(0,patrol.routeIndex-1);this.change(patrol,'returning');}
    else{patrol.officers.forEach(o=>{o.goal.set(Infinity,Infinity,Infinity);o.path=[];o.yieldTo=null;o.yieldFor=null;o.repath=0;});this.navigation.reset();this.change(patrol,'boarding');}
   }
   // Keep the convoy parked until every officer has boarded, so moving
   // cars cannot cut across another unit's walk back to its door.
   if(patrol.phase==='driving'||patrol.phase==='returning'&&this.officers.every(o=>o.boarded))this.drive(patrol,dt);
   else if(patrol.phase==='exiting'){
    patrol.officers.forEach((o,i)=>{
     if(!o.boarded||patrol.age<.7+i*.4)return;
     const at={x:patrol.pos.x+(i?1.55:-1.55),y:.89,z:patrol.pos.z};
     o.body.setTranslation(at,true);o.body.setNextKinematicTranslation(at);o.planned.copy(at);
     o.collider.setEnabled(true);o.model.root.visible=true;o.boarded=false;o.path=[];o.action=null;o.yieldTo=null;o.yieldFor=null;o.goal.set(Infinity,Infinity,Infinity);
    });
    if(patrol.age>=1.5)this.change(patrol,'chasing');
   }else if(patrol.phase==='chasing'){
    for(const o of patrol.officers){
     const targets=[...this.wanted],i=targets[o.id%targets.length];if(i===undefined)continue;
     const p=this.players[i];p.getPosition(this.target);this.target.y-=.9;this.walk(o,this.target,dt);
     this.position.copy(o.body.translation());
     if(!o.action&&p.grounded&&this.position.distanceTo(p.body.translation())<1.15&&this.lineOfSight(this.position,p)){
      p.detain(new THREE.Vector3(102+3*i,.05,79));this.wanted.delete(i);this.exposure[i]=0;this.message(i,'Festgenommen – du wirst zur Wache gebracht.');
     }
    }
   }else if(patrol.phase==='boarding'){
    patrol.officers.forEach((o,i)=>{
     if(o.boarded)return;this.target.set(patrol.pos.x+(i?1.55:-1.55),0,patrol.pos.z);this.walk(o,this.target,dt);
     if(this.position.copy(o.body.translation()).distanceTo(this.target.clone().add(new THREE.Vector3(0,.88,0)))<1){o.boarded=true;o.collider.setEnabled(false);o.model.root.visible=false;}
    });
    if(patrol.officers.every(o=>o.boarded)){patrol.routeIndex=patrol.route.length-2;patrol.speed=0;this.change(patrol,'returning');}
   }
  }
  if(wasActive&&this.patrols.every(p=>p.phase==='idle')){this.cooldown=15;this.exposure.fill(0);this.navigation.reset();}
 }
 private drive(p:Patrol,dt:number){
  const destination=p.route[p.routeIndex],delta=destination.clone().sub(p.pos);delta.y=0;const distance=delta.length();
  if(distance<.15){
   if(p.phase==='driving'&&p.routeIndex===p.route.length-1){this.navigation.reset();this.change(p,'exiting');return;}
   if(p.phase==='returning'&&p.routeIndex===0){this.change(p,'idle');return;}
   p.routeIndex+=p.phase==='driving'?1:-1;return;
  }
  delta.divideScalar(distance);p.yaw=Math.atan2(delta.x,delta.z);p.speed=Math.min(10,p.speed+4*dt);
  const step=Math.min(distance,p.speed*dt),movement={x:delta.x*step,y:0,z:delta.z*step},q=new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP,p.yaw);
  const hit=this.physics.world.castShape({x:p.pos.x,y:.85,z:p.pos.z},q,movement,this.carShape,.02,1,true,undefined,POLICE_QUERY_GROUPS,p.collider,undefined,c=>c.isEnabled()&&!this.officers.some(o=>o.collider.handle===c.handle));
  const fraction=hit?Math.max(0,hit.time_of_impact-.01):1;p.pos.addScaledVector(delta,step*fraction);if(fraction<.1)p.speed=0;
  p.body.setNextKinematicTranslation({x:p.pos.x,y:.85,z:p.pos.z});p.body.setNextKinematicRotation(q);
 }
 private passingPlace(o:Officer,point:THREE.Vector3):THREE.Vector3|null {
  const at=new THREE.Vector3().copy(o.body.translation()),away=at.clone().sub(point).setY(0);
  if(away.lengthSq()<.01)away.set(1,0,0);else away.normalize();
  const side=new THREE.Vector3(-away.z,0,away.x);
  for(const direction of [side,side.clone().negate(),away,away.clone().negate()]){
   const candidate=at.clone().addScaledVector(direction,.95);
   if(candidate.distanceTo(point)>.9&&this.navigation.canWalk(at,candidate)&&!this.officers.some(other=>other!==o&&!other.boarded&&candidate.distanceTo(other.planned)<.7))return candidate;
  }
  return null;
 }
 private avoid(o:Officer,move:THREE.Vector3):THREE.Vector3 {
  const at=new THREE.Vector3().copy(o.body.translation()),next=at.clone().add(move);
  for(const other of this.officers){
   if(other===o||other.boarded||Math.abs(other.planned.y-at.y)>1.4)continue;
   const distance=next.distanceTo(other.planned);
   if(distance>=.66)continue;
   // Stable right of way: the later officer steps aside or backs out of a narrow aisle.
   if((o.id>other.id||other.action)&&!o.yieldTo){o.yieldTo=this.passingPlace(o,other.planned);if(other.action)o.yieldFor=other.id;}
   return new THREE.Vector3();
  }
  return move;
 }
 private walk(o:Officer,target:THREE.Vector3,dt:number){
  const at=new THREE.Vector3().copy(o.body.translation());o.repath-=dt;
  if(o.action){
   const a=o.action;a.age=Math.min(a.duration,a.age+dt);const desired=traversalPosition(a.from,a.to,a.mode,a.age/a.duration);
   const motion=this.avoid(o,desired.clone().sub(at));
   if(motion.lengthSq()<1e-9&&desired.distanceTo(at)>.005){
    a.age-=dt;
    if(o.yieldTo){o.action=null;o.path=[];o.goal.set(Infinity,Infinity,Infinity);}
    return;
   }
   if(!this.navigation.clearMotion(at,at.clone().add(motion))){o.action=null;o.path=[];o.goal.set(Infinity,Infinity,Infinity);return;}
   o.planned.copy(at).add(motion);o.body.setNextKinematicTranslation(o.planned);o.motion.copy(motion);
   this.pose(o,a.mode,a.age/a.duration);
   if(a.age>=a.duration){o.action=null;o.path.shift();}return;
  }
  if(!o.yieldTo&&o.repath<=0&&(o.goal.distanceTo(target)>1.5||!o.path.length&&(o.goal.distanceTo(target)>.2||at.distanceTo(o.planStart)>.8))){
   o.path=this.navigation.path(at.clone().add(new THREE.Vector3(0,-.85,0)),target);o.goal.copy(target);o.planStart.copy(at);o.repath=1.2;
  }
  // Follow a nearby runner continuously instead of stopping at their stale
  // last grid position; the swept capsule still checks walls and parked cars.
  const nearby=target.clone().add(new THREE.Vector3(0,.85,0));
  if(!o.yieldTo&&o.path.length>0&&o.path.every(p=>p.traversal==='walk')&&at.distanceTo(nearby)<16&&Math.abs(at.y-nearby.y)<.4&&this.navigation.canWalk(at,nearby)){
   o.path=[Object.assign(target.clone(),{traversal:'walk' as Traversal})];o.goal.copy(target);o.planStart.copy(at);
  }
  const speed=o.yieldTo?RUN_SPEED*.65:this.patrols[o.patrol].phase==='boarding'?RUN_SPEED:o.patrol===0?SPRINT_SPEED:POLICE_REINFORCEMENT_SPEED;
  // Do not spend a frame stopping at every metre of the walking grid. Only
  // look through collinear, level waypoints; corners and actions remain exact.
  while(!o.yieldTo&&o.path.length){
   const a=o.path[0],distance=Math.hypot(a.x-at.x,a.z-at.z);
   if(a.traversal!=='walk'||Math.abs(a.y+.85-at.y)>.35)break;
   if(distance<.04){o.path.shift();continue;}
   const b=o.path[1];
   if(distance>=speed*dt||!b||b.traversal!=='walk'||Math.abs(b.y-a.y)>.03)break;
   const bx=b.x-a.x,bz=b.z-a.z;
   if(((a.x-at.x)*bx+(a.z-at.z)*bz)/(distance*Math.hypot(bx,bz))<.999)break;
   o.path.shift();
  }
  const next=o.yieldTo?Object.assign(o.yieldTo.clone().add(new THREE.Vector3(0,-.85,0)),{traversal:'walk' as Traversal}):o.path[0];
  let dx=0,dz=0;
  if(next){
   const distance=Math.hypot(next.x-at.x,next.z-at.z);
   if(distance<.04&&Math.abs(next.y+.85-at.y)<.35){if(o.yieldTo){if(o.yieldFor===null||!this.officers[o.yieldFor]?.action){o.yieldTo=null;o.yieldFor=null;o.goal.set(Infinity,Infinity,Infinity);}}else o.path.shift();}
   else if(next.traversal&&next.traversal!=='walk'){
    const landing=next.clone().add(new THREE.Vector3(0,.86,0));
    // Reserve the landing and crossing before leaving the ground. An officer
    // already jumping/climbing has priority over someone waiting on a ledge.
    const samples=Array.from({length:11},(_,i)=>traversalPosition(at,landing,next.traversal!,i/10));
    const occupied=this.officers.find(other=>{
     if(other===o||other.boarded)return false;
     if(samples.some(p=>p.distanceTo(other.planned)<.8))return true;
     if(other.action){const a=other.action;for(let i=0;i<=10;i++)if(samples.some(p=>p.distanceTo(traversalPosition(a.from,a.to,a.mode,i/10))<.8))return true;}
     return false;
    });
    if(occupied){
     if(o.id<occupied.id&&!occupied.action){occupied.yieldTo??=this.passingPlace(occupied,landing);occupied.yieldFor=o.id;}
     else{o.yieldTo??=this.passingPlace(o,occupied.action?.to??occupied.planned);o.yieldFor=occupied.id;}
     return;
    }
    o.action={from:at,to:landing,mode:next.traversal,age:0,duration:next.traversal==='climb'?1.05:next.traversal==='drop'?.4+Math.sqrt(Math.abs(landing.y-at.y)/10):.65};
    o.model.root.rotation.y=Math.atan2(next.x-at.x,next.z-at.z);return;
   }else if(distance){const step=Math.min(distance,speed*dt);dx=(next.x-at.x)/distance*step;dz=(next.z-at.z)/distance*step;}
  }
  const dy=next&&next.y+.85>at.y+.03?Math.min(.08,next.y+.85-at.y):-.08;
  const desired=this.avoid(o,new THREE.Vector3(dx,0,dz));desired.y=dy;
  o.controller.computeColliderMovement(o.collider,desired,undefined,POLICE_QUERY_GROUPS,this.navigation.obstacle);
  const m=o.controller.computedMovement();o.planned.copy(at).add(m);o.body.setNextKinematicTranslation(o.planned);o.motion.copy(m);
  const travelled=Math.hypot(m.x,m.z);o.stride+=travelled*1.65;
  if(travelled>.001)o.model.root.rotation.y=Math.atan2(m.x,m.z);
  o.stuck=next&&Math.hypot(dx,dz)>.01&&travelled<.002?o.stuck+dt:0;
  if(o.stuck>1.5){o.goal.set(Infinity,Infinity,Infinity);o.path=[];o.yieldTo=null;o.yieldFor=null;o.repath=0;o.stuck=0;this.navigation.reset();}
  this.pose(o,travelled/dt>RUN_SPEED+.25?'run':travelled>.001?'walk':'idle',0);
 }
 private pose(o:Officer,mode:Traversal|'idle'|'run',t:number){
  o.model.joints.forEach((joint,i)=>{joint.rotation.x=i%2===0?(mode==='walk'||mode==='run'?Math.max(0,Math.sin(o.stride+(i===0?0:Math.PI)))*(mode==='run'?1.15:.8):mode==='idle'?.06:1.05):(mode==='run'?-.95:mode==='walk'?-.65:mode==='climb'?-.45:-.25);});
  o.model.limbs.forEach((limb,i)=>{
   const arm=i===1||i===3;
   limb.rotation.x=mode==='climb'?(arm?-2.4+Math.sin(t*Math.PI)*.5:.55):mode==='jump'||mode==='drop'?(arm?-1.1:.65):mode==='walk'||mode==='run'?Math.sin(o.stride+(i===0||i===3?0:Math.PI))*(mode==='run'?.8:.55):0;
  });
 }
 update(dt:number){
  for(const p of this.patrols){
   p.car.root.position.copy(p.pos);p.car.root.rotation.y=p.yaw;
   p.car.wheels.forEach(w=>w.rotation.x+=(p.phase==='driving'||p.phase==='returning'?p.speed*dt/.36:0));
   const open=p.phase==='exiting'||p.phase==='boarding';p.doorAngle=THREE.MathUtils.lerp(p.doorAngle,open?1.1:0,1-Math.exp(-8*dt));
   p.car.doors.forEach((door,i)=>door.rotation.y=(i?1:-1)*p.doorAngle);
   p.car.lights.forEach((light,i)=>(light.material as THREE.MeshStandardMaterial).emissiveIntensity=p.phase!=='idle'&&(Math.floor(this.time*7)+i)%2===0?4:.1);
  }
  this.officers.forEach(o=>{o.model.root.position.copy(o.body.translation());o.model.root.position.y-=.85;});
  const seconds=Math.floor(this.pursuitTime),clock=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
  this.players.forEach((p,i)=>{
   let text=this.noticeTime[i]>0?this.notice[i]:'';
   if(p.isDetained)text='Festgenommen – Rückkehr zur Polizeiwache …';
   else if(this.wanted.has(i))text=`${this.phase==='driving'||this.phase==='exiting'?'Polizeistreife unterwegs!':'Polizei verfolgt dich – Einsatz bleibt aktiv!'}\nVerfolgung ${clock} · ${this.pursuingCount} Polizisten${this.pursuingCount<MAX_PATROLS*2?' · Verstärkung in '+Math.ceil(Math.max(0,this.nextReinforcement-this.pursuitTime))+' s':''}`;
   else if(this.phase==='idle'&&this.exposure[i]>0)text=`Lost Place: ${Math.ceil(Math.max(0,POLICE_DELAY-this.exposure[i]))} s bis zum Polizeialarm`;
   this.labels[i].textContent=text;this.labels[i].style.display=text?'block':'none';
  });
 }
}
