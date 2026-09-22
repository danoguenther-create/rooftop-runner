import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import type { PlayerController } from "./PlayerController";
import {
  CAPSULE_HALFHEIGHT,
  CAPSULE_RADIUS,
  VAULT_COOLDOWN_MS,
  VAULT_MAX_HEIGHT,
  VAULT_MIN_HEIGHT,
  VAULT_MIN_SPEED,
} from "./tuning";
import { simNow } from "../core/SimClock";

const CENTER_TO_FEET = CAPSULE_HALFHEIGHT + CAPSULE_RADIUS;

export interface VaultPlan {
  start: THREE.Vector3;
  control: THREE.Vector3;
  end: THREE.Vector3;
  obstacleHeight: number;
  contact: THREE.Vector3;
  direction: THREE.Vector3;
  duration: number;
  kind: "speed" | "kong";
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
    contact: new THREE.Vector3(),
    direction: new THREE.Vector3(),
    duration: 0.6,
    kind: "speed",
  };
  private lastVaultAt = -Infinity;

  markVaulted(): void {
    this.lastVaultAt = simNow();
  }

  tryPlan(player: PlayerController): VaultPlan | null {
    if (simNow() - this.lastVaultAt < VAULT_COOLDOWN_MS) return null;

    const hSpeed = player.horizontalSpeed;
    if (hSpeed < VAULT_MIN_SPEED) return null;
    _dir.set(player.velocity.x, 0, player.velocity.z).divideScalar(hSpeed);

    const c = player.body.translation();
    const feetY = c.y - CENTER_TO_FEET;
    const world = player.physics.world;

    const cast = (
      ox: number,
      oy: number,
      oz: number,
      dx: number,
      dy: number,
      dz: number,
      len: number,
    ) => {
      _ray.origin.x = ox;
      _ray.origin.y = oy;
      _ray.origin.z = oz;
      _ray.dir.x = dx;
      _ray.dir.y = dy;
      _ray.dir.z = dz;
      const hit = world.castRay(
        _ray,
        len,
        true,
        undefined,
        undefined,
        player.collider,
        player.body,
      );
      return hit ? hit.timeOfImpact : null;
    };

    // 1) Hindernis voraus? (Ray auf Kniehöhe, damit auch 0.5-m-Hindernisse
    //    getroffen werden — die Höhenprüfung unten filtert auf 0.5–1.2 m)
    const dist = cast(c.x, feetY + 0.4, c.z, _dir.x, 0, _dir.z, 1.0);
    if (dist === null) return null;

    // 2) Freier Raum auf Kopfhöhe (bis kurz hinter die Kante)?
    const headBlocked = cast(
      c.x,
      feetY + 1.6,
      c.z,
      _dir.x,
      0,
      _dir.z,
      dist + 0.4,
    );
    if (headBlocked !== null) return null;

    // 3) Hindernisoberkante ermitteln (Abwärts-Ray kurz hinter der Vorderkante)
    const topOx = c.x + _dir.x * (dist + 0.2);
    const topOz = c.z + _dir.z * (dist + 0.2);
    const topToi = cast(topOx, feetY + 1.6, topOz, 0, -1, 0, 1.6);
    if (topToi === null) return null;
    const topY = feetY + 1.6 - topToi;
    const obstacleHeight = topY - feetY;
    if (obstacleHeight < VAULT_MIN_HEIGHT || obstacleHeight > VAULT_MAX_HEIGHT)
      return null;

    // Scan through the obstacle at just below its top. A fixed 1.2 m
    // landing point stopped inside cars and deep blocks.
    let exit = dist + 0.2;
    let foundExit = false;
    for (let d = dist + 0.3; d <= dist + 3.8; d += 0.1) {
      const top = cast(
        c.x + _dir.x * d,
        topY + 0.08,
        c.z + _dir.z * d,
        0,
        -1,
        0,
        0.18,
      );
      if (top === null) {
        exit = d;
        foundExit = true;
        break;
      }
    }
    if (!foundExit) return null; // a roof or long wall is a climb, not a vault
    const landingDistance = exit + CAPSULE_RADIUS + 0.3;
    const landOx = c.x + _dir.x * landingDistance;
    const landOz = c.z + _dir.z * landingDistance;
    const landToi = cast(landOx, topY + 1.8, landOz, 0, -1, 0, 4.0);
    if (landToi === null) return null;
    const landY = topY + 1.8 - landToi;
    if (landY > topY - 0.15) return null;
    // Reject a blocked landing column instead of teleporting through it.
    if (cast(landOx, landY + 0.1, landOz, 0, 1, 0, 1.7) !== null) return null;

    this.plan.start.set(c.x, c.y, c.z);
    this.plan.end.set(landOx, landY + CENTER_TO_FEET + 0.025, landOz);
    this.plan.contact.set(topOx, topY + 0.035, topOz);
    this.plan.direction.copy(_dir);
    this.plan.kind = exit - dist > 1.15 ? "kong" : "speed";
    this.plan.duration = THREE.MathUtils.clamp(
      landingDistance / Math.max(hSpeed, 4),
      0.52,
      0.85,
    );
    // Bezier control is twice the desired midpoint height minus endpoints.
    const apex = topY + CENTER_TO_FEET + 0.22;
    this.plan.control
      .addVectors(this.plan.start, this.plan.end)
      .multiplyScalar(0.5);
    this.plan.control.y = 2 * apex - (c.y + this.plan.end.y) * 0.5;
    this.plan.obstacleHeight = obstacleHeight;
    return this.plan;
  }
}
