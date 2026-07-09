import type { EventBus } from '../core/EventBus';
import type { TimeTrial } from './TimeTrial';

const ACCENT = '#ff6a00';

interface ScoreMission {
  id: string;
  title: string;
  type: 'score';
  target: number;
  timeLimitS: number;
}
interface CollectMission {
  id: string;
  title: string;
  type: 'collect';
  ids: string[];
  timeLimitS: number;
}
interface ComboMission {
  id: string;
  title: string;
  type: 'combo';
  targetMultiplier: number;
}
export type MissionDef = ScoreMission | CollectMission | ComboMission;

interface ActiveMission {
  def: MissionDef;
  remainingS: number;
  /** score: Punkte bei Start; collect: bereits gezählte ids */
  scoreAtStart: number;
  collected: Set<string>;
}

/**
 * Missionssystem (Task 20): datengetrieben aus <level>.missions.json,
 * drei Typen (score/collect/combo), ohne Skript-Engine. Tasten 1-3
 * starten Mission 1-3 (nur außerhalb aktiver Mission/Rennen). Erfolge
 * landen in einem Set (Persistenz kommt mit Task 24).
 */
export class Missions {
  private defs: MissionDef[] = [];
  private active: ActiveMission | null = null;
  private readonly completed = new Set<string>();

  private scoreTotal = 0;
  private lastComboMultiplier = 0;

  private readonly panelEl: HTMLDivElement;
  private readonly overlayEl: HTMLDivElement;

  constructor(
    private readonly bus: EventBus,
    private readonly trial: TimeTrial,
  ) {
    const hud = document.getElementById('hud')!;
    // Missionsziel + Fortschritt + Restzeit (oben mitte, unter dem Trial-Timer)
    this.panelEl = document.createElement('div');
    this.panelEl.style.cssText =
      'position:absolute;top:42px;left:50%;transform:translateX(-50%);padding:5px 14px;' +
      `background:rgba(0,0,0,.55);color:#fff;font:13px system-ui;border-radius:2px;` +
      `border-left:3px solid ${ACCENT};display:none;text-align:center;white-space:pre;`;
    hud.appendChild(this.panelEl);

    this.overlayEl = document.createElement('div');
    this.overlayEl.style.cssText =
      'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);padding:22px 30px;' +
      'background:rgba(0,0,0,.8);color:#fff;font:16px system-ui;border-radius:4px;' +
      `border:1px solid ${ACCENT};text-align:center;display:none;pointer-events:auto;`;
    hud.appendChild(this.overlayEl);

    bus.on('score:total', ({ total }) => {
      this.scoreTotal = total;
      if (this.active?.def.type === 'score') this.checkScore();
    });
    bus.on('score:combo', ({ multiplier, active }) => {
      if (active) this.lastComboMultiplier = multiplier;
    });
    bus.on('score:banked', () => {
      const def = this.active?.def;
      if (def?.type === 'combo' && this.lastComboMultiplier >= def.targetMultiplier) {
        this.finish(true);
      }
    });
    bus.on('collect:pickup', ({ id }) => {
      const a = this.active;
      if (a?.def.type === 'collect' && a.def.ids.includes(id)) {
        a.collected.add(id);
        if (a.collected.size >= a.def.ids.length) this.finish(true);
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') {
        const idx = Number(e.code.slice(-1)) - 1;
        if (!this.active && !this.trial.isRunning && this.defs[idx]) {
          this.start(this.defs[idx].id);
        }
      }
    });
  }

  /** Missionsdefinitionen des Levels laden (fehlende Datei = keine Missionen). */
  async load(levelName: string): Promise<void> {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}levels/${levelName}.missions.json`);
      if (res.ok) this.defs = (await res.json()) as MissionDef[];
    } catch {
      this.defs = [];
    }
  }

  getCompleted(): Set<string> {
    return this.completed;
  }

  /** Für den Spielstand (Task 24). */
  setCompleted(ids: string[]): void {
    for (const id of ids) this.completed.add(id);
  }

  get missionList(): readonly MissionDef[] {
    return this.defs;
  }

  start(id: string): void {
    const def = this.defs.find((d) => d.id === id);
    if (!def || this.active) return;
    this.active = {
      def,
      remainingS: 'timeLimitS' in def ? def.timeLimitS : Infinity,
      scoreAtStart: this.scoreTotal,
      collected: new Set(),
    };
    this.overlayEl.style.display = 'none';
    this.panelEl.style.display = 'block';
  }

  abort(): void {
    if (!this.active) return;
    this.finish(false);
  }

  update(dt: number): void {
    const a = this.active;
    if (!a) return;

    if (a.remainingS !== Infinity) {
      a.remainingS -= dt;
      if (a.remainingS <= 0) {
        this.finish(false);
        return;
      }
    }
    this.panelEl.textContent = `${a.def.title}\n${this.progressText(a)}`;
  }

  private progressText(a: ActiveMission): string {
    const time = a.remainingS === Infinity ? '' : ` · ${Math.ceil(a.remainingS)}s`;
    switch (a.def.type) {
      case 'score':
        return `${(this.scoreTotal - a.scoreAtStart).toLocaleString('de-DE')} / ${a.def.target.toLocaleString('de-DE')} Punkte${time}`;
      case 'collect':
        return `${a.collected.size} / ${a.def.ids.length} eingesammelt${time}`;
      case 'combo':
        return `Banke eine ×${a.def.targetMultiplier}-Combo (bisher ×${this.lastComboMultiplier})`;
    }
  }

  private checkScore(): void {
    const a = this.active;
    if (a?.def.type === 'score' && this.scoreTotal - a.scoreAtStart >= a.def.target) {
      this.finish(true);
    }
  }

  private finish(success: boolean): void {
    const a = this.active;
    if (!a) return;
    this.active = null;
    this.panelEl.style.display = 'none';

    if (success) {
      this.completed.add(a.def.id);
      this.bus.emit('mission:completed', { id: a.def.id });
    } else {
      this.bus.emit('mission:failed', { id: a.def.id });
    }

    this.overlayEl.innerHTML =
      `<div style="font:700 22px system-ui;margin-bottom:6px">${success ? '✔ Mission erfüllt' : '✘ Mission gescheitert'}</div>` +
      `<div style="margin-bottom:14px">${a.def.title}</div>`;
    const btn = document.createElement('button');
    btn.textContent = 'OK';
    btn.style.cssText =
      `padding:8px 22px;background:${ACCENT};border:none;color:#fff;` +
      'font:700 14px system-ui;border-radius:2px;cursor:pointer;';
    btn.onclick = () => {
      this.overlayEl.style.display = 'none';
    };
    this.overlayEl.appendChild(btn);
    this.overlayEl.style.display = 'block';
    document.exitPointerLock();
  }
}
