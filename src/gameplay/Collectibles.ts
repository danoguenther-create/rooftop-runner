import * as THREE from 'three';
import type { EventBus } from '../core/EventBus';
import type { LevelLoader } from '../level/LevelLoader';
import type { PlayerController } from '../player/PlayerController';

/** Sammelradius: Abstand Spielerzentrum -> Objektzentrum (m) */
const PICKUP_DIST = 1;
/** Schwebeamplitude (m) */
const FLOAT_AMPLITUDE = 0.15;
/** Schwebegeschwindigkeit (rad/s) */
const FLOAT_SPEED = 2;
/** Rotationsgeschwindigkeit (rad/s) */
const ROTATE_SPEED = 1.5;
/** Dauer der Pop-Animation beim Einsammeln (s) */
const POP_DURATION_S = 0.25;
/** Zielskalierung während des Pops */
const POP_SCALE = 1.6;

interface CollectibleItem {
  id: string;
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  baseY: number;
  phase: number;
  popT: number;
  popping: boolean;
}

const _pos = new THREE.Vector3();

/**
 * Sammelobjekte (Task 18): schwebende, rotierende Oktaeder aus level.markers
 * (type 'collectible'). Aufsammeln per Distanzcheck im Physik-Takt (analog
 * Markers.ts) — Punkte/HUD-Zähler laufen rein über den EventBus
 * ('collect:pickup'), keine direkten Querverweise zu anderen Systemen.
 */
export class Collectibles {
  private items: CollectibleItem[] = [];
  private readonly collected = new Set<string>();
  /** Ursprüngliche Gesamtzahl — bleibt konstant, auch wenn Objekte verschwinden. */
  private readonly totalCount: number;

  constructor(
    private readonly scene: THREE.Scene,
    level: LevelLoader,
    private readonly bus: EventBus,
    private readonly player: PlayerController,
  ) {
    const geometry = new THREE.OctahedronGeometry(0.35);
    let index = 0;

    for (const m of level.markers) {
      if (m.type !== 'collectible') continue;

      const material = new THREE.MeshStandardMaterial({
        color: 0xff6a00,
        emissive: 0xff6a00,
        emissiveIntensity: 1.2,
        transparent: true,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...m.pos);
      scene.add(mesh);

      this.items.push({
        id: m.id ?? `collect-${index}`,
        mesh,
        material,
        baseY: m.pos[1],
        phase: index * 0.7, // Phasenversatz je Instanz, damit nicht alle synchron schweben
        popT: 0,
        popping: false,
      });
      index++;
    }

    this.totalCount = this.items.length;
  }

  /** Gesamtzahl der Sammelobjekte im Level (konstant, unabhängig vom Fortschritt). */
  get total(): number {
    return this.totalCount;
  }

  /** IDs bereits eingesammelter Objekte. */
  getCollected(): Set<string> {
    return new Set(this.collected);
  }

  /**
   * Für den Spielstand (Task 24): bereits eingesammelte Objekte sofort ohne
   * Pop-Animation entfernen (z. B. beim Laden eines Spielstands).
   */
  setCollected(ids: string[]): void {
    for (const id of ids) {
      if (this.collected.has(id)) continue;
      const item = this.items.find((it) => it.id === id);
      if (!item) continue;
      this.collected.add(id);
      this.scene.remove(item.mesh);
    }
    this.items = this.items.filter((it) => !this.collected.has(it.id));
  }

  /** Fester Takt: Distanz zum Spieler prüfen, ggf. einsammeln. */
  fixedUpdate(): void {
    if (this.items.length === 0) return;
    this.player.getPosition(_pos);

    for (const item of this.items) {
      if (item.popping) continue;
      if (item.mesh.position.distanceTo(_pos) >= PICKUP_DIST) continue;

      item.popping = true;
      item.popT = 0;
      this.collected.add(item.id);
      this.bus.emit('collect:pickup', {
        id: item.id,
        collected: this.collected.size,
        total: this.totalCount,
      });
    }
  }

  /** Render-Takt: Rotation, Auf-Ab-Schweben, Pop-Ausblenden beim Einsammeln. */
  update(dt: number): void {
    const now = performance.now() / 1000;

    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];

      if (item.popping) {
        item.popT += dt;
        const t = Math.min(1, item.popT / POP_DURATION_S);
        const scale = 1 + (POP_SCALE - 1) * t;
        item.mesh.scale.setScalar(scale);
        item.material.opacity = 1 - t;
        if (t >= 1) {
          this.scene.remove(item.mesh);
          this.items.splice(i, 1);
        }
        continue;
      }

      item.mesh.rotation.y += dt * ROTATE_SPEED;
      item.mesh.position.y =
        item.baseY + Math.sin(now * FLOAT_SPEED + item.phase) * FLOAT_AMPLITUDE;
    }
  }
}
