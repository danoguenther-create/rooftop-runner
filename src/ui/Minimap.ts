import type {LevelLoader} from '../level/LevelLoader';
import type {PlayerController} from '../player/PlayerController';
import type {PoliceSystem} from '../gameplay/PoliceSystem';

const RANGE=60, SIZE=240;
const BOUNDS={x:-140,z:-112,w:430,h:280};
/** North-up local map; each viewport has its own centre and police proximity. */
export class Minimap {
 readonly element=document.createElement('div');
 readonly canvas=document.createElement('canvas');
 private label=document.createElement('div');
 private elapsed=1;
 private staticMap:HTMLCanvasElement;
 constructor(private index:number,private players:PlayerController[],level:LevelLoader,private police:PoliceSystem|undefined,root:HTMLElement,base?:HTMLCanvasElement){
  this.staticMap=base??Minimap.bake(level);
  this.element.className='hud-minimap';this.element.dataset.player=String(index+1);
  this.element.style.cssText='position:absolute;left:12px;bottom:66px;width:clamp(112px,28%,176px);padding:7px;border:1px solid #8196a566;border-radius:10px;background:#101d28ed;color:#f3f8ff;font:11px/1.4 system-ui;pointer-events:none;box-sizing:border-box';
  const title=document.createElement('div');title.textContent=`P${index+1} · UMGEBUNG`;
  title.style.cssText='font-weight:700;letter-spacing:1px;margin-bottom:3px';
  this.canvas.width=this.canvas.height=SIZE;this.canvas.style.cssText='display:block;width:100%;aspect-ratio:1;border-radius:50%';
  this.canvas.setAttribute('role','img');this.label.style.cssText='margin-top:4px;min-height:2.8em';
  const legend=document.createElement('div');legend.style.cssText='font-size:10px;margin-top:3px';
  legend.innerHTML='<span style="color:#ff9292">● Polizei</span> · <span style="color:#74aaff">■ Wagen</span>';
  this.element.append(title,this.canvas,this.label,legend);root.appendChild(this.element);this.update(1);
 }
 get background():HTMLCanvasElement{return this.staticMap;}
 private static bake(level:LevelLoader):HTMLCanvasElement{
  const map=document.createElement('canvas');map.width=1720;map.height=1120;
  const c=map.getContext('2d')!;const scale=map.width/BOUNDS.w;
  c.scale(scale,scale);c.translate(-BOUNDS.x,-BOUNDS.z);
  c.fillStyle='#253c3e';c.fillRect(BOUNDS.x,BOUNDS.z,BOUNDS.w,BOUNDS.h);
  c.fillStyle='#1a4b62';c.fillRect(BOUNDS.x,154,BOUNDS.w,100);
  c.fillStyle='#7b7962';c.fillRect(-104,120,224,34);
  c.fillStyle='#384c50';c.fillRect(-115,-90,250,170);
  for(const f of [...level.topFaces].sort((a,b)=>a.y-b.y)){
   if(f.y<.45||f.halfX*f.halfZ<.5||f.halfX*f.halfZ>2500)continue;
   c.save();c.translate(f.cx,f.cz);c.rotate(-f.rotY);
   c.fillStyle=f.y>5?'#70828c':'#465e68';c.fillRect(-f.halfX,-f.halfZ,2*f.halfX,2*f.halfZ);c.restore();
  }
  c.strokeStyle='#d4a456';c.lineWidth=.45;c.setLineDash([2,1]);c.strokeRect(126,-60,144,125);
  return map;
 }
 update(dt:number):void{
  this.elapsed+=dt;if(this.elapsed<.1)return;this.elapsed=0;
  const me=this.players[this.index],at=me.body.translation(),c=this.canvas.getContext('2d')!;
  const center=SIZE/2,radius=SIZE/2-9,scale=radius/RANGE;
  c.clearRect(0,0,SIZE,SIZE);c.save();c.beginPath();c.arc(center,center,radius,0,Math.PI*2);c.clip();
  c.fillStyle='#253c3e';c.fillRect(0,0,SIZE,SIZE);
  const k=this.staticMap.width/BOUNDS.w;
  c.drawImage(this.staticMap,(at.x-RANGE-BOUNDS.x)*k,(at.z-RANGE-BOUNDS.z)*k,2*RANGE*k,2*RANGE*k,9,9,2*radius,2*radius);
  c.strokeStyle='#ffffff24';c.lineWidth=1;c.beginPath();c.arc(center,center,radius/2,0,Math.PI*2);c.stroke();
  let nearest=Infinity,nearby=0;
  const marker=(x:number,y:number,z:number,color:string,car=false,edge=false)=>{
   let dx=(x-at.x)*scale,dz=(z-at.z)*scale;const d=Math.hypot(dx,dz),limit=radius-8;
   if(d>limit){if(!edge)return;dx*=limit/d;dz*=limit/d;}
   c.fillStyle=color;c.strokeStyle='#101c26';c.lineWidth=2;
   if(car){c.beginPath();c.rect(center+dx-5,center+dz-4,10,8);}else{c.beginPath();c.arc(center+dx,center+dz,5,0,Math.PI*2);}
   c.fill();c.stroke();
   if(Math.abs(y-at.y)>2.5){c.font='bold 13px sans-serif';c.fillText(y>at.y?'↑':'↓',center+dx+5,center+dz-3);}
  };
  this.players.forEach((p,i)=>{if(i!==this.index){const q=p.body.translation();marker(q.x,q.y,q.z,'#73e5ff',false,true);}});
  for(const o of this.police?.officers??[]){
   if(o.boarded)continue;const p=this.police!.patrols[o.patrol];if(p.phase!=='chasing'&&p.phase!=='exiting')continue;
   const q=o.body.translation(),d=Math.hypot(q.x-at.x,q.z-at.z);nearest=Math.min(nearest,d);if(d<=RANGE)nearby++;
   marker(q.x,q.y,q.z,'#ff6666',false,true);
  }
  for(const p of this.police?.patrols??[]){if(p.phase==='idle'||p.phase==='returning'||p.phase==='boarding')continue;
   const d=Math.hypot(p.pos.x-at.x,p.pos.z-at.z);if(p.phase==='driving')nearest=Math.min(nearest,d);
   marker(p.pos.x,.9,p.pos.z,'#74aaff',true,true);
  }
  const angle=me.mesh.rotation.y,dx=Math.sin(angle),dz=Math.cos(angle);
  c.beginPath();c.moveTo(center+dx*10,center+dz*10);c.lineTo(center-dx*6+dz*5,center-dz*6-dx*5);c.lineTo(center-dx*6-dz*5,center-dz*6+dx*5);c.closePath();c.fillStyle='#fff';c.fill();c.strokeStyle='#14252f';c.stroke();
  c.restore();c.font='bold 14px sans-serif';c.textAlign='center';c.fillStyle='#fff';c.fillText('N',center,15);c.textAlign='start';
  const distance=Number.isFinite(nearest)?Math.round(nearest):null;
  this.element.dataset.nearest=distance===null?'':String(distance);this.element.dataset.nearby=String(nearby);
  this.label.textContent=distance===null?'60 m Radius · Keine Polizei':`${nearby} ${nearby===1?'Beamter':'Beamte'} in 60 m · Polizei ${distance} m`;
  this.label.style.color=distance!==null&&distance<20?'#ff9292':'#e6eef6';
  this.canvas.setAttribute('aria-label',`Minikarte Spieler ${this.index+1}. Weiß: du. Türkis: Mitspieler. Rot: Polizei. Blau: Streifenwagen. ${this.label.textContent}. Pfeile zeigen Höhenunterschiede.`);
 }
}
