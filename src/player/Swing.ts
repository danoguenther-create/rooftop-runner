import * as THREE from 'three';
import type { PlayerController } from './PlayerController';
import type { LoadedRail } from '../level/LevelLoader';
import {
  GRAVITY,
  SWING_DAMPING,
  SWING_HAND_OFFSET,
  SWING_MAX_VY,
  SWING_PUMP,
  SWING_PUMP_PHI_DEG,
  SWING_RADIUS,
  SWING_RELEASE_UP,
  SWING_RESNAP_MS,
  SWING_SNAP,
} from './tuning';

const PUMP_PHI = (SWING_PUMP_PHI_DEG * Math.PI) / 180;

const _hands = new THREE.Vector3();
const _point = new THREE.Vector3();
const _tangent = new THREE.Vector3();
const _u = new THREE.Vector3();
const _offset = new THREE.Vector3();
const _pos = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

interface ActiveSwing {
  rail: LoadedRail;
  /** Bogenlängen-Parameter 0..1 */
  t: number;
  /** Pendelwinkel (0 = senkrecht unter der Stange) */
  phi: number;
  /** Winkelgeschwindigkeit (rad/s) */
  omega: number;
  /** Träge Restbewegung entlang der Stange (m/s, gedämpft) */
  railSpeed: number;
  /** Horizontale Schwungrichtung (senkrecht zur Stange) */
  u: THREE.Vector3;
}

/**
 * Bar-Swing (Task 16c): Stangen sind Rails, die von UNTEN angeflogen
 * werden. Kinematisches Pendel um die Stangen-Tangente — kein Rapier-
 * Joint. Der Release-Zeitpunkt im Pendel bestimmt die Flugbahn.
 */
export class Swinger {
  private active: ActiveSwing | null = null;
  private cooldownRail: LoadedRail | null = null;
  private cooldownUntil = 0;
  /** Stangen in Folge ohne Bodenkontakt (für Combo-Bonus) */
  chain = 0;

  constructor(private readonly player: PlayerController) {}

  /** Bei Landung: Stangen-Kette endet. */
  resetChain(): void {
    this.chain = 0;
  }

  /** Hände von unten in Stangen-Reichweite? Dann fangen. */
  trySnap(): boolean {
    const p = this.player;
    if (p.velocity.y > SWING_MAX_VY) return false;

    p.getPosition(_pos);
    _hands.copy(_pos);
    _hands.y += SWING_HAND_OFFSET;

    const now = performance.now();
    for (const rail of p.level.rails) {
      if (rail === this.cooldownRail && now < this.cooldownUntil) continue;

      let bestIdx = -1;
      let bestD2 = SWING_SNAP * SWING_SNAP;
      for (let i = 0; i < rail.samples.length; i++) {
        const s = rail.samples[i];
        if (_pos.y >= s.y) continue; // nur von unten
        const d2 = _hands.distanceToSquared(s);
        if (d2 < bestD2) {
          bestD2 = d2;
          bestIdx = i;
        }
      }
      if (bestIdx < 0) continue;

      const t = bestIdx / (rail.samples.length - 1);
      rail.curve.getTangentAt(t, _tangent);
      _tangent.setY(0);
      if (_tangent.lengthSq() < 1e-4) continue; // senkrechte Stange: ungeeignet
      _tangent.normalize();

      // Schwungrichtung: horizontal senkrecht zur Stange, in Flugrichtung
      _u.crossVectors(_tangent, UP).normalize();
      const vPerp = p.velocity.x * _u.x + p.velocity.z * _u.z;
      if (vPerp < 0) _u.negate();

      // Startwinkel aus der Ist-Position relativ zur Stange
      rail.curve.getPointAt(t, _point);
      _offset.copy(_pos).sub(_point);
      const phi = Math.atan2(_offset.x * _u.x + _offset.z * _u.z, -_offset.y);

      this.active = {
        rail,
        t,
        phi,
        omega: Math.abs(vPerp) / SWING_RADIUS,
        railSpeed: p.velocity.x * _tangent.x + p.velocity.z * _tangent.z,
        u: _u.clone(),
      };
      this.chain++;
      return true;
    }
    return false;
  }

  /** Pendel integrieren + Spieler positionieren. */
  ride(dt: number): void {
    const a = this.active!;
    const p = this.player;

    // Pendelgleichung + Dämpfung
    a.omega += -(GRAVITY / SWING_RADIUS) * Math.sin(a.phi) * dt - SWING_DAMPING * a.omega * dt;

    // Pumpen nahe dem Tiefpunkt: W verstärkt, S bremst
    const moveY = p.currentInput?.moveY ?? 0;
    if (moveY !== 0 && Math.abs(a.phi) < PUMP_PHI) {
      const dir = a.omega >= 0 ? 1 : -1;
      a.omega += moveY * SWING_PUMP * dir * dt;
    }
    a.phi += a.omega * dt;

    // Träge Restbewegung entlang der Stange
    a.railSpeed *= Math.max(0, 1 - 2 * dt);
    a.t = THREE.MathUtils.clamp(a.t + (a.railSpeed * dt) / a.rail.length, 0, 1);

    // Position: Stangenpunkt + Pendelversatz
    a.rail.curve.getPointAt(a.t, _point);
    a.rail.curve.getTangentAt(a.t, _tangent);
    _tangent.setY(0).normalize();
    _offset
      .copy(a.u)
      .multiplyScalar(Math.sin(a.phi) * SWING_RADIUS)
      .addScaledVector(UP, -Math.cos(a.phi) * SWING_RADIUS);
    _pos.copy(_point).add(_offset);
    p.body.setNextKinematicTranslation({ x: _pos.x, y: _pos.y, z: _pos.z });
    p.grounded = false;

    // Ist-Geschwindigkeit spiegeln (Kamera-FOV, Release nutzt sie direkt)
    const vTan = a.omega * SWING_RADIUS;
    p.velocity
      .copy(a.u)
      .multiplyScalar(vTan * Math.cos(a.phi))
      .addScaledVector(UP, vTan * Math.sin(a.phi))
      .addScaledVector(_tangent, a.railSpeed);
  }

  /** Loslassen: Pendelgeschwindigkeit wird Fluggeschwindigkeit. */
  release(): number {
    const a = this.active!;
    this.player.velocity.y += SWING_RELEASE_UP;
    this.cooldownRail = a.rail;
    this.cooldownUntil = performance.now() + SWING_RESNAP_MS;
    this.active = null;
    return this.chain;
  }
}
