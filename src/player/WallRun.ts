import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { PlayerController } from './PlayerController';
import { WALLRUN_MIN_SPEED, WALLRUN_RAY_LEN } from './tuning';

export type WallSide = 'left' | 'right';

export interface WallHit {
  side: WallSide;
  /** Wandnormale (zeigt von der Wand weg, horizontal) */
  normal: THREE.Vector3;
  /** Trefferpunkt an der Wand */
  point: THREE.Vector3;
}

const _ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
const _moveDir = new THREE.Vector3();
const _sideDir = new THREE.Vector3();
const _tangent = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Wall-Run-Erkennung (Task 10): zwei horizontale Raycasts senkrecht zur
 * Bewegungsrichtung. Gültig nur bei annähernd vertikaler Wand, genug
 * Tempo und Lauf-entlang-Winkel (< 45° zur Wandtangente).
 */
export class WallRunDetector {
  private readonly result: WallHit = {
    side: 'left',
    normal: new THREE.Vector3(),
    point: new THREE.Vector3(),
  };

  /** Prüft beide Seiten; bei Doppeltreffer gewinnt die nähere Wand. */
  check(player: PlayerController): WallHit | null {
    const hSpeed = player.horizontalSpeed;
    if (hSpeed < WALLRUN_MIN_SPEED) return null;

    _moveDir.set(player.velocity.x, 0, player.velocity.z).divideScalar(hSpeed);
    // rechts = moveDir x up
    _sideDir.set(-_moveDir.z, 0, _moveDir.x);

    const right = this.castSide(player, 1);
    const rightToi = right;
    const left = this.castSide(player, -1);

    let sign: 1 | -1 | 0 = 0;
    if (rightToi !== null && left !== null) sign = rightToi <= left ? 1 : -1;
    else if (rightToi !== null) sign = 1;
    else if (left !== null) sign = -1;
    if (sign === 0) return null;

    // Finale Seite nochmal casten, um normal/point im Ergebnis zu haben
    if (this.castSide(player, sign, this.result) === null) return null;
    this.result.side = sign === 1 ? 'right' : 'left';

    // Wand muss annähernd vertikal sein
    if (Math.abs(this.result.normal.y) >= 0.3) return null;

    // Man läuft an der Wand entlang, nicht frontal dagegen:
    // Winkel zwischen Bewegungsrichtung und Wandtangente < 45°
    _tangent.crossVectors(this.result.normal, UP).normalize();
    if (Math.abs(_moveDir.dot(_tangent)) < Math.SQRT1_2) return null;

    return this.result;
  }

  /** Nur eine Seite prüfen (für die Fortsetzung im WALLRUN-Zustand). */
  checkSide(player: PlayerController, side: WallSide): WallHit | null {
    const hSpeed = player.horizontalSpeed;
    if (hSpeed < 0.5) return null;
    _moveDir.set(player.velocity.x, 0, player.velocity.z).divideScalar(hSpeed);
    _sideDir.set(-_moveDir.z, 0, _moveDir.x);

    if (this.castSide(player, side === 'right' ? 1 : -1, this.result) === null) return null;
    if (Math.abs(this.result.normal.y) >= 0.3) return null;
    this.result.side = side;
    return this.result;
  }

  /** Raycast auf Brusthöhe zur Seite; liefert Distanz oder null. */
  private castSide(player: PlayerController, sign: 1 | -1, out?: WallHit): number | null {
    const t = player.body.translation();
    _ray.origin.x = t.x;
    _ray.origin.y = t.y + 0.3; // Brusthöhe
    _ray.origin.z = t.z;
    _ray.dir.x = _sideDir.x * sign;
    _ray.dir.y = 0;
    _ray.dir.z = _sideDir.z * sign;

    const hit = player.physics.world.castRayAndGetNormal(
      _ray,
      WALLRUN_RAY_LEN,
      true,
      undefined,
      undefined,
      player.collider,
      player.body,
    );
    if (!hit) return null;
    if (out) {
      out.normal.set(hit.normal.x, hit.normal.y, hit.normal.z);
      out.point.set(
        _ray.origin.x + _ray.dir.x * hit.timeOfImpact,
        _ray.origin.y,
        _ray.origin.z + _ray.dir.z * hit.timeOfImpact,
      );
    }
    return hit.timeOfImpact;
  }
}
