import * as THREE from 'three';
import type { EventBus } from '../core/EventBus';
import type { LevelLoader } from '../level/LevelLoader';
import type { PlayerController } from '../player/PlayerController';

export type Medal = 'gold' | 'silver' | 'bronze' | 'none';

/** Auslöse-Radius der Tore (m) */
const GATE_RADIUS = 1.6;
const ACCENT = '#ff6a00';

const _pos = new THREE.Vector3();

/**
 * Zeitrennen (Task 19): trialStart-Marker startet bei Berührung, die
 * checkpoint-Tore müssen in Reihenfolge durchflogen werden (das nächste
 * leuchtet), finish stoppt die Uhr. R während des Rennens = Neustart am
 * Start. Medaillen aus level.trialTimes. Komplett gekapselt: eigene
 * Tor-Meshes, Timer-Anzeige und Ergebnis-Overlay.
 */
export class TimeTrial {
  private readonly gates: { pos: THREE.Vector3; mesh: THREE.Mesh }[] = [];
  private startPos: THREE.Vector3 | null = null;
  private startMesh: THREE.Mesh | null = null;
  private finishPos: THREE.Vector3 | null = null;
  private finishMesh: THREE.Mesh | null = null;

  private running = false;
  private startedAt = 0;
  private nextIdx = 0;
  private pulse = 0;

  private readonly timerEl: HTMLDivElement;
  private readonly overlayEl: HTMLDivElement;

  constructor(
    scene: THREE.Scene,
    private readonly level: LevelLoader,
    private readonly bus: EventBus,
    private readonly player: PlayerController,
  ) {
    // Checkpoints nach Nummer sortieren (id "cp1", "cp2", …)
    const cps = level.markers
      .filter((m) => m.type === 'checkpoint')
      .sort((a, b) => Number(a.id?.slice(2) ?? 0) - Number(b.id?.slice(2) ?? 0));

    for (const m of cps) {
      const pos = new THREE.Vector3().fromArray(m.pos);
      this.gates.push({ pos, mesh: this.buildGate(scene, pos, 0x30a0e0) });
    }
    for (const m of level.markers) {
      const pos = new THREE.Vector3().fromArray(m.pos);
      if (m.type === 'trialStart') {
        this.startPos = pos;
        this.startMesh = this.buildGate(scene, pos, 0x30e0a0);
      } else if (m.type === 'finish') {
        this.finishPos = pos;
        this.finishMesh = this.buildGate(scene, pos, 0xff6a00);
      }
    }
    // Tore aufs jeweils nächste Ziel ausrichten (Route lesbar machen)
    const chain = [
      ...(this.startPos ? [this.startPos] : []),
      ...this.gates.map((g) => g.pos),
      ...(this.finishPos ? [this.finishPos] : []),
    ];
    const meshes = [
      ...(this.startMesh ? [this.startMesh] : []),
      ...this.gates.map((g) => g.mesh),
      ...(this.finishMesh ? [this.finishMesh] : []),
    ];
    for (let i = 0; i < meshes.length - 1; i++) meshes[i].lookAt(chain[i + 1]);
    if (meshes.length > 1) meshes[meshes.length - 1].lookAt(chain[chain.length - 2]);

    // Timer oben mitte
    const hud = document.getElementById('hud')!;
    this.timerEl = document.createElement('div');
    this.timerEl.style.cssText =
      'position:absolute;top:8px;left:50%;transform:translateX(-50%);padding:4px 14px;' +
      `background:rgba(0,0,0,.55);color:#fff;font:700 20px/1.3 monospace;border-radius:2px;` +
      `border-bottom:2px solid ${ACCENT};display:none;`;
    hud.appendChild(this.timerEl);

    // Ergebnis-Overlay (klickbar)
    this.overlayEl = document.createElement('div');
    this.overlayEl.style.cssText =
      'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);padding:22px 30px;' +
      'background:rgba(0,0,0,.8);color:#fff;font:16px system-ui;border-radius:4px;' +
      `border:1px solid ${ACCENT};text-align:center;display:none;pointer-events:auto;`;
    hud.appendChild(this.overlayEl);

    this.setHighlights();
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** Spieler zum Startring bringen (Menü-Einstieg „Time Trial"). */
  teleportToStart(): void {
    if (this.startPos) this.teleportTo(this.startPos);
  }

  /** Von Game bei gedrücktem R aufgerufen: Rennen neu starten. */
  onRespawn(): void {
    if (!this.running || !this.startPos) return;
    this.teleportTo(this.startPos);
    this.beginRun();
  }

  fixedUpdate(): void {
    if (!this.startPos) return; // Level ohne Zeitrennen
    this.player.getPosition(_pos);

    if (!this.running) {
      if (this.overlayEl.style.display === 'none' && _pos.distanceTo(this.startPos) < GATE_RADIUS) {
        this.beginRun();
      }
      return;
    }

    if (this.nextIdx < this.gates.length) {
      if (_pos.distanceTo(this.gates[this.nextIdx].pos) < GATE_RADIUS) {
        this.nextIdx++;
        this.setHighlights();
      }
    } else if (this.finishPos && _pos.distanceTo(this.finishPos) < GATE_RADIUS) {
      this.finish();
    }
  }

  update(dt: number): void {
    // Nächstes Tor pulsieren lassen
    this.pulse += dt * 4;
    const target = this.running
      ? (this.nextIdx < this.gates.length ? this.gates[this.nextIdx].mesh : this.finishMesh)
      : this.startMesh;
    if (target) {
      const s = 1 + Math.sin(this.pulse) * 0.06;
      target.scale.setScalar(s);
    }

    if (this.running) {
      this.timerEl.textContent = formatMs(performance.now() - this.startedAt);
    }
  }

  private beginRun(): void {
    this.running = true;
    this.startedAt = performance.now();
    this.nextIdx = 0;
    this.timerEl.style.display = 'block';
    this.overlayEl.style.display = 'none';
    this.setHighlights();
  }

  private finish(): void {
    const timeMs = Math.round(performance.now() - this.startedAt);
    this.running = false;
    this.timerEl.textContent = formatMs(timeMs);

    const t = this.level.trialTimes;
    const medal: Medal = !t
      ? 'none'
      : timeMs <= t.gold
        ? 'gold'
        : timeMs <= t.silver
          ? 'silver'
          : timeMs <= t.bronze
            ? 'bronze'
            : 'none';
    this.bus.emit('trial:finished', { timeMs, medal });

    const medalText = { gold: '🥇 GOLD', silver: '🥈 SILBER', bronze: '🥉 BRONZE', none: 'Keine Medaille' }[medal];
    this.overlayEl.innerHTML =
      `<div style="font:700 26px monospace;margin-bottom:6px">${formatMs(timeMs)}</div>` +
      `<div style="font-size:20px;margin-bottom:14px">${medalText}</div>`;
    const mkBtn = (label: string, onClick: () => void) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText =
        `margin:0 6px;padding:8px 18px;background:${ACCENT};border:none;color:#fff;` +
        'font:700 14px system-ui;border-radius:2px;cursor:pointer;';
      b.onclick = onClick;
      this.overlayEl.appendChild(b);
    };
    mkBtn('Retry', () => {
      this.overlayEl.style.display = 'none';
      if (this.startPos) this.teleportTo(this.startPos);
      this.beginRun();
    });
    mkBtn('Free Run', () => {
      this.overlayEl.style.display = 'none';
      this.timerEl.style.display = 'none';
      this.setHighlights();
    });
    this.overlayEl.style.display = 'block';
    document.exitPointerLock();
  }

  /** Nächstes Ziel hell, alles andere gedimmt. */
  private setHighlights(): void {
    const dim = (mesh: THREE.Mesh | null, active: boolean) => {
      if (!mesh) return;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.opacity = active ? 0.9 : 0.35;
      mat.emissiveIntensity = active ? 1.4 : 0.3;
      mesh.scale.setScalar(1);
    };
    this.gates.forEach((g, i) => dim(g.mesh, this.running && i === this.nextIdx));
    dim(this.finishMesh, this.running && this.nextIdx >= this.gates.length);
    dim(this.startMesh, !this.running);
  }

  private buildGate(scene: THREE.Scene, pos: THREE.Vector3, color: number): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(1.5, 0.12, 10, 32),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.3,
        transparent: true,
        opacity: 0.35,
      }),
    );
    mesh.position.copy(pos);
    scene.add(mesh);
    return mesh;
  }

  private teleportTo(pos: THREE.Vector3): void {
    const p = this.player;
    p.body.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
    p.body.setNextKinematicTranslation({ x: pos.x, y: pos.y, z: pos.z });
    p.velocity.set(0, 0, 0);
  }
}

function formatMs(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}
