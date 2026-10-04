import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type {PhysicsWorld} from '../physics/PhysicsWorld';

export type Traversal='walk'|'climb'|'jump'|'drop';
export type PoliceWaypoint=THREE.Vector3 & {traversal?:Traversal};
interface Node {key:string;x:number;y:number;z:number}
interface Search { goal:Node; heap:{node:Node;cost:number;rank:number}[]; costs:Map<string,number>; next:Map<string,{node:Node;mode:Traversal}>; settled:Set<string>; anchor:Node }
interface Floor {x:number;y:number;z:number;hx:number;hz:number;c:number;s:number}
// Explicit groups also exclude stale/overlapping NPC shapes in Rapier KCC queries.
export const POLICE_QUERY_GROUPS=0x0001fffb;
export const OFFICER_COLLISION_GROUPS=0x0004ffff;
const ROT={x:0,y:0,z:0,w:1};
const NEIGHBORS = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
for(let d=2;d<=6;d++)NEIGHBORS.push([d,0],[-d,0],[0,d],[0,-d]);
for(let d=2;d<=4;d++)NEIGHBORS.push([d,d],[d,-d],[-d,d],[-d,-d]);
export function traversalPosition(from:THREE.Vector3,to:THREE.Vector3,mode:Traversal,t:number):THREE.Vector3 {
 const p=from.clone();
 if(mode==='climb'){
  const high=Math.max(from.y,to.y)+.12;
  if(t<.4)p.y=THREE.MathUtils.lerp(from.y,high,t/.4);
  else if(t<.85){p.lerp(to,(t-.4)/.45);p.y=high;}
  else{p.copy(to);p.y=THREE.MathUtils.lerp(high,to.y,(t-.85)/.15);}
 }else if(mode==='drop'){
  if(t<.45){p.lerp(to,t/.45);p.y=from.y+Math.sin(t/.45*Math.PI)*.2;}
  else{p.copy(to);p.y=THREE.MathUtils.lerp(from.y,to.y,((t-.45)/.55)**2);}
 }else{p.lerp(to,t);p.y+=Math.sin(t*Math.PI)*.85;}
 return p;
}
/** Layered floor graph: stairs, reachable ledges and short gaps, with swept capsules. */
export class PoliceNavigation {
 private columns=new Map<string,Node[]>();
 private floors=new Map<string,Floor[]>();
 private edges=new Map<string,Traversal|null>();
 private searches=new Map<string,Search>();
 private deadline:number|undefined;
 beginFrame():void {this.deadline=performance.now()+5;}
 endFrame():void {this.deadline=undefined;}
 private capsule=new RAPIER.Capsule(.55,.28);
 constructor(private physics:PhysicsWorld,private cars:()=>RAPIER.Collider[]){this.indexFloors();}
 obstacle=(c:RAPIER.Collider)=>c.isEnabled()&&(!c.parent()||c.parent()!.isFixed()||this.cars().some(car=>car.handle===c.handle));
 reset():void {this.columns.clear();this.edges.clear();this.searches.clear();}
 /** Rebuild only when static level geometry changes, never once per officer. */
 indexFloors():void {
  this.floors.clear();this.reset();
  this.physics.world.forEachCollider(c=>{
   if(!c.parent()?.isFixed()||c.shape.type!==RAPIER.ShapeType.Cuboid)return;
   const h=c.halfExtents(),r=c.rotation(),p=c.translation();if(!h||h.x<.12||h.z<.12||Math.abs(r.x)+Math.abs(r.z)>.01)return;
   const yaw=2*Math.atan2(r.y,r.w),co=Math.cos(yaw),si=Math.sin(yaw);
   const floor={x:p.x,y:p.y+h.y,z:p.z,hx:h.x,hz:h.z,c:co,s:si};
   if(floor.y< -9||floor.y>42)return;
   const ex=Math.abs(co)*h.x+Math.abs(si)*h.z,ez=Math.abs(si)*h.x+Math.abs(co)*h.z;
   for(let x=Math.max(-35,Math.floor((p.x-ex)/4));x<=Math.min(72,Math.floor((p.x+ex)/4));x++)
    for(let z=Math.max(-28,Math.floor((p.z-ez)/4));z<=Math.min(30,Math.floor((p.z+ez)/4));z++){
     const key=`${x}/${z}`,list=this.floors.get(key)??[];list.push(floor);this.floors.set(key,list);
    }
  });
 }
 private nodes(x:number,z:number):Node[]{
  const key=`${x}/${z}`;if(this.columns.has(key))return this.columns.get(key)!;
  if(x< -138||x>286||z< -110||z>118)return[];
  // Align the narrow west-fence aisle and breach with actual grid centres.
  const wx=x+.5,wz=z+.65,result:Node[]=[];
  for(const f of this.floors.get(`${Math.floor(wx/4)}/${Math.floor(wz/4)}`)??[]){
   const dx=wx-f.x,dz=wz-f.z;
   if(Math.abs(dx*f.c-dz*f.s)>f.hx||Math.abs(dx*f.s+dz*f.c)>f.hz||result.some(n=>Math.abs(n.y-f.y)<.08))continue;
   // The rounded capsule rests slightly above short treads next to a riser.
   for(const lift of [0,.08,.16,.24]){
    const y=f.y+lift;
    if(!this.physics.world.intersectionWithShape({x:wx,y:y+.86,z:wz},ROT,this.capsule,undefined,POLICE_QUERY_GROUPS,undefined,undefined,this.obstacle)){
     result.push({key:`${key}/${Math.round(y*100)}`,x:wx,y,z:wz});break;
    }
   }
  }
  this.columns.set(key,result);return result;
 }
 private nearest(p:THREE.Vector3):Node|null {
  let best:Node|null=null,score=Infinity;
  for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++)for(const n of this.nodes(Math.round(p.x-.5)+dx,Math.round(p.z-.65)+dz)){
   const d=Math.hypot(n.x-p.x,n.z-p.z)+Math.abs(n.y-p.y)*3;
   if(d<score){score=d;best=n;}
  }
  return best;
 }
 clearMotion(a:THREE.Vector3,b:THREE.Vector3):boolean {
  return !this.physics.world.castShape(a,ROT,b.clone().sub(a),this.capsule,.005,1,true,undefined,POLICE_QUERY_GROUPS,undefined,undefined,this.obstacle);
 }
 canWalk(a:THREE.Vector3,b:THREE.Vector3):boolean {
  const floor=this.nearest(b.clone().add(new THREE.Vector3(0,-.85,0)));
  if(!floor||Math.abs(floor.y+.85-b.y)>=.45||!this.clearMotion(a,b))return false;
  // A clear capsule sweep alone also accepts empty air over a gap.
  const samples=Math.max(1,Math.ceil(a.distanceTo(b)/.4));
  for(let i=0;i<=samples;i++){
   const p=a.clone().lerp(b,i/samples);p.y-=.5;
   if(!this.physics.world.castRay(new RAPIER.Ray(p,{x:0,y:-1,z:0}),.7,true,RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC|RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC))return false;
  }
  return true;
 }
 private edge(a:Node,b:Node,gap:boolean):Traversal|null {
  const key=`${a.key}>${b.key}`;if(this.edges.has(key))return this.edges.get(key)!;
  const rise=b.y-a.y;let mode:Traversal|null=null;
  if(rise<=3.5&&rise>=-3.5){
   const from=new THREE.Vector3(a.x,a.y+.86,a.z),to=new THREE.Vector3(b.x,b.y+.86,b.z);
   if(!gap&&Math.abs(rise)<=.5){
    const high=Math.max(from.y,to.y)+.03;
    if(this.clearMotion(from.clone().setY(high),to.clone().setY(high)))mode='walk';
   }else{
    const kind:Traversal=rise>.5?'climb':rise<-.5?'drop':'jump';
    let prev=from,clear=true;
    for(let i=1;i<=12;i++){const next=traversalPosition(from,to,kind,i/12);if(!this.clearMotion(prev,next)){clear=false;break;}prev=next;}
    if(clear)mode=kind;
   }
  }
  this.edges.set(key,mode);return mode;
 }
 path(from:THREE.Vector3,to:THREE.Vector3):PoliceWaypoint[]{
  const start=this.nearest(from),requestedGoal=this.nearest(to);if(!start||!requestedGoal)return[];
  let goal=requestedGoal;
  // Keep planning toward the same roof/room while its player moves around.
  // Reuse only when a supported, unobstructed walk connects the two goal points.
  if(!this.searches.has(goal.key))for(const candidate of this.searches.values()){
   const a=candidate.goal;
   if(Math.abs(a.y-goal.y)<.3&&Math.hypot(a.x-goal.x,a.z-goal.z)<40&&this.canWalk(new THREE.Vector3(a.x,a.y+.86,a.z),new THREE.Vector3(goal.x,goal.y+.86,goal.z))){goal=a;break;}
  }
  // Search backwards from the target's floor: this discovers its window,
  // staircase or roof approach before exploring the much larger street network.
  // Preserve unfinished searches so a long detour is never discarded at a budget limit.
  let search=this.searches.get(goal.key);
  if(!search){
   if(this.searches.size>=4)this.searches.delete(this.searches.keys().next().value!);
   search={goal,anchor:start,heap:[{node:goal,cost:0,rank:0}],costs:new Map([[goal.key,0]]),next:new Map(),settled:new Set()};
   this.searches.set(goal.key,search);
  }
  const {heap,costs,next,settled,anchor}=search;
  const push=(v:typeof heap[number])=>{heap.push(v);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p].rank<=v.rank)break;heap[i]=heap[p];i=p;}heap[i]=v;};
  const pop=()=>{const first=heap[0],last=heap.pop()!;if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1].rank<heap[c].rank)c++;if(last.rank<=heap[c].rank)break;heap[i]=heap[c];i=c;}heap[i]=last;}return first;};
  const h=(n:Node)=>Math.hypot(n.x-anchor.x,n.z-anchor.z)+Math.abs(n.y-anchor.y);
  const deadline=this.deadline??performance.now()+5;
  for(let visits=0;!settled.has(start.key)&&heap.length&&visits<2500;visits++){
   if(visits%16===0&&performance.now()>=deadline)break;
   const {node:a,cost}=pop();if(cost!==costs.get(a.key)||settled.has(a.key))continue;
   settled.add(a.key);
   for(const [dx,dz] of NEIGHBORS){
    const gap=Math.max(Math.abs(dx),Math.abs(dz))>1;
    for(const b of this.nodes(Math.round(a.x-.5)+dx,Math.round(a.z-.65)+dz)){
     if(settled.has(b.key))continue;
     if(gap&&this.nodes(Math.round(a.x-.5)+Math.sign(dx),Math.round(a.z-.65)+Math.sign(dz)).some(n=>Math.abs(n.y-b.y)<.3&&Math.abs(n.y-a.y)<.3))continue;
     const mode=this.edge(b,a,gap);if(!mode)continue;
     const costToGoal=cost+Math.hypot(dx,dz)+Math.abs(a.y-b.y)*1.5+(mode==='walk'?0:1.5);
     if(costToGoal>=(costs.get(b.key)??Infinity))continue;
     costs.set(b.key,costToGoal);next.set(b.key,{node:a,mode});push({node:b,cost:costToGoal,rank:costToGoal+h(b)});
    }
   }
  }
  if(!settled.has(start.key))return[];
  const result:PoliceWaypoint[]=[Object.assign(new THREE.Vector3(start.x,start.y,start.z),{traversal:'walk' as Traversal})];
  for(let n=start;n.key!==goal.key;){const step=next.get(n.key);if(!step)return[];n=step.node;result.push(Object.assign(new THREE.Vector3(n.x,n.y,n.z),{traversal:step.mode}));}
  if(goal.key!==requestedGoal.key)result.push(Object.assign(new THREE.Vector3(requestedGoal.x,requestedGoal.y,requestedGoal.z),{traversal:'walk' as Traversal}));
  return result;
 }
}
