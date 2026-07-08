import * as THREE from 'three';
import type { PlayerController } from './PlayerController';
import {
  BALANCE_CARRY_TAU,
  BALANCE_CORRECT,
  BALANCE_FULL_MIN,
  BALANCE_SWAY_BASE,
  BALANCE_SWAY_SPEED,
  BALANCE_WALK,
  CAPSULE_HALFHEIGHT,
  CAPSULE_RADIUS,
  GRIND_RESNAP_MS,
  GRIND_SNAP_RADIUS,
} from './tuning';

const CENTER_TO_FEET = CAPSULE_HALFHEIGHT + CAPSULE_RADIUS;

const _feet = new THREE.Vector3();
const _point = new THREE.Vector3();
const _tangent = new THREE.Vector3();
const _side = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _camForward = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

interface ActiveBalance {
  railIndex: number;
  /** Kurvenparameter 0..1 (bogenlängen-parametrisiert) */
  t: number;
  /** Restschwung der Landung (m/s, klingt exponentiell ab), mit Vorzeichen entlang der Kurve */
  carry: number;
  /** Balance-Auslenkung -1..1; |sway| > 1 = Sturz */
  sway: number;
  /** Beim Einstieg gelatchte Richtungszuordnung für W/S bzw. A/D */
  alongAlign: 1 | -1;
  sideAlign: 1 | -1;
  swayDrift: number;
  driftTimer: number;
  elapsed: number;
  tickAccum: number;
  /** Abgedeckter Kurvenbereich für den Volle-Länge-Bonus */
  minT: number;
  maxT: number;
}

/**
 * Rail-Balance (Task 16d, ersetzt das THPS-Grinden): Landung von oben
 * schnappt auf die Kurve, der Landeschwung trägt kurz weiter, danach
 * kontrolliertes Gehen mit W/S. Zufällige Störimpulse müssen mit A/D
 * ausgeglichen werden — kippt die Balance, fällt der Spieler.
 */
export class RailBalancer {
  active: ActiveBalance | null = null;
  private cooldownRail = -1;
  private cooldownUntil = 0;

  constructor(private readonly player: PlayerController) {}

  /** Für die HUD-Balance-Anzeige. */
  get sway(): number | null {
    return this.active ? this.active.sway : null;
  }

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
    const along = p.velocity.x * _tangent.x + p.velocity.z * _tangent.z;
    const hSpeed = p.horizontalSpeed;

    // Richtungszuordnung EINMAL latchen: W geht in Landerichtung weiter;
    // ohne klaren Schwung entscheidet die Kamera. (Pro Frame neu raten
    // wäre bei Kamera senkrecht zur Rail ein Münzwurf.)
    _camForward.set(-Math.sin(p.cameraYaw), 0, -Math.cos(p.cameraYaw));
    _camRight.set(Math.cos(p.cameraYaw), 0, -Math.sin(p.cameraYaw));
    _side.crossVectors(_tangent, UP).normalize();
    const alongAlign: 1 | -1 =
      Math.abs(along) > 0.5
        ? along >= 0
          ? 1
          : -1
        : _tangent.dot(_camForward) >= 0
          ? 1
          : -1;

    this.active = {
      railIndex: bestRail,
      t,
      carry: along,
      // Einstiegs-Störung skaliert mit dem Landetempo
      sway: (Math.random() < 0.5 ? -1 : 1) * Math.min(0.5, hSpeed * 0.05),
      alongAlign,
      sideAlign: _side.dot(_camRight) >= 0 ? 1 : -1,
      swayDrift: 0,
      driftTimer: 0,
      elapsed: 0,
      tickAccum: 0,
      minT: t,
      maxT: t,
    };
    p.bus.emit('trick:balanceStart', { rail: bestRail });
    return true;
  }

  /** Im BALANCE-Zustand jeden Fixed-Step. false = runter (Ende/Sturz). */
  ride(dt: number): boolean {
    const p = this.player;
    const b = this.active;
    if (!b) return false;

    const rail = p.level.rails[b.railIndex];
    b.elapsed += dt;
    b.tickAccum += dt;
    while (b.tickAccum >= 1) {
      b.tickAccum -= 1;
      p.bus.emit('trick:balanceTick', { seconds: Math.round(b.elapsed) });
    }

    rail.curve.getTangentAt(clamp01(b.t), _tangent);
    _side.crossVectors(_tangent, UP).normalize();

    // Eingaben über die beim Einstieg gelatchte Zuordnung abbilden
    const input = p.currentInput;
    const walk = (input?.moveY ?? 0) * b.alongAlign * BALANCE_WALK;
    const correct = (input?.moveX ?? 0) * b.sideAlign;

    // Landeschwung klingt schnell ab, dann zählt nur noch das Gehen
    b.carry *= Math.exp(-dt / BALANCE_CARRY_TAU);
    const speed = b.carry + walk;
    b.t += (speed * dt) / rail.length;
    b.minT = Math.min(b.minT, b.t);
    b.maxT = Math.max(b.maxT, b.t);

    // Balance: zufällige Störimpulse, stärker bei Tempo; A/D wirkt dagegen
    b.driftTimer -= dt;
    if (b.driftTimer <= 0) {
      b.driftTimer = 0.3 + Math.random() * 0.4;
      b.swayDrift =
        (Math.random() * 2 - 1) * (BALANCE_SWAY_BASE + Math.abs(speed) * BALANCE_SWAY_SPEED);
    }
    b.sway += b.swayDrift * dt + correct * BALANCE_CORRECT * dt;

    if (Math.abs(b.sway) > 1) {
      // Gekippt: seitlich runter
      const dir = Math.sign(b.sway);
      p.velocity.set(_side.x * dir * 1.5, 0, _side.z * dir * 1.5);
      this.end();
      return false;
    }

    if (b.t <= 0 || b.t >= 1) {
      // Kurvenende: kontrolliert heruntergehen/abspringen
      this.exitVelocity(0);
      this.end();
      return false;
    }

    rail.curve.getPointAt(b.t, _point);
    p.body.setNextKinematicTranslation({
      x: _point.x,
      y: _point.y + CENTER_TO_FEET,
      z: _point.z,
    });
    p.grounded = false;

    // Ist-Geschwindigkeit fürs Feeling (Kamera-FOV, Blickrichtung, Absprung)
    p.velocity.set(_tangent.x * speed, 0, _tangent.z * speed);
    return true;
  }

  /** Absprung von der Rail: Momentum + Impuls hoch. */
  jumpOff(upVelocity: number): void {
    this.exitVelocity(upVelocity);
    this.end();
  }

  private exitVelocity(upVelocity: number): void {
    const p = this.player;
    p.velocity.y = upVelocity;
  }

  private end(): void {
    const b = this.active;
    if (!b) return;
    this.cooldownRail = b.railIndex;
    this.cooldownUntil = performance.now() + GRIND_RESNAP_MS;
    this.player.bus.emit('trick:balanceEnd', {
      durationMs: Math.round(b.elapsed * 1000),
      full: b.maxT - b.minT >= BALANCE_FULL_MIN,
    });
    this.active = null;
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
