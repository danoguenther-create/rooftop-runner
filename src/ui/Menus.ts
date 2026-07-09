import type { Game } from '../core/Game';

const ACCENT = '#ff6a00';

/**
 * Start- und Pausemenü (Task 23). DOM in #menu, Stil wie das HUD.
 * Levelwechsel läuft über einen Seiten-Reload mit ?level= — das ist
 * bewusst so (sauberer Zustand ohne unload()-Komplexität); das
 * Live-Entladen kommt mit dem Performance-Pass (Task 28).
 */
export class Menus {
  private readonly root: HTMLElement;
  private readonly panel: HTMLDivElement;
  quality: 'hoch' | 'niedrig' = 'hoch';
  musicVol = 0.7;
  sfxVol = 1;

  constructor(private readonly game: Game) {
    this.root = document.getElementById('menu')!;
    this.root.style.cssText =
      'position:fixed;inset:0;display:none;align-items:center;justify-content:center;' +
      'background:rgba(10,12,16,.72);z-index:10;';
    this.panel = document.createElement('div');
    this.panel.style.cssText =
      'min-width:320px;padding:26px 34px;background:rgba(0,0,0,.85);color:#fff;' +
      `font:15px system-ui;border:1px solid ${ACCENT};border-radius:4px;text-align:center;`;
    this.root.appendChild(this.panel);
  }

  showStart(): void {
    this.build('start');
    this.root.style.display = 'flex';
  }

  showPause(): void {
    this.build('pause');
    this.root.style.display = 'flex';
  }

  hide(): void {
    this.root.style.display = 'none';
  }

  private build(kind: 'start' | 'pause'): void {
    this.panel.innerHTML =
      `<div style="font:800 30px system-ui;letter-spacing:2px;margin-bottom:2px">ROOFTOP RUNNER</div>` +
      `<div style="color:#9aa;margin-bottom:18px">${kind === 'start' ? this.game.level.name : 'Pause'}</div>`;

    const btn = (label: string, onClick: () => void, small = false) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText =
        `display:block;width:100%;margin:6px 0;padding:${small ? '7px' : '11px'} 18px;` +
        `background:${small ? 'rgba(255,255,255,.08)' : ACCENT};border:none;color:#fff;` +
        `font:700 ${small ? 13 : 15}px system-ui;border-radius:2px;cursor:pointer;text-align:center;`;
      b.onclick = onClick;
      this.panel.appendChild(b);
      return b;
    };
    const switchLevel = (name: string, extra = '') => {
      const current = new URLSearchParams(location.search).get('level') ?? 'testlevel';
      if (current === name && !extra) {
        this.game.resume();
      } else {
        location.href = `${location.pathname}?level=${name}${extra}`;
      }
    };

    if (kind === 'start') {
      btn('▶ Free Run — Graybox (Physik-Playground)', () => switchLevel('testlevel'));
      btn('▶ Free Run — Rooftops District', () => switchLevel('city01'));
      btn('⏱ Time Trial — Rooftops District', () => switchLevel('city01', '&trial=1'));

      // Missionsliste mit Erledigt-Häkchen
      const list = this.game.missions.missionList;
      if (list.length) {
        const head = document.createElement('div');
        head.textContent = 'Missionen';
        head.style.cssText = 'margin:14px 0 4px;color:#9aa;font-size:13px;';
        this.panel.appendChild(head);
        const done = this.game.missions.getCompleted();
        for (const m of list) {
          btn(`${done.has(m.id) ? '✔' : '○'} ${m.title}`, () => {
            this.game.resume();
            this.game.missions.start(m.id);
          }, true);
        }
      }
    } else {
      btn('▶ Weiter', () => this.game.resume());
      btn('↺ Level neu starten', () => location.reload());
      btn('☰ Zurück zum Menü', () => this.showStart());
    }

    // Settings (beide Menüs)
    const settings = document.createElement('div');
    settings.style.cssText = 'margin-top:16px;padding-top:12px;border-top:1px solid #333;text-align:left;font-size:13px;';
    settings.innerHTML = `<div style="color:#9aa;margin-bottom:6px">Einstellungen</div>`;
    const slider = (label: string, value: number, onInput: (v: number) => void) => {
      const row = document.createElement('label');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;margin:4px 0;';
      row.innerHTML = `<span style="width:60px">${label}</span>`;
      const input = document.createElement('input');
      input.type = 'range';
      input.min = '0';
      input.max = '1';
      input.step = '0.05';
      input.value = String(value);
      input.style.flex = '1';
      input.oninput = () => onInput(Number(input.value));
      row.appendChild(input);
      settings.appendChild(row);
    };
    slider('Musik', this.musicVol, (v) => (this.musicVol = v));
    slider('SFX', this.sfxVol, (v) => (this.sfxVol = v));

    const q = document.createElement('button');
    const qLabel = () => `Qualität: ${this.quality}`;
    q.textContent = qLabel();
    q.style.cssText =
      'margin-top:6px;padding:6px 14px;background:rgba(255,255,255,.08);border:none;' +
      'color:#fff;font:13px system-ui;border-radius:2px;cursor:pointer;';
    q.onclick = () => {
      this.quality = this.quality === 'hoch' ? 'niedrig' : 'hoch';
      this.game.setQuality(this.quality === 'hoch');
      q.textContent = qLabel();
    };
    settings.appendChild(q);
    this.panel.appendChild(settings);
  }
}
