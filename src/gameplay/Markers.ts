import * as THREE from 'three';
import type { EventBus } from '../core/EventBus';
import type { LevelLoader } from '../level/LevelLoader';
import type { PlayerController } from '../player/PlayerController';

/** Cooldown pro Marker, damit nichts im Loop feuert (ms) */
const PRECISION_COOLDOWN_MS = 5000;
const GAP_COOLDOWN_MS = 2000;
/** Präzisionslandung: max. horizontaler Abstand zum Markerzentrum (m) */
const PRECISION_RADIUS = 0.4;
/** Präzisionslandung: Mindest-Fallhöhe (m) */
const PRECISION_MIN_FALL = 2;

interface GapZone {
  id: string;
  box: THREE.Box3;
  inside: boolean;
  validAirborne: boolean;
  cooldownUntil: number;
}

interface PrecisionPad {
  id: string;
  center: THREE.Vector3;
  mesh: THREE.Mesh;
  cooldownUntil: number;
  pulse: number;
}

const _pos = new THREE.Vector3();

/**
 * Gap- und Präzisionszonen (Task 14): belohnbare Sprünge.
 * - gap: unsichtbare Zone, komplett in der Luft durchflogen -> trick:gap
 * - precision: leuchtendes Pad, punktgenaue Landung aus >2 m -> trick:precision
 */
export class Markers {
  private gaps: GapZone[] = [];
  private pads: PrecisionPad[] = [];

  constructor(
    scene: THREE.Scene,
    level: LevelLoader,
    private readonly bus: EventBus,
    private readonly player: PlayerController,
  ) {
    const padMaterial = new THREE.MeshStandardMaterial({
      color: 0x30e0a0,
      emissive: 0x30e0a0,
      emissiveIntensity: 0.7,
    });

    for (const m of level.markers) {
      if (m.type === 'gap') {
        const size = new THREE.Vector3(...(m.size ?? [2, 2, 2]));
        const center = new THREE.Vector3(...m.pos);
        this.gaps.push({
          id: m.id ?? `gap-${this.gaps.length}`,
          box: new THREE.Box3().setFromCenterAndSize(center, size),
          inside: false,
          validAirborne: false,
          cooldownUntil: 0,
        });
      } else if (m.type === 'precision') {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 0.06, 1), padMaterial.clone());
        mesh.position.set(m.pos[0], m.pos[1] + 0.03, m.pos[2]);
        scene.add(mesh);
        this.pads.push({
          id: m.id ?? `precision-${this.pads.length}`,
          center: mesh.position.clone(),
          mesh,
          cooldownUntil: 0,
          pulse: 0,
        });
      }
    }

    // Präzisionslandung: beim Wechsel AIR -> RUN prüfen
    bus.on('player:stateChange', ({ from, to }) => {
      if (from === 'AIR' && to === 'RUN') this.checkPrecisionLanding();
    });
  }

  /** Fester Takt: Gap-Zonen gegen die Spielerposition prüfen. */
  fixedUpdate(): void {
    const p = this.player;
    p.getPosition(_pos);
    const airborne = !p.grounded;
    const now = performance.now();

    for (const gap of this.gaps) {
      const contains = gap.box.containsPoint(_pos);
      if (contains && !gap.inside) {
        // Eintritt: zählt nur, wenn bereits in der Luft
        gap.inside = true;
        gap.validAirborne = airborne && now >= gap.cooldownUntil;
      } else if (contains && gap.inside) {
        if (!airborne) gap.validAirborne = false; // zwischendurch gelandet
      } else if (!contains && gap.inside) {
        // Austritt: komplett in der Luft durchflogen?
        gap.inside = false;
        if (gap.validAirborne && airborne) {
          gap.cooldownUntil = now + GAP_COOLDOWN_MS;
          this.bus.emit('trick:gap', { id: gap.id });
        }
      }
    }
  }

  /** Render-Takt: Puls-Animation der Präzisions-Pads. */
  update(dt: number): void {
    for (const pad of this.pads) {
      if (pad.pulse > 0) {
        pad.pulse = Math.max(0, pad.pulse - dt * 2);
        const s = 1 + pad.pulse * 0.6;
        pad.mesh.scale.set(s, 1, s);
        (pad.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity =
          0.7 + pad.pulse * 2;
      }
    }
  }

  private checkPrecisionLanding(): void {
    const p = this.player;
    if (p.lastFallHeight < PRECISION_MIN_FALL) return;
    p.getPosition(_pos);
    const now = performance.now();

    for (const pad of this.pads) {
      if (now < pad.cooldownUntil) continue;
      const dx = _pos.x - pad.center.x;
      const dz = _pos.z - pad.center.z;
      const dy = Math.abs(_pos.y - pad.center.y);
      if (dx * dx + dz * dz <= PRECISION_RADIUS * PRECISION_RADIUS && dy < 1.5) {
        pad.cooldownUntil = now + PRECISION_COOLDOWN_MS;
        pad.pulse = 1;
        this.bus.emit('trick:precision', { id: pad.id });
      }
    }
  }
}
