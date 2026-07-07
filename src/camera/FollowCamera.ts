import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { PlayerController } from '../player/PlayerController';
import type { InputState } from '../core/Input';
import { SPRINT_SPEED } from '../player/tuning';

const SENSITIVITY = 0.0025; // rad pro Pixel
const DISTANCE = 4.5;
const TARGET_HEIGHT = 1.5;
const PITCH_MIN = (-30 * Math.PI) / 180;
const PITCH_MAX = (60 * Math.PI) / 180;
const FOV_BASE = 60;
const FOV_MAX = 75;
/** Damping-Lambdas (framerate-unabhängig via 1-exp(-lambda*dt)) */
const POS_LAMBDA = 12;
const DIST_IN_LAMBDA = 30; // bei Kollision schnell heranziehen
const DIST_OUT_LAMBDA = 5; // langsam wieder herausgleiten
const FOV_LAMBDA = 6;

const _target = new THREE.Vector3();
const _offsetDir = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });

export class FollowCamera {
  private yaw = Math.PI; // Start: hinter dem Spieler Richtung Level
  private pitch = 0.25;
  private smoothedDist = DISTANCE;
  private currentFov = FOV_BASE;
  private initialized = false;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly player: PlayerController,
  ) {}

  getYaw(): number {
    return this.yaw;
  }

  update(dt: number, input: InputState): void {
    this.yaw -= input.lookDX * SENSITIVITY;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch + input.lookDY * SENSITIVITY,
      PITCH_MIN,
      PITCH_MAX,
    );

    this.player.getPosition(_target).y += TARGET_HEIGHT;

    // Orbit-Richtung (vom Ziel zur Kamera)
    const cp = Math.cos(this.pitch);
    _offsetDir.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);

    // Wand-Kollision: Raycast vom Ziel Richtung Kamera-Sollposition
    _ray.origin.x = _target.x;
    _ray.origin.y = _target.y;
    _ray.origin.z = _target.z;
    _ray.dir.x = _offsetDir.x;
    _ray.dir.y = _offsetDir.y;
    _ray.dir.z = _offsetDir.z;
    const hit = this.player.physics.world.castRay(
      _ray,
      DISTANCE,
      true,
      undefined,
      undefined,
      this.player.collider,
      this.player.body,
    );
    const targetDist = hit ? Math.max(0.5, hit.timeOfImpact * 0.9) : DISTANCE;

    const distLambda = targetDist < this.smoothedDist ? DIST_IN_LAMBDA : DIST_OUT_LAMBDA;
    this.smoothedDist = damp(this.smoothedDist, targetDist, distLambda, dt);

    _desired.copy(_target).addScaledVector(_offsetDir, this.smoothedDist);

    if (!this.initialized) {
      this.camera.position.copy(_desired);
      this.initialized = true;
    } else {
      const k = 1 - Math.exp(-POS_LAMBDA * dt);
      this.camera.position.lerp(_desired, k);
    }
    this.camera.lookAt(_target);

    // Speed-FOV
    const speedT = THREE.MathUtils.clamp(this.player.horizontalSpeed / SPRINT_SPEED, 0, 1);
    const targetFov = FOV_BASE + (FOV_MAX - FOV_BASE) * speedT;
    this.currentFov = damp(this.currentFov, targetFov, FOV_LAMBDA, dt);
    if (Math.abs(this.camera.fov - this.currentFov) > 0.01) {
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }
  }
}

function damp(current: number, target: number, lambda: number, dt: number): number {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));
}
