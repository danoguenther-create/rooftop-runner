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
const _pushNormal = new THREE.Vector3();

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

  /** Für Animations-Blending (Task 21) und Debug. */
  get isWallClimbing(): boolean {
    return performance.now() < this.climbingUntil;
  }

  /** Frontal gegen eine Wand mit Tempo -> einmaliger Aufwärts-Boost. */
  tryWallClimb(p: PlayerController): void {
    const now = performance.now();
    if (now < this.climbCooldownUntil) return;
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
    _pushNormal.set(n.x, 0, n.z).normalize();
    this.climbingUntil = now + WALLCLIMB_MAX_MS;
    this.climbCooldownUntil = now + WALLCLIMB_COOLDOWN_MS;
    this.pushPending = true;
  }

  /** Nach abgelaufener Wandlauf-Phase einmalig von der Wand abdrücken. */
  tick(p: PlayerController): void {
    if (this.pushPending && !this.isWallClimbing && p.fsm.current === 'AIR') {
      p.velocity.x += _pushNormal.x * WALLCLIMB_PUSH;
      p.velocity.z += _pushNormal.z * WALLCLIMB_PUSH;
      this.pushPending = false;
    }
  }

  /** Nach Loslassen/Mantle kurz nicht erneut greifen. */
  releaseGrab(): void {
    this.grab = null;
    this.regrabAt = performance.now() + LEDGE_REGRAB_MS;
  }

  /**
   * Kante in Griffweite? Greift während der Aufwärtsbewegung am Wandlauf
   * automatisch, im Fall nur mit Input Richtung Wand.
   */
  tryGrab(p: PlayerController): boolean {
    const now = performance.now();
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
      const lx = dx * cos + dz * sin;
      const lz = -dx * sin + dz * cos;
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

      const margin = 0.15;
      const other = axis === 'x' ? face.halfZ : face.halfX;
      this.grab = {
        face,
        axis,
        sign,
        t: THREE.MathUtils.clamp(axis === 'x' ? clz : clx, -other + margin, other - margin),
      };
      return true;
    }
    return false;
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
    return out.set(face.cx + lx * cos - lz * sin, 0, face.cz + lx * sin + lz * cos);
  }

  private dirToWorld(face: TopFace, lx: number, lz: number, out: THREE.Vector3): THREE.Vector3 {
    const cos = Math.cos(face.rotY);
    const sin = Math.sin(face.rotY);
    return out.set(lx * cos - lz * sin, 0, lx * sin + lz * cos).normalize();
  }
}
