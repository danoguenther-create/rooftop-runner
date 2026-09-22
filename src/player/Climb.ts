import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { PlayerController } from './PlayerController';
import type { TopFace } from '../gameplay/EdgeDetection';
import {
  CAPSULE_HALFHEIGHT,
  CAPSULE_RADIUS,
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
    this.stopWallClimb();
    this.regrabAt = simNow() + LEDGE_REGRAB_MS;
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

      const margin = 0.25;
      const other = axis === 'x' ? face.halfZ : face.halfX;
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
    const g = this.grab!;
    const lx = g.axis === 'x' ? g.sign * g.face.halfX : g.t;
    const lz = g.axis === 'x' ? g.t : g.sign * g.face.halfZ;
    return this.toWorld(g.face, lx, lz, out).setY(g.face.y);
  }

  /** Auswärts zeigende (von der Fläche weg) horizontale Richtung. */
  outward(out: THREE.Vector3): THREE.Vector3 {
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
    const margin = 0.15;
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
