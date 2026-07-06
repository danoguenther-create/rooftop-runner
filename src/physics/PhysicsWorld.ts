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
    rotation?: THREE.Quaternion,
  ): RAPIER.Collider {
    let desc = RAPIER.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z);
    if (rotation) {
      desc = desc.setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w });
    }
    const body = this.world.createRigidBody(desc);
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
