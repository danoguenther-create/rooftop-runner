import * as THREE from 'three';
import type { LevelData, MarkerData } from './levelTypes';
import type { PhysicsWorld } from '../physics/PhysicsWorld';

/** Anzahl gecachter Sample-Punkte pro Rail (für Abstands-Queries beim Grind). */
const RAIL_SAMPLES = 50;

export interface LoadedRail {
  curve: THREE.CatmullRomCurve3;
  /** Bogenlänge in Metern (gecacht) */
  length: number;
  /** RAIL_SAMPLES gleichmäßig verteilte Punkte (gecacht) */
  samples: THREE.Vector3[];
}

/**
 * Baut aus einer Level-JSON die sichtbare Szene (Meshes) und die
 * Physik-Welt (statische Collider). Rails bekommen KEINE Collider —
 * Grinding ist rein kinematisch (Task 13).
 */
export class LevelLoader {
  readonly group = new THREE.Group();
  readonly rails: LoadedRail[] = [];
  readonly markers: MarkerData[] = [];
  readonly spawn = new THREE.Vector3(0, 1, 0);
  name = '';

  private materials = new Map<string, THREE.MeshLambertMaterial>();

  constructor(
    private scene: THREE.Scene,
    private physics: PhysicsWorld,
  ) {}

  async load(levelName: string): Promise<void> {
    const url = `${import.meta.env.BASE_URL}levels/${levelName}.json`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Level "${levelName}" nicht ladbar (${res.status}) — ${url}`);
    }
    const data = (await res.json()) as LevelData;

    this.name = data.name;
    this.spawn.fromArray(data.spawn);

    for (const box of data.boxes) {
      this.addBox(box.pos, box.size, box.rotY ?? 0, 0, box.color ?? '#9aa0a6');
    }
    for (const ramp of data.ramps ?? []) {
      this.addBox(ramp.pos, ramp.size, ramp.rotY ?? 0, ramp.tiltX ?? 0, ramp.color ?? '#8d939c');
    }
    for (const rail of data.rails ?? []) {
      this.addRail(rail.points.map((p) => new THREE.Vector3().fromArray(p)));
    }
    if (data.markers) this.markers.push(...data.markers);

    this.scene.add(this.group);
  }

  private material(color: string): THREE.MeshLambertMaterial {
    let mat = this.materials.get(color);
    if (!mat) {
      mat = new THREE.MeshLambertMaterial({ color });
      this.materials.set(color, mat);
    }
    return mat;
  }

  private addBox(
    pos: [number, number, number],
    size: [number, number, number],
    rotY: number,
    tiltX: number,
    color: string,
  ): void {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), this.material(color));
    mesh.position.fromArray(pos);
    mesh.rotation.set(tiltX, rotY, 0, 'YXZ');
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);

    const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(tiltX, rotY, 0, 'YXZ'));
    this.physics.addStaticBox(mesh.position, new THREE.Vector3(...size), quat);
  }

  private addRail(points: THREE.Vector3[]): void {
    const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 32, 0.05, 8, false),
      this.material('#3a3d42'),
    );
    tube.castShadow = true;
    this.group.add(tube);

    this.rails.push({
      curve,
      length: curve.getLength(),
      samples: curve.getSpacedPoints(RAIL_SAMPLES - 1),
    });
  }
}
