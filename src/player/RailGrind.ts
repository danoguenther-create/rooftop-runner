import * as THREE from 'three';
import type { PlayerController } from './PlayerController';
import {
  CAPSULE_HALFHEIGHT,
  CAPSULE_RADIUS,
  GRIND_FRICTION,
  GRIND_MIN_SPEED,
  GRIND_RESNAP_MS,
  GRIND_SNAP_RADIUS,
} from './tuning';

const CENTER_TO_FEET = CAPSULE_HALFHEIGHT + CAPSULE_RADIUS;

const _feet = new THREE.Vector3();
const _point = new THREE.Vector3();
const _tangent = new THREE.Vector3();

interface ActiveGrind {
  railIndex: number;
  /** Kurvenparameter 0..1 (bogenlängen-parametrisiert via getPointAt) */
  t: number;
  /** Fahrtrichtung entlang der Kurve */
  dir: 1 | -1;
  speed: number;
  elapsed: number;
  tickAccum: number;
}

/**
 * Rail-Grind (Task 13): rein kinematisch — kein Collider. Aufschnappen
 * über die gecachten Sample-Punkte, Fahren per Bogenlängen-Parameter.
 */
export class RailGrinder {
  active: ActiveGrind | null = null;
  private cooldownRail = -1;
  private cooldownUntil = 0;

  constructor(private readonly player: PlayerController) {}

  /** Im AIR-Zustand jeden Fixed-Step aufrufen. true = aufgeschnappt. */
  trySnap(): boolean {
    const p = this.player;
    if (p.velocity.y > 0.5) return false;

    const c = p.body.translation();
    _feet.set(c.x, c.y - CENTER_TO_FEET, c.z);

    const now = performance.now();
    let bestRail = -1;
    let bestSample = -1;
    let bestDistSq = GRIND_SNAP_RADIUS * GRIND_SNAP_RADIUS;

    const rails = p.level.rails;
    for (let r = 0; r < rails.length; r++) {
      if (r === this.cooldownRail && now < this.cooldownUntil) continue;
      const samples = rails[r].samples;
      for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        const dy = _feet.y - s.y;
        // Füße höchstens 0.5 m über der Rail, kaum darunter
        if (dy > 0.5 || dy < -0.2) continue;
        const dx = _feet.x - s.x;
        const dz = _feet.z - s.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq < bestDistSq) {
          bestDistSq = distSq;
          bestRail = r;
          bestSample = i;
        }
      }
    }
    if (bestRail < 0) return false;

    const rail = rails[bestRail];
    const t = bestSample / (rail.samples.length - 1);
    rail.curve.getTangentAt(clamp01(t), _tangent);
    const dot = p.velocity.x * _tangent.x + p.velocity.z * _tangent.z;

    this.active = {
      railIndex: bestRail,
      t,
      dir: dot >= 0 ? 1 : -1,
      speed: Math.max(p.horizontalSpeed, GRIND_MIN_SPEED),
      elapsed: 0,
      tickAccum: 0,
    };
    p.bus.emit('trick:grindStart', { rail: bestRail });
    return true;
  }

  /** Im GRIND-Zustand jeden Fixed-Step: fahren. false = Kurvenende. */
  ride(dt: number): boolean {
    const p = this.player;
    const g = this.active;
    if (!g) return false;

    const rail = p.level.rails[g.railIndex];
    g.elapsed += dt;
    g.tickAccum += dt;
    while (g.tickAccum >= 1) {
      g.tickAccum -= 1;
      p.bus.emit('trick:grindTick', { seconds: Math.round(g.elapsed) });
    }

    g.speed = Math.max(g.speed - GRIND_FRICTION * dt, GRIND_MIN_SPEED);
    g.t += (g.dir * g.speed * dt) / rail.length;

    if (g.t <= 0 || g.t >= 1) {
      // Kurvenende: mit Tangential-Momentum in die Luft
      this.exitVelocity(0);
      this.end();
      return false;
    }

    rail.curve.getPointAt(g.t, _point);
    rail.curve.getTangentAt(g.t, _tangent);
    p.body.setNextKinematicTranslation({
      x: _point.x,
      y: _point.y + CENTER_TO_FEET,
      z: _point.z,
    });
    p.grounded = false;

    // Geschwindigkeit fürs Feeling (Kamera-FOV, Blickrichtung, Absprung)
    p.velocity.set(_tangent.x * g.dir * g.speed, 0, _tangent.z * g.dir * g.speed);
    return true;
  }

  /** Absprung von der Rail (Task 13): Tangential-Momentum + Impuls hoch. */
  jumpOff(upVelocity: number): void {
    this.exitVelocity(upVelocity);
    this.end();
  }

  private exitVelocity(upVelocity: number): void {
    const p = this.player;
    const g = this.active;
    if (!g) return;
    const rail = p.level.rails[g.railIndex];
    rail.curve.getTangentAt(clamp01(g.t), _tangent);
    p.velocity.set(
      _tangent.x * g.dir * g.speed,
      upVelocity,
      _tangent.z * g.dir * g.speed,
    );
  }

  private end(): void {
    const g = this.active;
    if (!g) return;
    this.cooldownRail = g.railIndex;
    this.cooldownUntil = performance.now() + GRIND_RESNAP_MS;
    this.player.bus.emit('trick:grindEnd', { durationMs: Math.round(g.elapsed * 1000) });
    this.active = null;
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
