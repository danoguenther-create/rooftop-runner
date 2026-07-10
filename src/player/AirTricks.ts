import type * as THREE from 'three';
import type { EventBus } from '../core/EventBus';
import {
  FLIP_COMPLETE_MIN,
  FLIP_DURATION_S,
  FLIP_MAX_COUNT,
  GAINER_MIN_SPEED,
  SPIN_FORGIVE_DEG,
  SPIN_SPEED_DEG,
} from './tuning';

export type FlipKind = 'front' | 'back' | 'left' | 'right';

/**
 * Lufttricks (Task 15b): Flips (Pfeiltasten, mehrfach queuebar) und
 * Spins (Q/E, 180°-Schritte). Rein visuell aufs Mesh — die Physik-Kapsel
 * rotiert nie. Die Landung wertet aus: unfertige Flip-Rotation = Bail.
 */
export class AirTricks {
  private flipKind: FlipKind | null = null;
  /** Queuebare Soll-Umdrehungen (1..FLIP_MAX_COUNT) */
  private flipTarget = 0;
  /** Ist-Fortschritt in Umdrehungen */
  private flipProgress = 0;
  private spinTargetDeg = 0;
  private spinDeg = 0;

  get active(): boolean {
    return this.flipKind !== null || this.spinTargetDeg !== 0;
  }

  /** Pfeiltaste: Flip starten bzw. weitere Umdrehung anhängen. */
  queueFlip(kind: FlipKind): void {
    if (!this.flipKind) {
      this.flipKind = kind;
      this.flipTarget = 1;
      this.flipProgress = 0;
    } else if (this.flipKind === kind && this.flipTarget < FLIP_MAX_COUNT) {
      this.flipTarget++;
    }
    // Andere Richtung während der Rotation: ignorieren (kein Richtungswechsel)
  }

  /** Q/E: 180° Soll-Rotation um die Hochachse anhängen. */
  queueSpin(dir: -1 | 1): void {
    this.spinTargetDeg += dir * 180;
  }

  /** Im Physik-Takt, solange der Spieler in der Luft ist. */
  update(dt: number): void {
    if (this.flipKind && this.flipProgress < this.flipTarget) {
      this.flipProgress = Math.min(this.flipProgress + dt / FLIP_DURATION_S, this.flipTarget);
    }
    if (this.spinDeg !== this.spinTargetDeg) {
      const diff = this.spinTargetDeg - this.spinDeg;
      this.spinDeg += Math.sign(diff) * Math.min(Math.abs(diff), SPIN_SPEED_DEG * dt);
    }
  }

  /** Nach mesh.rotation.y = meshYaw aufrufen — addiert Spin + Flip-Pose. */
  applyVisual(mesh: THREE.Group): void {
    mesh.rotation.y += (this.spinDeg * Math.PI) / 180;
    const angle = this.flipProgress * Math.PI * 2;
    switch (this.flipKind) {
      case 'front':
        mesh.rotation.x = angle;
        break;
      case 'back':
        mesh.rotation.x = -angle;
        break;
      // Lokales +z zeigt nach vorn: positive z-Rotation kippt den Kopf zur
      // RECHTEN Schulter (Spieler-Feedback 2026-07-10, war vertauscht)
      case 'left':
        mesh.rotation.z = -angle;
        break;
      case 'right':
        mesh.rotation.z = angle;
        break;
      default:
        mesh.rotation.x = 0;
        mesh.rotation.z = 0;
    }
  }

  /**
   * Bei der Landung auswerten. Emittiert trick:flip/trick:spin und
   * liefert true, wenn die unfertige Flip-Rotation einen Bail erzwingt.
   */
  evaluateLanding(bus: EventBus, horizontalSpeed: number): boolean {
    let bail = false;

    if (this.flipKind) {
      const lastTurnProgress = this.flipProgress - (this.flipTarget - 1);
      if (lastTurnProgress >= FLIP_COMPLETE_MIN) {
        bus.emit('trick:flip', {
          kind: this.flipKind,
          count: this.flipTarget,
          gainer: this.flipKind === 'back' && horizontalSpeed > GAINER_MIN_SPEED,
        });
      } else {
        bail = true;
      }
    }

    if (!bail) {
      const halfTurns = Math.floor((Math.abs(this.spinDeg) + SPIN_FORGIVE_DEG) / 180);
      if (halfTurns >= 1) bus.emit('trick:spin', { halfTurns });
    }

    this.cancel();
    return bail;
  }

  /** Rotation verwerfen (Respawn, Zustandswechsel in WALLRUN/GRIND/VAULT). */
  cancel(): void {
    this.flipKind = null;
    this.flipTarget = 0;
    this.flipProgress = 0;
    this.spinTargetDeg = 0;
    this.spinDeg = 0;
  }
}
