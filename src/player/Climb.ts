import {clearTraversal} from './DynamicParkour';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { PlayerController } from './PlayerController';
import type { TopFace } from '../gameplay/EdgeDetection';
import {
  CAPSULE_HALFHEIGHT,
  CAPSULE_RADIUS,
  HANG_CENTER_BELOW,
  LEDGE_GRAB_DIST,
  LEDGE_GRAB_HAND_MAX,
  LEDGE_GRAB_HAND_MIN,
  LEDGE_REGRAB_MS,
  WALLCLIMB_COOLDOWN_MS,
  WALLCLIMB_MAX_MS,
  WALLCLIMB_MIN_SPEED,
  WALLCLIMB_PUSH,
  WALLCLIMB_VY,
} from './tuning';
import { simNow } from '../core/SimClock';

const CENTER_TO_FEET = CAPSULE_HALFHEIGHT + CAPSULE_RADIUS;

/** Aktiver Griff: Kante einer Deckfläche, parametrisiert entlang der Kante. */
export interface Grab {
  face: TopFace;
  /** Kanten-Achse in Flächen-Lokalkoordinaten */
  axis: 'x' | 'z';
  /** Seite der Fläche (+1/-1 entlang der Achse) */
  sign: 1 | -1;
  /** Position entlang der Kante (lokal, auf der jeweils anderen Achse) */
  t: number;
}

const _ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
const _pos = new THREE.Vector3();
const _wish = new THREE.Vector3();
const _outward = new THREE.Vector3();

/**
 * Vertikaler Wandlauf + Ledge-Grab (Task 16b). Der Wandlauf ist kein
 * FSM-Zustand (bleibt AIR), nur ein einmaliger vy-Boost mit Zeitfenster;
 * das Greifen einer Deckflächen-Kante wechselt in den HANG-Zustand.
 */
export class Climber {
  grab: Grab | null = null;
  transfer: {from:THREE.Vector3;to:THREE.Vector3;outFrom:THREE.Vector3;outTo:THREE.Vector3;target:Grab;t:number;duration:number;bodyPoints?:THREE.Vector3[];corner?:boolean;fromBelow?:boolean}|null=null;
  shimmyPhase=0;
  sideContinuation:{input:number;direction:number}|null=null;
  braced=true;

  hangPosition(out:THREE.Vector3):THREE.Vector3 {
    if(this.transfer?.bodyPoints){
      const points=this.transfer.bodyPoints,t=this.transfer.t,section=t<.2?0:t<.55?1:2;
      const times=[0,.2,.55,1];return out.copy(points[section]).lerp(points[section+1],THREE.MathUtils.smoothstep(t,times[section],times[section+1]));
    }
    this.edgePoint(out);const normal=this.outward(new THREE.Vector3());
    const arc=this.transfer?Math.sin(Math.PI*this.transfer.t):0;
    return out.addScaledVector(normal,CAPSULE_RADIUS+.1+(this.transfer?.corner ? .55 : .18)*arc).add(new THREE.Vector3(0,-HANG_CENTER_BELOW+(this.transfer?.corner ? .08 : .45)*arc,0));
  }
  moveAlong(p:PlayerController,delta:number):void {
    if(!this.grab||this.transfer)return;
    const input=Math.sign(p.currentInput?.moveX??0);
    if(this.sideContinuation&&input===this.sideContinuation.input&&input!==0)delta=Math.abs(delta)*this.sideContinuation.direction;
    else this.sideContinuation=null;
    const original={...this.grab},at=new THREE.Vector3().copy(p.body.translation()),finished=this.shimmy(delta),to=this.hangPosition(new THREE.Vector3());
    if(!this.validGrip(p)||!clearTraversal(p,at,to,CAPSULE_HALFHEIGHT,CAPSULE_RADIUS-.02)){this.grab=original;this.tryTransfer(p,0,this.edgeDir(new THREE.Vector3()).multiplyScalar(Math.sign(delta)),true);return;}
    this.shimmyPhase+=Math.abs(delta)*5;
    if(!finished)this.tryTransfer(p,0,this.edgeDir(new THREE.Vector3()).multiplyScalar(Math.sign(delta)),true);
  }
  tryTransfer(p:PlayerController,vertical:number,direction:THREE.Vector3|null=null,aroundCorner=false):boolean {
    if(!this.grab||this.transfer)return false;
    const original=this.grab,from=this.edgePoint(new THREE.Vector3()),outFrom=this.outward(new THREE.Vector3());
    let best:NonNullable<Climber['transfer']>|null=null,score=Infinity;
    for(const face of p.level.topFaces){
      if(face===original.face&&!aroundCorner)continue;
      const dy=face.y-from.y;if(vertical>0?(dy<.35||dy>2.2):vertical<0?(dy>-.6||dy< -3.2):Math.abs(dy)>1.25)continue;
      if(Math.hypot(face.cx-from.x,face.cz-from.z)>Math.hypot(face.halfX,face.halfZ)+3)continue;
      const c=Math.cos(face.rotY),s=Math.sin(face.rotY),dx=from.x-face.cx,dz=from.z-face.cz,lx=dx*c-dz*s,lz=dx*s+dz*c;
      for(const axis of ['x','z'] as const)for(const sign of [-1,1] as const){
        if(face===original.face&&axis===original.axis&&sign===original.sign)continue;
        const half=axis==='x'?face.halfZ:face.halfX;if(half<.06)continue;
        const limit=half-Math.min(.18,half*.25);
        const target:Grab={face,axis,sign,t:THREE.MathUtils.clamp(axis==='x'?lz:lx,-limit,limit)};
        this.grab=target;const to=this.edgePoint(new THREE.Vector3()),outTo=this.outward(new THREE.Vector3()),delta=to.clone().sub(from),horizontal=Math.hypot(delta.x,delta.z);
        if(horizontal> (vertical?2.2:3.5)||outTo.dot(outFrom)<-.1||(!vertical&&(horizontal<(face===original.face?.1:.3)||!direction||delta.clone().setY(0).normalize().dot(direction)<.25))||!this.validGrip(p)){this.grab=original;continue;}
        const rank=horizontal+Math.abs(dy)*.5;if(rank>=score){this.grab=original;continue;}
        const candidate={from,to,outFrom,outTo,target,t:0,duration:THREE.MathUtils.clamp(.32+delta.length()*.2,.45,1),corner:outTo.dot(outFrom)<.75};
        this.grab=original;this.transfer=candidate;
        let previous=this.hangPosition(new THREE.Vector3()),clear=true;
        for(let i=1;i<=20;i++){candidate.t=i/20;const next=this.hangPosition(new THREE.Vector3());if(!clearTraversal(p,previous,next,CAPSULE_HALFHEIGHT,CAPSULE_RADIUS-.02)){clear=false;break;}previous=next;}
        this.transfer=null;candidate.t=0;
        if(clear){best=candidate;score=rank;}
      }
    }
    this.grab=original;this.transfer=best;return !!best;
  }
  tickTransfer(p:PlayerController,dt:number):boolean {
    if(!this.transfer)return false;const transfer=this.transfer,old=transfer.t;
    transfer.t=Math.min(1,transfer.t+dt/transfer.duration);
    const at=new THREE.Vector3().copy(p.body.translation()),to=this.hangPosition(new THREE.Vector3());
    if(!clearTraversal(p,at,to,CAPSULE_HALFHEIGHT,CAPSULE_RADIUS-.02)){transfer.t=old;this.transfer=null;return false;}
    p.body.setNextKinematicTranslation(to);
    if(transfer.t===1){
      this.grab=transfer.target;
      const input=Math.sign(p.currentInput?.moveX??0);
      if(transfer.corner&&input)this.sideContinuation={input,direction:-Math.sign(transfer.target.t)};
      this.transfer=null;
    }
    return true;
  }
  /** Roll + movement towards an exposed roof edge: step out and lower into a grip. */
  tryDropToHang(p:PlayerController):boolean {
    if(!p.grounded||!p.currentInput?.rollHeld)return false;
    const direction=p.getWishDir(new THREE.Vector3());if(!direction)return false;
    const start=new THREE.Vector3().copy(p.body.translation());
    const feet=start.y-CAPSULE_HALFHEIGHT-CAPSULE_RADIUS;
    for(const face of p.level.topFaces){
      if(Math.abs(face.y-feet)>.12)continue;
      const c=Math.cos(face.rotY),s=Math.sin(face.rotY),dx=start.x-face.cx,dz=start.z-face.cz,lx=dx*c-dz*s,lz=dx*s+dz*c;
      if(Math.abs(lx)>face.halfX+.08||Math.abs(lz)>face.halfZ+.08)continue;
      for(const axis of ['x','z'] as const)for(const sign of [-1,1] as const){
        const distance=(axis==='x'?face.halfX:face.halfZ)-sign*(axis==='x'?lx:lz);
        if(distance<-.08||distance>1)continue;
        const normal=this.outwardWorld(face,axis,sign,new THREE.Vector3());if(normal.dot(direction)<.5)continue;
        const limit=(axis==='x'?face.halfZ:face.halfX)-.25;if(limit<=0)continue;
        this.grab={face,axis,sign,t:THREE.MathUtils.clamp(axis==='x'?lz:lx,-limit,limit)};
        if(!this.validGrip(p)){this.grab=null;continue;}
        const edge=this.edgePoint(new THREE.Vector3()),end=this.hangPosition(new THREE.Vector3());
        const lift=start.clone().add(new THREE.Vector3(0,.08,0)),outside=end.clone().setY(lift.y);
        const candidate={from:edge.clone(),to:edge.clone(),outFrom:normal.clone(),outTo:normal.clone(),target:this.grab,t:0,duration:.85,bodyPoints:[start,lift,outside,end]};
        this.transfer=candidate;let previous=start,clear=true;
        for(let i=1;i<=40;i++){candidate.t=i/40;const next=this.hangPosition(new THREE.Vector3());if(!clearTraversal(p,previous,next,CAPSULE_HALFHEIGHT,CAPSULE_RADIUS-.02)){clear=false;break;}previous=next;}
        candidate.t=0;
        if(clear)return true;
        this.transfer=null;this.grab=null;
      }
    }
    return false;
  }
  updateBracing(p:PlayerController):void {
    const at=this.hangPosition(new THREE.Vector3()),normal=this.outward(new THREE.Vector3());at.y-=.45;
    this.braced=!!p.physics.world.castRay(new RAPIER.Ray(at,normal.negate()),.8,true,undefined,undefined,p.collider,p.body);
  }

  private climbCooldownUntil = 0;
  private climbingUntil = 0;
  private regrabAt = 0;
  private pushPending = false;
  private readonly pushNormal = new THREE.Vector3();

  stopWallClimb(): void {
    this.climbingUntil = 0;
    this.pushPending = false;
  }

  /** Für Animations-Blending (Task 21) und Debug. */
  get isWallClimbing(): boolean {
    return simNow() < this.climbingUntil;
  }

  /** Frontal gegen eine Wand mit Tempo -> einmaliger Aufwärts-Boost. */
  tryWallClimb(p: PlayerController): void {
    const now = simNow();
    if (now < this.climbCooldownUntil) return;
    // A descending approach already at hand height should catch the ledge.
    // Boosting before reaching the grab radius lifts the hands past it.
    if (p.velocity.y <= 0.5 && this.ledgeInReach(p, CAPSULE_RADIUS + 0.45)) return;
    const hSpeed = p.horizontalSpeed;
    if (hSpeed < WALLCLIMB_MIN_SPEED) return;

    const c = p.body.translation();
    const dirX = p.velocity.x / hSpeed;
    const dirZ = p.velocity.z / hSpeed;
    _ray.origin.x = c.x;
    _ray.origin.y = c.y + 0.3; // Brusthöhe
    _ray.origin.z = c.z;
    _ray.dir.x = dirX;
    _ray.dir.y = 0;
    _ray.dir.z = dirZ;
    const hit = p.physics.world.castRayAndGetNormal(
      _ray,
      CAPSULE_RADIUS + 0.45,
      true,
      undefined,
      undefined,
      p.collider,
      p.body,
    );
    if (!hit) return;
    const n = hit.normal;
    if (Math.abs(n.y) >= 0.3) return;
    // Frontal genug? (Bewegung gegen die Wandnormale)
    if (-(dirX * n.x + dirZ * n.z) <= 0.7) return;

    // Deterministische Steighöhe: vy auf Wandlauf-Tempo heben (nie senken)
    p.velocity.y = Math.max(p.velocity.y, WALLCLIMB_VY);
    this.pushNormal.set(n.x, 0, n.z).normalize();
    this.climbingUntil = now + WALLCLIMB_MAX_MS;
    this.climbCooldownUntil = now + WALLCLIMB_COOLDOWN_MS;
    this.pushPending = true;
  }

  /** Nach abgelaufener Wandlauf-Phase einmalig von der Wand abdrücken. */
  tick(p: PlayerController): void {
    if (this.pushPending && !this.isWallClimbing && p.fsm.current === 'AIR') {
      p.velocity.x += this.pushNormal.x * WALLCLIMB_PUSH;
      p.velocity.z += this.pushNormal.z * WALLCLIMB_PUSH;
      this.pushPending = false;
    }
  }

  /**
   * Ist im Fall eine greifbare Kante in Reichweite? Ohne Wish-Richtung
   * geprüft — dient dem Controller nur dazu, in Kantennähe einen
   * Richtungsdruck als Grab-Absicht (nicht als Flip) zu werten.
   */
  ledgeInReach(p: PlayerController, maxDistance = LEDGE_GRAB_DIST): boolean {
    if (p.velocity.y > 0.5 || simNow() < this.regrabAt) return false;
    p.getPosition(_pos);
    const feetY = _pos.y - CENTER_TO_FEET;
    for (const face of p.level.topFaces) {
      const rel = face.y - feetY;
      if (rel < LEDGE_GRAB_HAND_MIN || rel > LEDGE_GRAB_HAND_MAX) continue;
      const cos = Math.cos(face.rotY);
      const sin = Math.sin(face.rotY);
      const dx = _pos.x - face.cx;
      const dz = _pos.z - face.cz;
      const lx = dx * cos - dz * sin;
      const lz = dx * sin + dz * cos;
      if (Math.abs(lx) <= face.halfX && Math.abs(lz) <= face.halfZ) continue;
      const clx = THREE.MathUtils.clamp(lx, -face.halfX, face.halfX);
      const clz = THREE.MathUtils.clamp(lz, -face.halfZ, face.halfZ);
      if (Math.hypot(lx - clx, lz - clz) <= maxDistance) return true;
    }
    return false;
  }

  /** Nach Loslassen/Mantle kurz nicht erneut greifen. */
  releaseGrab(): void {
    this.grab = null;
    this.transfer = null;
    this.sideContinuation=null;
    this.stopWallClimb();
    this.regrabAt = simNow() + LEDGE_REGRAB_MS;
  }

  /** Catch a shallow overhang before the jumping capsule strikes its underside. */
  tryUnderhangGrab(p:PlayerController):boolean {
    if(p.velocity.y<=.5||p.airTricks.active||p.currentInput?.rollHeld||simNow()<this.regrabAt)return false;
    const wish=p.getWishDir(new THREE.Vector3());if(!wish)return false;
    const start=new THREE.Vector3().copy(p.body.translation()),feet=start.y-CENTER_TO_FEET;
    for(const face of p.level.topFaces){
      const height=face.y-feet;if(height<1.75||height>2.35)continue;
      const c=Math.cos(face.rotY),s=Math.sin(face.rotY),dx=start.x-face.cx,dz=start.z-face.cz,lx=dx*c-dz*s,lz=dx*s+dz*c;
      if(Math.abs(lx)>face.halfX+.4||Math.abs(lz)>face.halfZ+.4)continue;
      for(const axis of ['x','z'] as const)for(const sign of [-1,1] as const){
        const normal=this.outwardWorld(face,axis,sign,new THREE.Vector3());if(normal.dot(wish)>-.5)continue;
        const distance=(axis==='x'?face.halfX:face.halfZ)-sign*(axis==='x'?lx:lz);
        if(distance<-.4||distance>.45)continue;
        const half=axis==='x'?face.halfZ:face.halfX;if(half<.06)continue;
        const limit=half-Math.min(.25,half*.25);
        this.grab={face,axis,sign,t:THREE.MathUtils.clamp(axis==='x'?lz:lx,-limit,limit)};
        if(!this.validGrip(p)){this.grab=null;continue;}
        const edge=this.edgePoint(new THREE.Vector3()),end=this.hangPosition(new THREE.Vector3());
        // A solid wall below the rim uses ordinary wall climbing, not this overhang catch.
        const below=edge.clone().addScaledVector(normal,-.06).setY(start.y);
        if(p.physics.world.intersectionWithShape(below,{x:0,y:0,z:0,w:1},new RAPIER.Ball(.04),undefined,undefined,p.collider,p.body)){this.grab=null;continue;}
        const outside=end.clone().setY(start.y);
        const candidate={from:edge.clone(),to:edge.clone(),outFrom:normal.clone(),outTo:normal.clone(),target:this.grab,t:0,duration:.38,bodyPoints:[start,start.clone(),outside,end],fromBelow:true};
        this.transfer=candidate;let previous=start,clear=true;
        for(let i=1;i<=24;i++){candidate.t=i/24;const next=this.hangPosition(new THREE.Vector3());if(!clearTraversal(p,previous,next,CAPSULE_HALFHEIGHT,CAPSULE_RADIUS-.02)){clear=false;break;}previous=next;}
        candidate.t=0;if(clear)return true;
        this.transfer=null;this.grab=null;
      }
    }
    return false;
  }
  /**
   * Kante in Griffweite? Greift während der Aufwärtsbewegung am Wandlauf
   * automatisch, im Fall nur mit Input Richtung Wand.
   */
  tryGrab(p: PlayerController): boolean {
    const now = simNow();
    if (now < this.regrabAt) return false;

    const rising = p.velocity.y > 0.5;
    let wish: THREE.Vector3 | null = null;
    if (rising) {
      if (!this.isWallClimbing) return false; // freier Sprung greift nicht von selbst
    } else {
      wish = p.getWishDir(_wish);
      if (!wish) return false; // im Fall nur mit aktivem Input Richtung Wand
    }

    p.getPosition(_pos);
    const feetY = _pos.y - CENTER_TO_FEET;

    for (const face of p.level.topFaces) {
      const rel = face.y - feetY;
      if (rel < LEDGE_GRAB_HAND_MIN || rel > LEDGE_GRAB_HAND_MAX) continue;

      const cos = Math.cos(face.rotY);
      const sin = Math.sin(face.rotY);
      const dx = _pos.x - face.cx;
      const dz = _pos.z - face.cz;
      const lx = dx * cos - dz * sin;
      const lz = dx * sin + dz * cos;
      if (Math.abs(lx) <= face.halfX && Math.abs(lz) <= face.halfZ) continue; // über der Fläche

      const clx = THREE.MathUtils.clamp(lx, -face.halfX, face.halfX);
      const clz = THREE.MathUtils.clamp(lz, -face.halfZ, face.halfZ);
      const dist = Math.hypot(lx - clx, lz - clz);
      if (dist > LEDGE_GRAB_DIST) continue;

      // Dominante Kante bestimmen
      const overX = Math.abs(lx) - face.halfX;
      const overZ = Math.abs(lz) - face.halfZ;
      const axis: 'x' | 'z' = overX >= overZ ? 'x' : 'z';
      const sign: 1 | -1 = (axis === 'x' ? lx : lz) >= 0 ? 1 : -1;

      this.outwardWorld(face, axis, sign, _outward);
      if (wish && wish.dot(_outward) > -0.3) continue; // nicht Richtung Wand gedrückt

      const other = axis === 'x' ? face.halfZ : face.halfX;
      const margin=Math.min(.25,other*.25);
      const candidate: Grab = {
        face,
        axis,
        sign,
        t: THREE.MathUtils.clamp(axis === 'x' ? clz : clx, -other + margin, other - margin),
      };
      this.grab = candidate;
      if (!this.validGrip(p)) { this.grab = null; continue; }
      return true;
    }
    return false;
  }

  /** Confirm a real exposed collider top, not an occluded or mirrored edge. */
  validGrip(p: PlayerController): boolean {
    if (!this.grab) return false;
    this.edgePoint(_pos);
    this.outward(_outward);
    _ray.origin.x = _pos.x - _outward.x * 0.035;
    _ray.origin.y = _pos.y + 0.08;
    _ray.origin.z = _pos.z - _outward.z * 0.035;
    _ray.dir.x = 0; _ray.dir.y = -1; _ray.dir.z = 0;
    const hit = p.physics.world.castRayAndGetNormal(_ray, 0.16, true, undefined, undefined, p.collider, p.body);
    return !!hit && hit.normal.y > 0.8 && Math.abs(0.08 - hit.timeOfImpact) < 0.025 &&
      (this.grab.face.collider === undefined || hit.collider.handle === this.grab.face.collider);
  }

  mantleTarget(p: PlayerController, out: THREE.Vector3): boolean {
    if (!this.validGrip(p)) return false;
    this.edgePoint(out); this.outward(_outward);
    out.addScaledVector(_outward, -0.45);
    out.y += CENTER_TO_FEET + 0.025;
    const occupied = p.physics.world.intersectionWithShape(out, {x:0,y:0,z:0,w:1},
      new RAPIER.Capsule(CAPSULE_HALFHEIGHT, CAPSULE_RADIUS - 0.02), undefined, undefined, p.collider, p.body);
    if (occupied) return false;
    _ray.origin.x = out.x; _ray.origin.y = out.y; _ray.origin.z = out.z;
    _ray.dir.x=0; _ray.dir.y=-1; _ray.dir.z=0;
    const floor = p.physics.world.castRay(_ray, CENTER_TO_FEET + 0.06, true, undefined, undefined, p.collider, p.body);
    return !!floor && Math.abs(floor.timeOfImpact - CENTER_TO_FEET - 0.025) < 0.06;
  }

  /** Weltposition des Griffpunkts auf der Kante. */
  edgePoint(out: THREE.Vector3): THREE.Vector3 {
    if(this.transfer)return out.copy(this.transfer.from).lerp(this.transfer.to,THREE.MathUtils.smoothstep(this.transfer.t,0,1));
    const g = this.grab!;
    const lx = g.axis === 'x' ? g.sign * g.face.halfX : g.t;
    const lz = g.axis === 'x' ? g.t : g.sign * g.face.halfZ;
    return this.toWorld(g.face, lx, lz, out).setY(g.face.y);
  }

  /** Auswärts zeigende (von der Fläche weg) horizontale Richtung. */
  outward(out: THREE.Vector3): THREE.Vector3 {
    if(this.transfer)return out.copy(this.transfer.outFrom).lerp(this.transfer.outTo,THREE.MathUtils.smoothstep(this.transfer.t,0,1)).normalize();
    const g = this.grab!;
    return this.outwardWorld(g.face, g.axis, g.sign, out);
  }

  /** Kantenrichtung (senkrecht zu outward, horizontal). */
  edgeDir(out: THREE.Vector3): THREE.Vector3 {
    const g = this.grab!;
    const lx = g.axis === 'x' ? 0 : 1;
    const lz = g.axis === 'x' ? 1 : 0;
    return this.dirToWorld(g.face, lx, lz, out);
  }

  /** Entlang der Kante hangeln; false am Flächenende. */
  shimmy(delta: number): boolean {
    const g = this.grab!;
    const half=g.axis==='x'?g.face.halfZ:g.face.halfX;
    const margin = Math.min(0.15,half*.25);
    const limit = (g.axis === 'x' ? g.face.halfZ : g.face.halfX) - margin;
    const next = g.t + delta;
    g.t = THREE.MathUtils.clamp(next, -limit, limit);
    return next === g.t;
  }

  private outwardWorld(
    face: TopFace,
    axis: 'x' | 'z',
    sign: 1 | -1,
    out: THREE.Vector3,
  ): THREE.Vector3 {
    return this.dirToWorld(face, axis === 'x' ? sign : 0, axis === 'x' ? 0 : sign, out);
  }

  private toWorld(face: TopFace, lx: number, lz: number, out: THREE.Vector3): THREE.Vector3 {
    const cos = Math.cos(face.rotY);
    const sin = Math.sin(face.rotY);
    return out.set(face.cx + lx * cos + lz * sin, 0, face.cz - lx * sin + lz * cos);
  }

  private dirToWorld(face: TopFace, lx: number, lz: number, out: THREE.Vector3): THREE.Vector3 {
    const cos = Math.cos(face.rotY);
    const sin = Math.sin(face.rotY);
    return out.set(lx * cos + lz * sin, 0, -lx * sin + lz * cos).normalize();
  }
}
