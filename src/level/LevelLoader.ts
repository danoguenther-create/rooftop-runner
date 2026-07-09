import * as THREE from 'three';
import type { LevelData, MarkerData } from './levelTypes';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { TopFace } from '../gameplay/EdgeDetection';

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
  /** Begehbare Deckflächen für Kanten-Precision (15c) und Ledge-Grab (M3.5) */
  readonly topFaces: TopFace[] = [];
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

    // Instanzierbare Boxen nach size+color bündeln (1 Draw-Call pro Gruppe)
    const instanceGroups = new Map<string, { size: [number, number, number]; color: string; items: typeof data.boxes }>();
    for (const box of data.boxes) {
      if (!box.instanced) {
        this.addBox(box.pos, box.size, box.rotY ?? 0, 0, box.color ?? '#9aa0a6');
        continue;
      }
      const color = box.color ?? '#9aa0a6';
      const key = `${box.size.join(',')}|${color}`;
      let group = instanceGroups.get(key);
      if (!group) {
        group = { size: box.size, color, items: [] };
        instanceGroups.set(key, group);
      }
      group.items.push(box);
    }
    for (const group of instanceGroups.values()) this.addInstancedBoxes(group);
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
    this.registerBoxPhysics(pos, size, rotY, tiltX);
  }

  /** Gebündelte Boxen: 1 InstancedMesh, Collider + Deckflächen einzeln. */
  private addInstancedBoxes(group: {
    size: [number, number, number];
    color: string;
    items: { pos: [number, number, number]; rotY?: number }[];
  }): void {
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(...group.size),
      this.material(group.color),
      group.items.length,
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < group.items.length; i++) {
      const item = group.items[i];
      q.setFromEuler(new THREE.Euler(0, item.rotY ?? 0, 0, 'YXZ'));
      m.compose(p.fromArray(item.pos), q, s);
      mesh.setMatrixAt(i, m);
      this.registerBoxPhysics(item.pos, group.size, item.rotY ?? 0, 0);
    }
    this.group.add(mesh);
  }

  private registerBoxPhysics(
    pos: [number, number, number],
    size: [number, number, number],
    rotY: number,
    tiltX: number,
  ): void {
    const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(tiltX, rotY, 0, 'YXZ'));
    this.physics.addStaticBox(
      new THREE.Vector3().fromArray(pos),
      new THREE.Vector3(...size),
      quat,
    );

    // Deckfläche registrieren: nur ebene Flächen, und keine Riesenflächen
    // wie der Boden (deren „Kanten" sind keine Precision-Ziele)
    if (tiltX === 0 && Math.min(size[0], size[2]) / 2 <= 10) {
      this.topFaces.push({
        cx: pos[0],
        cz: pos[2],
        y: pos[1] + size[1] / 2,
        halfX: size[0] / 2,
        halfZ: size[2] / 2,
        rotY,
        cooldownUntil: 0,
      });
    }
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
