import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { PlayerController } from './PlayerController';
import {
  CAPSULE_HALFHEIGHT,
  CAPSULE_RADIUS,
  VAULT_COOLDOWN_MS,
  VAULT_MAX_HEIGHT,
  VAULT_MIN_HEIGHT,
  VAULT_MIN_SPEED,
} from './tuning';

const CENTER_TO_FEET = CAPSULE_HALFHEIGHT + CAPSULE_RADIUS;

export interface VaultPlan {
  start: THREE.Vector3;
  control: THREE.Vector3;
  end: THREE.Vector3;
  obstacleHeight: number;
}

const _ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
const _dir = new THREE.Vector3();

/**
 * Vault-Erkennung (Task 12): Hindernis vor dem Spieler (0.5–1.2 m hoch,
 * freier Raum darüber) -> Bogen-Kurve über das Hindernis planen.
 */
export class VaultDetector {
  private readonly plan: VaultPlan = {
    start: new THREE.Vector3(),
    control: new THREE.Vector3(),
    end: new THREE.Vector3(),
    obstacleHeight: 0,
  };
  private lastVaultAt = -Infinity;

  markVaulted(): void {
    this.lastVaultAt = performance.now();
  }

  tryPlan(player: PlayerController): VaultPlan | null {
    if (performance.now() - this.lastVaultAt < VAULT_COOLDOWN_MS) return null;

    const hSpeed = player.horizontalSpeed;
    if (hSpeed < VAULT_MIN_SPEED) return null;
    _dir.set(player.velocity.x, 0, player.velocity.z).divideScalar(hSpeed);

    const c = player.body.translation();
    const feetY = c.y - CENTER_TO_FEET;
    const world = player.physics.world;

    const cast = (ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, len: number) => {
      _ray.origin.x = ox;
      _ray.origin.y = oy;
      _ray.origin.z = oz;
      _ray.dir.x = dx;
      _ray.dir.y = dy;
      _ray.dir.z = dz;
      const hit = world.castRay(_ray, len, true, undefined, undefined, player.collider, player.body);
      return hit ? hit.timeOfImpact : null;
    };

    // 1) Hindernis voraus? (Ray auf Kniehöhe, damit auch 0.5-m-Hindernisse
    //    getroffen werden — die Höhenprüfung unten filtert auf 0.5–1.2 m)
    const dist = cast(c.x, feetY + 0.4, c.z, _dir.x, 0, _dir.z, 1.0);
    if (dist === null) return null;

    // 2) Freier Raum auf Kopfhöhe (bis kurz hinter die Kante)?
    const headBlocked = cast(c.x, feetY + 1.6, c.z, _dir.x, 0, _dir.z, dist + 0.4);
    if (headBlocked !== null) return null;

    // 3) Hindernisoberkante ermitteln (Abwärts-Ray kurz hinter der Vorderkante)
    const topOx = c.x + _dir.x * (dist + 0.2);
    const topOz = c.z + _dir.z * (dist + 0.2);
    const topToi = cast(topOx, feetY + 1.6, topOz, 0, -1, 0, 1.6);
    if (topToi === null) return null;
    const topY = feetY + 1.6 - topToi;
    const obstacleHeight = topY - feetY;
    if (obstacleHeight < VAULT_MIN_HEIGHT || obstacleHeight > VAULT_MAX_HEIGHT) return null;

    // 4) Landepunkt 1.2 m hinter der Vorderkante
    const landOx = c.x + _dir.x * (dist + 1.2);
    const landOz = c.z + _dir.z * (dist + 1.2);
    const landToi = cast(landOx, feetY + 1.8, landOz, 0, -1, 0, 3.5);
    if (landToi === null) return null;
    const landY = feetY + 1.8 - landToi;

    this.plan.start.set(c.x, c.y, c.z);
    this.plan.end.set(landOx, landY + CENTER_TO_FEET, landOz);
    this.plan.control
      .addVectors(this.plan.start, this.plan.end)
      .multiplyScalar(0.5)
      .setY(topY + 0.3 + CENTER_TO_FEET);
    this.plan.obstacleHeight = obstacleHeight;
    return this.plan;
  }
}
