import RAPIER from '@dimforge/rapier3d-compat';
import type * as THREE from 'three';

/**
 * Kapselt die Rapier-Welt. Gravitation -20 statt -9.81 ist Absicht:
 * Spiel-Gravitation für knackiges Sprunggefühl (siehe tuning.ts ab Task 6).
 */
export class PhysicsWorld {
  world!: RAPIER.World;

  async init(): Promise<void> {
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -20, z: 0 });
  }

  /** Wird von Game.fixedUpdate mit festem 1/60-Takt aufgerufen. */
  step(): void {
    this.world.step();
  }

  addStaticBox(
    position: THREE.Vector3,
    size: THREE.Vector3,
    rotationY: number,
  ): RAPIER.Collider {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(position.x, position.y, position.z)
        .setRotation(yawToQuat(rotationY)),
    );
    return this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2),
      body,
    );
  }

  addDynamicBox(
    position: THREE.Vector3,
    size: THREE.Vector3,
  ): { rigidBody: RAPIER.RigidBody; collider: RAPIER.Collider } {
    const rigidBody = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(position.x, position.y, position.z),
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2).setDensity(1),
      rigidBody,
    );
    return { rigidBody, collider };
  }
}

function yawToQuat(yaw: number): RAPIER.Rotation {
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}
