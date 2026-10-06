import * as THREE from 'three';
import { prepareFactoryPreview, visualTrial } from './FactoryPreview';
import { surfaceFinish } from './SurfaceFinish';
import { cityBoxStyle, prepareCityLook } from './CityLook';
import { cityPBRReady } from './CityPBR';
import { buildCityScenery } from './CityScenery';
import type { BoxData, BoxStyle, LevelData, MarkerData } from './levelTypes';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createStyleMaterial, jitterColor } from './CityFacade';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { TopFace } from '../gameplay/EdgeDetection';

/** Anzahl gecachter Sample-Punkte pro Rail (für Abstands-Queries beim Grind). */
const RAIL_SAMPLES = 50;

export interface LoadedRail {
  balance?: boolean;
  balanceSamples?: boolean[];
  swing: boolean;
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
  /** Medaillen-Zielzeiten fürs Zeitrennen (Task 19), falls im Level definiert */
  trialTimes: { gold: number; silver: number; bronze: number } | null = null;

  private materials = new Map<string, THREE.MeshStandardMaterial>();
  /** Rail-Rohre bis zum Zusammenfassen in ein einziges Mesh (siehe unten). */
  private railGeometries: THREE.BufferGeometry[] = [];

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

    if(levelName==='city01' && visualTrial) {
      try { this.group.add(await prepareCityLook(data)); }
      catch(error) { console.warn('Stadtmaterialien nicht verfügbar; verwende bisherigen Look.',error); }
      try { this.group.add(await prepareFactoryPreview(data)); }
      catch(error) { console.warn('Grafikprobe konnte nicht geladen werden; verwende die vorhandenen Modelle.',error); }
    }
    this.name = data.name;
    this.spawn.fromArray(data.spawn);
    this.trialTimes = data.trialTimes ?? null;

    // Stadt-Batch (17b): pro Stil ein InstancedMesh, Größe und Farbe stecken
    // in der Instanz — unabhängig von den Maßen der einzelnen Box
    const styleGroups = new Map<BoxStyle, BoxData[]>();
    // Instanzierbare Boxen nach size+color bündeln (1 Draw-Call pro Gruppe)
    const instanceGroups = new Map<string, { size: [number, number, number]; color: string; items: typeof data.boxes }>();
    for (const box of data.boxes) {
      // Physical street furniture used to be incorrectly tagged as scenery.
      if (box.solid === false && box.style === 'plain' && box.pos[1] > 0.25 && box.size[1] >= 0.08 && Math.max(...box.size) < 120) {
        box.solid = true;
        // Decorative trim stays physical, but never creates an implicit balance rail.
        // Balance belongs only to deliberately authored rails.
      }
      if (box.invisible) {
        if (box.solid !== false) this.registerBoxPhysics(box.pos, box.size, box.rotY ?? 0, 0);
        continue;
      }
      const style=cityBoxStyle(box);
      if (style) {
        const list = styleGroups.get(style);
        if (list) list.push(box);
        else styleGroups.set(style, [box]);
        continue;
      }
      if (!box.instanced) {
        this.addBox(box.pos, box.size, box.rotY ?? 0, 0, box.color ?? '#9aa0a6', box.solid !== false);
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
    for (const [style, items] of styleGroups) this.addStyledBatch(style, items);
    for (const ramp of data.ramps ?? []) {
      this.addBox(ramp.pos, ramp.size, ramp.rotY ?? 0, ramp.tiltX ?? 0, ramp.color ?? '#8d939c');
    }
    for (const rail of data.rails ?? []) {
      this.addRail(rail.points.map((p) => new THREE.Vector3().fromArray(p)), rail.swing !== false);
    }
    this.mergeRailMeshes();
    if (data.markers) this.markers.push(...data.markers);

    if (data.scenery) {
      this.group.add(buildCityScenery(data.scenery, data.rails, data.boxes, {
        box: (pos,size,rotation) => {
          if (rotation) this.physics.addStaticBox(new THREE.Vector3(...pos),new THREE.Vector3(...size),rotation);
          else this.registerBoxPhysics(pos,size,0,0);
        },
        rail: points => this.addRail(points,false,false),
      }));
      this.physics.addStaticBox(new THREE.Vector3(8,-.22,142),new THREE.Vector3(420,.16,44));
    }
    // Coping or crate trim above broad walking surfaces must not capture a runner.
    for(const rail of this.rails){
      rail.balanceSamples=rail.samples.map(point=>!this.topFaces.some(face=>{
        if(Math.min(face.halfX,face.halfZ)<.16||point.y-face.y<-.65||point.y-face.y>.8)return false;
        const c=Math.cos(face.rotY),s=Math.sin(face.rotY),dx=point.x-face.cx,dz=point.z-face.cz;
        return Math.abs(dx*c-dz*s)<=face.halfX+1&&Math.abs(dx*s+dz*c)<=face.halfZ+1;
      }));
      rail.balance=rail.balanceSamples.filter(Boolean).length>rail.samples.length*.3;
    }
    this.scene.add(this.group);
  }

  private material(color: string): THREE.MeshStandardMaterial {
    let mat = this.materials.get(color);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({ color, roughness: 0.87 });
      const steel=cityPBRReady() && color==='#3a3d42';
      if(steel){mat.metalness=.65;mat.roughness=.72;}
      surfaceFinish(mat, steel ? 'metal' : color === '#343b40' ? 'asphalt' : 'concrete');
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
    solid = true,
  ): void {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), this.material(color));
    mesh.position.fromArray(pos);
    mesh.rotation.set(tiltX, rotY, 0, 'YXZ');
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    if (solid) this.registerBoxPhysics(pos, size, rotY, tiltX);
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

  /**
   * Stadt-Batch (17b): ein InstancedMesh für alle Boxen eines Stils. Die Maße
   * stecken in der Instanz-Skalierung (Geometrie ist ein Einheitswürfel) und
   * zusätzlich in `instanceSize`, damit der Shader das Fensterraster in Metern
   * kachelt. Die Farbe kommt per Instanz-Farbe — bei Fassaden mit leichter
   * ortsabhängiger Streuung, damit nicht alle Nachbarhäuser identisch wirken.
   */
  private addStyledBatch(style: BoxStyle, items: BoxData[], castShadow = true): void {
    // Sub-texel fence wires alias as the shadow camera moves. Posts and crossbars
    // retain shadows; the fine wire geometry remains visible and collidable.
    if (castShadow && items.some(box => box.tag === 'factory-fence-wire')) {
      const wires = items.filter(box => box.tag === 'factory-fence-wire');
      const rest = items.filter(box => box.tag !== 'factory-fence-wire');
      this.addStyledBatch(style, wires, false);
      if (rest.length) this.addStyledBatch(style, rest);
      return;
    }
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      createStyleMaterial(style),
      items.length,
    );
    if (!castShadow) mesh.name = 'Factory fence fine wires';
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;

    const sizes = new Float32Array(items.length * 3);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const base = new THREE.Color();
    const tinted = new THREE.Color();

    for (let i = 0; i < items.length; i++) {
      const box = items[i];
      q.setFromEuler(e.set(0, box.rotY ?? 0, 0, 'YXZ'));
      p.fromArray(box.pos);
      // The mill slab and yard both end at y=0. Separate only their rendered
      // surfaces to prevent z-fighting; retain original collider/ledge heights.
      if (box.tag === 'factory-ground') p.y += 0.012;
      if (box.tag === 'factory-floor') p.y += 0.02;
      m.compose(p, q, s.fromArray(box.size));
      mesh.setMatrixAt(i, m);
      sizes.set(box.size, i * 3);

      base.set(box.color ?? '#9aa0a6');
      mesh.setColorAt(i, style === 'plain' ? base : jitterColor(base, box.pos, tinted));

      if (box.solid !== false) this.registerBoxPhysics(box.pos, box.size, box.rotY ?? 0, 0);
    }
    if (style !== 'plain') {
      mesh.geometry.setAttribute('instanceSize', new THREE.InstancedBufferAttribute(sizes, 3));
    }
    this.group.add(mesh);
  }

  registerBoxPhysics(
    pos: [number, number, number],
    size: [number, number, number],
    rotY: number,
    tiltX: number,
  ): void {
    const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(tiltX, rotY, 0, 'YXZ'));
    const collider = this.physics.addStaticBox(
      new THREE.Vector3().fromArray(pos),
      new THREE.Vector3(...size),
      quat,
    );

    // Deckfläche registrieren: nur ebene Flächen, und keine Riesenflächen
    // wie der Boden (deren „Kanten" sind keine Precision-Ziele)
    if (tiltX === 0 && Math.min(size[0], size[2]) >= 0.06 && Math.min(size[0], size[2]) <= 80) {
      this.topFaces.push({
        cx: pos[0],
        cz: pos[2],
        y: pos[1] + size[1] / 2,
        halfX: size[0] / 2,
        halfZ: size[2] / 2,
        rotY,
        cooldownUntil: 0,
        collider: collider.handle,
      });
    }
  }

  private addRail(points: THREE.Vector3[], swing = true, visible = true): void {
    const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
    if (visible) this.railGeometries.push(new THREE.TubeGeometry(curve, 32, 0.05, 8, false));

    if (visible) for (let i=0;i<16;i++) {
      const a=curve.getPointAt(i/16), b=curve.getPointAt((i+1)/16), direction=b.clone().sub(a);
      this.physics.addStaticBox(a.clone().add(b).multiplyScalar(.5),new THREE.Vector3(.1,direction.length(),.1),
        new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize()));
    }
    this.rails.push({
      swing,
      curve,
      length: curve.getLength(),
      samples: curve.getSpacedPoints(RAIL_SAMPLES - 1),
    });
  }

  /**
   * Alle Rohre zu einem Mesh zusammenfassen. Jede Rail einzeln wäre ein
   * eigener Draw-Call — in der Stadt sind es über siebzig (Geländer,
   * Gerüststangen, Handläufe), und das ist reine Darstellung: die Kurven für
   * Balance und Swing bleiben in `this.rails` getrennt.
   */
  private mergeRailMeshes(): void {
    if (this.railGeometries.length === 0) return;
    const merged = mergeGeometries(this.railGeometries, false);
    for (const g of this.railGeometries) g.dispose();
    this.railGeometries.length = 0;
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, this.material('#3a3d42'));
    mesh.castShadow = true;
    this.group.add(mesh);
  }
}
