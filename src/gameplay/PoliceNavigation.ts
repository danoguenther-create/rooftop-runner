import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../physics/PhysicsWorld';

interface Node { key:string; x:number; y:number; z:number }
const STATIC=RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC|RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC;
const ROT={x:0,y:0,z:0,w:1};
/** Lazy walking grid. A capsule sweep prevents corner cutting and wall shortcuts. */
export class PoliceNavigation {
  private cache=new Map<string,Node|null>();
  private edges=new Map<string,boolean>();
  private capsule=new RAPIER.Capsule(.55,.28);
  constructor(private physics:PhysicsWorld,private car:RAPIER.Collider){}
  reset():void {this.cache.clear();this.edges.clear();}
  private obstacle=(c:RAPIER.Collider)=>c.isEnabled()&&(c.handle===this.car.handle||!c.parent()||c.parent()!.isFixed());
  private node(x:number,z:number):Node|null {
    const key=`${x}/${z}`;
    if(this.cache.has(key))return this.cache.get(key)!;
    if(x<88||x>286||z< -76||z>102)return null;
    const wx=x+.5,wz=z+.65;
    const hit=this.physics.world.castRay(new RAPIER.Ray({x:wx,y:1.95,z:wz},{x:0,y:-1,z:0}),10,true,STATIC);
    let node:Node|null=null;
    if(hit){
      const y=1.95-hit.timeOfImpact;
      if(!this.physics.world.intersectionWithShape({x:wx,y:y+.88,z:wz},ROT,this.capsule,undefined,undefined,undefined,undefined,this.obstacle))node={key,x:wx,y,z:wz};
    }
    this.cache.set(key,node);return node;
  }
  private nearest(p:THREE.Vector3):Node|null {
    let best:Node|null=null,score=Infinity;
    for(let r=0;r<=4;r++)for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++){
      if(Math.max(Math.abs(dx),Math.abs(dz))!==r)continue;
      const n=this.node(Math.round(p.x-.5)+dx,Math.round(p.z-.65)+dz);
      if(n){const d=Math.hypot(n.x-p.x,n.z-p.z)+Math.abs(n.y-p.y)*.3;if(d<score){score=d;best=n;}}
    }
    return best;
  }
  private clear(a:Node,b:Node):boolean {
    if(Math.abs(a.y-b.y)>.5)return false;
    const key=[a.key,b.key].sort().join(':');if(this.edges.has(key))return this.edges.get(key)!;
    const y=Math.max(a.y,b.y)+.89;
    const clear=!this.physics.world.castShape({x:a.x,y,z:a.z},ROT,{x:b.x-a.x,y:0,z:b.z-a.z},this.capsule,0,1,true,undefined,undefined,undefined,undefined,this.obstacle);
    this.edges.set(key,clear);return clear;
  }
  path(from:THREE.Vector3,to:THREE.Vector3):THREE.Vector3[] {
    const start=this.nearest(from),goal=this.nearest(to);if(!start||!goal)return[];
    const heap:{node:Node;cost:number;rank:number}[]=[];
    const push=(entry:typeof heap[number])=>{heap.push(entry);let i=heap.length-1;while(i>0){const p=(i-1)>>1;if(heap[p].rank<=entry.rank)break;heap[i]=heap[p];i=p;}heap[i]=entry;};
    const pop=()=>{const first=heap[0],last=heap.pop()!;if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1].rank<heap[c].rank)c++;if(last.rank<=heap[c].rank)break;heap[i]=heap[c];i=c;}heap[i]=last;}return first;};
    const h=(n:Node)=>Math.hypot(n.x-goal.x,n.z-goal.z);
    const costs=new Map([[start.key,0]]),parent=new Map<string,Node>();
    let best=start;push({node:start,cost:0,rank:h(start)});
    for(let visits=0;heap.length&&visits<6000;visits++){
      const {node:a,cost}=pop();if(cost!==costs.get(a.key))continue;
      if(h(a)<h(best))best=a;if(a.key===goal.key){best=a;break;}
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
        const b=this.node(Math.round(a.x-.5)+dx,Math.round(a.z-.65)+dz);if(!b||!this.clear(a,b))continue;
        const next=cost+Math.hypot(dx,dz)+Math.abs(a.y-b.y);
        if(next>=(costs.get(b.key)??Infinity))continue;
        costs.set(b.key,next);parent.set(b.key,a);push({node:b,cost:next,rank:next+h(b)});
      }
    }
    const result:THREE.Vector3[]=[];
    for(let n=best;n.key!==start.key;){result.push(new THREE.Vector3(n.x,n.y,n.z));const prev=parent.get(n.key);if(!prev)break;n=prev;}
    result.push(new THREE.Vector3(start.x,start.y,start.z));
    return result.reverse();
  }
}
