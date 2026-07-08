import * as THREE from 'three';
import type { EventBus } from '../core/EventBus';
import type { PlayerController } from '../player/PlayerController';
import {
  EDGE_PRECISION_COOLDOWN_MS,
  EDGE_PRECISION_DIST,
  EDGE_PRECISION_MIN_FALL_M,
  EDGE_PRECISION_SETTLE_S,
  EDGE_PRECISION_SETTLE_SPEED,
} from '../player/tuning';

/** Begehbare Deckfläche einer Level-Box (achsenparallel oder um Y gedreht). */
export interface TopFace {
  cx: number;
  cz: number;
  y: number;
  halfX: number;
  halfZ: number;
  rotY: number;
  cooldownUntil: number;
}

const _pos = new THREE.Vector3();

/**
 * Kanten-Precision (Task 15c): Echte Precision-Jumps zielen auf Kanten.
 * Landung aus >= 2 m Fall näher als EDGE_PRECISION_DIST an der Oberkante
 * einer beliebigen Plattform + Sprung sauber gestanden (Tempo binnen
 * EDGE_PRECISION_SETTLE_S unter Kontrolle) -> trick:precision, ganz ohne
 * Marker. Die Flächen kommen aus der Box-Level-Geometrie — dieselbe
 * Infrastruktur nutzt später die Ledge-Erkennung fürs Klettern (M3.5).
 */
export class EdgePrecision {
  private watch: { face: TopFace; remaining: number } | null = null;

  constructor(
    private readonly faces: TopFace[],
    private readonly player: PlayerController,
    private readonly bus: EventBus,
  ) {
    bus.on('player:stateChange', ({ from, to }) => {
      if (from === 'AIR' && to === 'RUN') this.onLanding();
      else this.watch = null; // jeder andere Wechsel bricht die Prüfung ab
    });
  }

  /** Im Physik-Takt: löst das „Sprung stehen"-Fenster auf. */
  fixedUpdate(dt: number): void {
    const watch = this.watch;
    if (!watch) return;

    if (this.player.horizontalSpeed < EDGE_PRECISION_SETTLE_SPEED) {
      watch.face.cooldownUntil = performance.now() + EDGE_PRECISION_COOLDOWN_MS;
      this.watch = null;
      this.bus.emit('trick:precision', { id: 'edge' });
      return;
    }
    watch.remaining -= dt;
    if (watch.remaining <= 0) this.watch = null;
  }

  private onLanding(): void {
    if (this.player.lastFallHeight < EDGE_PRECISION_MIN_FALL_M) return;

    this.player.getPosition(_pos);
    const hit = this.nearestEdge(_pos);
    if (!hit || hit.dist > EDGE_PRECISION_DIST) return;
    if (performance.now() < hit.face.cooldownUntil) return;

    this.watch = { face: hit.face, remaining: EDGE_PRECISION_SETTLE_S };
  }

  /** Fläche direkt unter dem Punkt + horizontale Distanz zur nächsten Kante. */
  private nearestEdge(pos: THREE.Vector3): { face: TopFace; dist: number } | null {
    let best: { face: TopFace; dist: number } | null = null;

    for (const face of this.faces) {
      // Steht der Spieler auf dieser Fläche? (Füße ~ Flächenhöhe)
      const feetY = pos.y - 0.9; // CENTER_TO_FEET
      if (Math.abs(feetY - face.y) > 0.5) continue;

      // In lokale (um -rotY gedrehte) Flächen-Koordinaten
      const dx = pos.x - face.cx;
      const dz = pos.z - face.cz;
      const cos = Math.cos(-face.rotY);
      const sin = Math.sin(-face.rotY);
      const lx = dx * cos - dz * sin;
      const lz = dx * sin + dz * cos;
      if (Math.abs(lx) > face.halfX || Math.abs(lz) > face.halfZ) continue;

      const dist = Math.min(face.halfX - Math.abs(lx), face.halfZ - Math.abs(lz));
      if (!best || dist < best.dist) best = { face, dist };
    }
    return best;
  }
}
