import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type {PhysicsWorld} from '../physics/PhysicsWorld';
import type {LevelLoader} from '../level/LevelLoader';
import type {PlayerController} from '../player/PlayerController';
import {PoliceNavigation} from './PoliceNavigation';
import {buildStation,buildPatrolCar,buildOfficer} from './PoliceModels';

export const POLICE_DELAY=90;
export const POLICE_ESCAPE_DISTANCE=45;
const ROUTE=[new THREE.Vector3(112,0,77),new THREE.Vector3(117,0,70),new THREE.Vector3(118,0,52),new THREE.Vector3(118,0,27.65)];
type Phase='idle'|'driving'|'exiting'|'chasing'|'boarding'|'returning';
interface Officer {
 model:ReturnType<typeof buildOfficer>;body:RAPIER.RigidBody;collider:RAPIER.Collider;controller:RAPIER.KinematicCharacterController;
 path:THREE.Vector3[];goal:THREE.Vector3;repath:number;stride:number;boarded:boolean;
}
/** One shared patrol, independent exposure/escape/arrest state for both players. */
export class PoliceSystem {
 phase:Phase='idle';
 readonly exposure:number[];
 readonly wanted=new Set<number>();
 private resolved=new Set<number>();
 readonly officers:Officer[]=[];
 readonly car=buildPatrolCar();
 readonly navigation:PoliceNavigation;
 private carBody:RAPIER.RigidBody;
 private carCollider:RAPIER.Collider;
 private carShape=new RAPIER.Cuboid(.92,.64,2.18);
 private routeIndex=1;
 private time=0;
 private phaseTime=0;
 private cooldown=0;
 private escape:number[];
 private unseen:number[];
 private notice:string[];
 private noticeTime:number[];
 private labels:HTMLDivElement[]=[];
 private carPos=ROUTE[0].clone();
 private carYaw=Math.PI;
 private carSpeed=0;
 private doorAngle=0;
 private target=new THREE.Vector3();
 private position=new THREE.Vector3();
 constructor(private physics:PhysicsWorld,level:LevelLoader,scene:THREE.Scene,private players:PlayerController[],hudRoots:HTMLElement[]){
  scene.add(buildStation(level),this.car.root);
  this.exposure=players.map(()=>0);this.escape=players.map(()=>0);this.unseen=players.map(()=>0);this.notice=players.map(()=>'');this.noticeTime=players.map(()=>0);
  this.carBody=physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(112,.85,77));
  this.carCollider=physics.world.createCollider(RAPIER.ColliderDesc.cuboid(.92,.64,2.18),this.carBody);
  this.navigation=new PoliceNavigation(physics,this.carCollider);
  for(let i=0;i<2;i++){
   const model=buildOfficer(i);model.root.visible=false;scene.add(model.root);
   const body=physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(112,.88,77));
   const collider=physics.world.createCollider(RAPIER.ColliderDesc.capsule(.55,.28),body);collider.setEnabled(false);
   const controller=physics.world.createCharacterController(.02);controller.enableAutostep(.5,.2,true);controller.enableSnapToGround(.3);
   this.officers.push({model,body,collider,controller,path:[],goal:new THREE.Vector3(Infinity,Infinity,Infinity),repath:0,stride:0,boarded:true});
  }
  hudRoots.forEach(root=>{const label=document.createElement('div');label.style.cssText='position:absolute;left:12px;top:116px;max-width:calc(100% - 24px);padding:7px 10px;border-radius:5px;background:#102333dd;color:#eaf3ff;font:600 13px sans-serif;display:none;';root.appendChild(label);this.labels.push(label);});
  this.update(0);
 }
 private inside(p:PlayerController):boolean {const t=p.body.translation();return t.x>126&&t.x<270&&t.z> -60&&t.z<65&&t.y> -8&&t.y<45;}
 private change(phase:Phase){this.phase=phase;this.phaseTime=0;}
 private message(i:number,text:string){this.notice[i]=text;this.noticeTime[i]=5;}
 private lineOfSight(from:THREE.Vector3,p:PlayerController):boolean {
  const at=p.body.translation(),delta=new THREE.Vector3(at.x-from.x,at.y-from.y,at.z-from.z),length=delta.length();
  if(length<.01)return true;
  delta.divideScalar(length);
  return !this.physics.world.castRay(new RAPIER.Ray(from,delta),Math.max(0,length-.4),true,RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC|RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC);
 }
 fixedUpdate(dt:number):void {
  this.time+=dt;this.phaseTime+=dt;this.cooldown=Math.max(0,this.cooldown-dt);
  this.noticeTime=this.noticeTime.map(t=>Math.max(0,t-dt));
  if(this.phase==='idle'){
   this.players.forEach((p,i)=>{this.exposure[i]=this.inside(p)&&!p.isDetained&&this.cooldown===0?this.exposure[i]+dt:0;});
   if(this.exposure.some(t=>t>=POLICE_DELAY)){
    this.players.forEach((p,i)=>{if(this.inside(p))this.wanted.add(i);});
    this.routeIndex=1;this.carSpeed=0;this.change('driving');
   }
  }else if(this.phase==='driving'||this.phase==='returning')this.drive(dt);
  else if(this.phase==='exiting'){
   if(this.phaseTime>=.7)this.officers.forEach((officer,i)=>{
    if(!officer.boarded)return;
    const x=this.carPos.x+(i?1.55:-1.55),z=this.carPos.z;
    officer.body.setTranslation({x,y:.89,z},true);officer.body.setNextKinematicTranslation({x,y:.89,z});
    officer.collider.setEnabled(true);officer.model.root.visible=true;officer.boarded=false;
   });
   if(this.phaseTime>=1.5)this.change('chasing');
  }else if(this.phase==='chasing'){
   this.players.forEach((p,i)=>{if(this.inside(p)&&!p.isDetained&&!this.resolved.has(i))this.wanted.add(i);});
   for(const i of [...this.wanted]){
    const p=this.players[i];let distance=Infinity,visible=false;
    for(const officer of this.officers){this.position.copy(officer.body.translation());distance=Math.min(distance,this.position.distanceTo(p.body.translation()));visible ||= this.lineOfSight(this.position,p);}
    this.escape[i]=distance>POLICE_ESCAPE_DISTANCE?this.escape[i]+dt:0;this.unseen[i]=visible?0:this.unseen[i]+dt;
    if(p.isDetained||this.escape[i]>=6||this.unseen[i]>=25){this.wanted.delete(i);this.resolved.add(i);this.exposure[i]=0;if(!p.isDetained)this.message(i,'Entkommen – die Suche nach dir ist beendet.');}
   }
   this.officers.forEach((officer,index)=>{
    const targets=[...this.wanted].sort((a,b)=>a-b);
    // Split the patrol when both players are wanted, rather than ignoring P2.
    const i=targets.length>1?targets[index%targets.length]:targets[0];if(i===undefined)return;
    const p=this.players[i];p.getPosition(this.target);this.target.y-=.9;this.walk(officer,this.target,dt);
    this.position.copy(officer.body.translation());
    if(p.grounded&&this.position.distanceTo(p.body.translation())<1.15&&this.lineOfSight(this.position,p)){
      p.detain(new THREE.Vector3(102+3*i,.05,79));this.wanted.delete(i);this.resolved.add(i);this.exposure[i]=0;this.message(i,'Festgenommen – du wirst zur Wache gebracht.');
    }
   });
   if(!this.wanted.size){this.officers.forEach(o=>o.goal.set(Infinity,Infinity,Infinity));this.change('boarding');}
  }else if(this.phase==='boarding'){
   this.officers.forEach((officer,i)=>{
    if(officer.boarded)return;this.target.set(this.carPos.x+(i?1.55:-1.55),0,this.carPos.z);this.walk(officer,this.target,dt);
    if(this.position.copy(officer.body.translation()).distanceTo(this.target.clone().add(new THREE.Vector3(0,.88,0)))<1){officer.boarded=true;officer.collider.setEnabled(false);officer.model.root.visible=false;}
   });
   if(this.officers.every(o=>o.boarded)){this.routeIndex=ROUTE.length-2;this.carSpeed=0;this.change('returning');}
  }
 }
 private drive(dt:number){
  const destination=ROUTE[this.routeIndex],delta=destination.clone().sub(this.carPos);delta.y=0;
  const distance=delta.length();
  if(distance<.15){
   if(this.phase==='driving'&&this.routeIndex===ROUTE.length-1){this.navigation.reset();this.change('exiting');return;}
   if(this.phase==='returning'&&this.routeIndex===0){this.cooldown=15;this.resolved.clear();this.exposure.fill(0);this.escape.fill(0);this.unseen.fill(0);this.change('idle');return;}
   this.routeIndex+=this.phase==='driving'?1:-1;return;
  }
  delta.divideScalar(distance);const targetYaw=Math.atan2(delta.x,delta.z);
  this.carYaw+=THREE.MathUtils.euclideanModulo(targetYaw-this.carYaw+Math.PI,Math.PI*2)-Math.PI;
  this.carSpeed=Math.min(10,this.carSpeed+4*dt);
  const step=Math.min(distance,this.carSpeed*dt),movement={x:delta.x*step,y:0,z:delta.z*step};
  const q=new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP,this.carYaw);
  const hit=this.physics.world.castShape({x:this.carPos.x,y:.85,z:this.carPos.z},q,movement,this.carShape,.02,1,true,undefined,undefined,this.carCollider,undefined,c=>c.isEnabled()&&!this.officers.some(o=>o.collider.handle===c.handle));
  const fraction=hit?Math.max(0,hit.time_of_impact-.01):1;
  this.carPos.addScaledVector(delta,step*fraction);if(fraction<.1)this.carSpeed=0;
  this.carBody.setNextKinematicTranslation({x:this.carPos.x,y:.85,z:this.carPos.z});this.carBody.setNextKinematicRotation(q);
 }
 private walk(officer:Officer,target:THREE.Vector3,dt:number){
  officer.repath-=dt;
  if(officer.repath<=0&&(officer.goal.distanceTo(target)>1.5||officer.path.length===0&&officer.goal.distanceTo(target)>.2)){
   officer.path=this.navigation.path(new THREE.Vector3().copy(officer.body.translation()).add(new THREE.Vector3(0,-.88,0)),target);officer.goal.copy(target);officer.repath=1.2;
  }
  const at=officer.body.translation(),next=officer.path[0];let dx=0,dz=0;
  if(next){const distance=Math.hypot(next.x-at.x,next.z-at.z);if(distance<.025)officer.path.shift();else{const step=Math.min(distance,4.7*dt);dx=(next.x-at.x)/distance*step;dz=(next.z-at.z)/distance*step;officer.model.root.rotation.y=Math.atan2(dx,dz);}}
  // Follow the swept navigation floor up small steps; a constant downward
  // velocity otherwise wedges the capsule against thin fallen fence panels.
  const dy=next&&next.y+.85>at.y+.03?Math.min(.08,next.y+.85-at.y):-.08;
  officer.controller.computeColliderMovement(officer.collider,{x:dx,y:dy,z:dz},undefined,undefined,c=>c.isEnabled()&&(c.handle===this.carCollider.handle||!c.parent()||c.parent()!.isFixed()));
  const m=officer.controller.computedMovement();officer.body.setNextKinematicTranslation({x:at.x+m.x,y:at.y+m.y,z:at.z+m.z});officer.stride+=Math.hypot(m.x,m.z)*6;
  officer.model.limbs.forEach((limb,i)=>{limb.rotation.x=next?Math.sin(officer.stride+(i===0||i===3?0:Math.PI))*.55:0;});
 }
 update(dt:number){
  this.car.root.position.copy(this.carPos);this.car.root.rotation.y=this.carYaw;
  const open=this.phase==='exiting'||this.phase==='boarding';this.doorAngle=THREE.MathUtils.lerp(this.doorAngle,open?1.1:0,1-Math.exp(-8*dt));
  this.car.doors.forEach((door,i)=>door.rotation.y=(i?1:-1)*this.doorAngle);
  this.car.lights.forEach((light,i)=>(light.material as THREE.MeshStandardMaterial).emissiveIntensity=this.phase!=='idle'&&(Math.floor(this.time*7)+i)%2===0?4:.1);
  this.officers.forEach(o=>{o.model.root.position.copy(o.body.translation());o.model.root.position.y-=.88;});
  this.players.forEach((p,i)=>{
   let text=this.noticeTime[i]>0?this.notice[i]:'';
   if(p.isDetained)text='Festgenommen – Rückkehr zur Polizeiwache …';
   else if(this.wanted.has(i))text=this.phase==='driving'||this.phase==='exiting'?'Polizeistreife unterwegs!':'Polizei verfolgt dich – gewinne Abstand!';
   else if(this.phase==='idle'&&this.exposure[i]>0)text=`Lost Place: ${Math.ceil(Math.max(0,POLICE_DELAY-this.exposure[i]))} s bis zum Polizeialarm`;
   this.labels[i].textContent=text;this.labels[i].style.display=text?'block':'none';
  });
 }
}
