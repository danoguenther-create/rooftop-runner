import type { EventBus } from '../core/EventBus';

const ACCENT = '#ff6a00';
const SPEED_MAX = 9;
const TICKER_LIFETIME_MS = 1500;
const TICKER_MAX = 4;

/**
 * HUD (Task 16): Score oben rechts, laufende Combo mitte rechts,
 * Speed-Balken + Trick-Ticker unten mitte. Rein DOM-basiert (#hud),
 * komplett eventgetrieben über den EventBus; update(dt, speed) treibt
 * nur den Speed-Balken und das Aufräumen des Tickers.
 */
export class HUD {
  private readonly scoreEl: HTMLDivElement;
  private readonly comboEl: HTMLDivElement;
  private readonly bankEl: HTMLDivElement;
  private readonly speedFillEl: HTMLDivElement;
  private readonly tickerEl: HTMLDivElement;
  private grindTickerEntry: HTMLDivElement | null = null;

  constructor(bus: EventBus) {
    const hud = document.getElementById('hud')!;

    const style = document.createElement('style');
    style.textContent = `
      .hud-panel { position:absolute; color:#fff; pointer-events:none; }
      .hud-score {
        top:8px; right:12px; padding:6px 14px; background:rgba(0,0,0,.55);
        font:700 26px/1.2 monospace; border-bottom:2px solid ${ACCENT};
        border-radius:2px; text-align:right; min-width:120px;
      }
      .hud-combo {
        top:45%; right:12px; padding:6px 12px; background:rgba(0,0,0,.55);
        font:700 20px/1.2 monospace; border-radius:2px; text-align:right;
        transition:transform .15s ease, color .15s ease, opacity .3s ease;
        opacity:0;
      }
      .hud-combo.lost { animation:hud-shake .4s linear; color:#ff2d2d !important; }
      @keyframes hud-shake {
        0%,100% { transform:translateX(0); }
        20%,60% { transform:translateX(-6px); }
        40%,80% { transform:translateX(6px); }
      }
      .hud-bank {
        top:52px; right:12px; padding:2px 8px; font:700 20px/1.2 monospace;
        color:${ACCENT}; opacity:0;
      }
      .hud-bank.fly { animation:hud-fly 1s ease-out; }
      @keyframes hud-fly {
        0% { transform:translateY(28px); opacity:0; }
        25% { opacity:1; }
        100% { transform:translateY(0); opacity:0; }
      }
      .hud-speed {
        bottom:14px; left:50%; transform:translateX(-50%);
        width:220px; height:6px; background:rgba(0,0,0,.55); border-radius:2px;
      }
      .hud-speed-fill {
        height:100%; width:0%; background:${ACCENT}; border-radius:2px;
        transition:width .1s linear;
      }
      .hud-ticker {
        bottom:30px; left:50%; transform:translateX(-50%);
        display:flex; flex-direction:column-reverse; align-items:center; gap:3px;
      }
      .hud-tick {
        padding:2px 10px; background:rgba(0,0,0,.55); color:#fff;
        font:700 14px/1.4 system-ui; letter-spacing:1px; border-radius:2px;
        border-left:3px solid ${ACCENT}; transition:opacity .4s ease;
      }
    `;
    hud.appendChild(style);

    this.scoreEl = this.panel(hud, 'hud-score');
    this.scoreEl.textContent = '0';
    this.comboEl = this.panel(hud, 'hud-combo');
    this.bankEl = this.panel(hud, 'hud-bank');

    const speed = this.panel(hud, 'hud-speed');
    this.speedFillEl = document.createElement('div');
    this.speedFillEl.className = 'hud-speed-fill';
    speed.appendChild(this.speedFillEl);

    this.tickerEl = this.panel(hud, 'hud-ticker');

    // --- Score-Events
    bus.on('score:total', ({ total }) => {
      this.scoreEl.textContent = total.toLocaleString('de-DE');
    });
    bus.on('score:combo', ({ sum, multiplier, active }) => {
      if (!active) {
        this.comboEl.style.opacity = '0';
        return;
      }
      this.comboEl.classList.remove('lost');
      this.comboEl.textContent = `${sum.toLocaleString('de-DE')} × ${multiplier}`;
      this.comboEl.style.opacity = '1';
      this.comboEl.style.color = multiplier >= 8 ? '#ff2d2d' : multiplier >= 5 ? ACCENT : '#fff';
      this.comboEl.style.transform = `scale(${1 + Math.min(multiplier, 10) * 0.05})`;
    });
    bus.on('score:banked', ({ amount }) => {
      this.bankEl.textContent = `+${amount.toLocaleString('de-DE')}`;
      this.bankEl.classList.remove('fly');
      void this.bankEl.offsetWidth; // Animation neu starten
      this.bankEl.classList.add('fly');
    });
    bus.on('score:lost', () => {
      // Wackeln auf dem noch sichtbaren Combo-Text, dann ausblenden
      this.comboEl.style.opacity = '1';
      this.comboEl.classList.add('lost');
      window.setTimeout(() => {
        this.comboEl.classList.remove('lost');
        this.comboEl.style.opacity = '0';
      }, 400);
    });

    // --- Trick-Ticker
    bus.on('trick:wallrun', () => this.tick('WALL RUN'));
    bus.on('trick:walljump', () => this.tick('WALL JUMP'));
    bus.on('trick:vault', () => this.tick('VAULT'));
    bus.on('trick:gap', () => this.tick('GAP!'));
    bus.on('trick:precision', () => this.tick('PRECISION!'));
    bus.on('player:roll', () => this.tick('ROLL'));
    bus.on('trick:grindStart', () => {
      this.grindTickerEntry = this.tick('GRIND');
    });
    bus.on('trick:grindTick', ({ seconds }) => {
      // Grind aktualisiert seinen Eintrag statt zu stapeln
      if (this.grindTickerEntry?.isConnected) {
        this.grindTickerEntry.textContent = `GRIND ${seconds}s`;
        this.grindTickerEntry.dataset.until = String(performance.now() + TICKER_LIFETIME_MS);
      } else {
        this.grindTickerEntry = this.tick(`GRIND ${seconds}s`);
      }
    });
  }

  /** Pro Frame: Speed-Balken + Ticker-Verfall. */
  update(_dt: number, speed: number): void {
    const pct = Math.min(speed / SPEED_MAX, 1) * 100;
    this.speedFillEl.style.width = `${pct.toFixed(1)}%`;

    const now = performance.now();
    for (const child of Array.from(this.tickerEl.children) as HTMLDivElement[]) {
      const until = Number(child.dataset.until ?? 0);
      if (now > until) child.remove();
      else if (now > until - 400) child.style.opacity = '0';
    }
  }

  private tick(label: string): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'hud-tick';
    el.textContent = label;
    el.dataset.until = String(performance.now() + TICKER_LIFETIME_MS);
    this.tickerEl.appendChild(el);
    while (this.tickerEl.children.length > TICKER_MAX) this.tickerEl.firstChild?.remove();
    return el;
  }

  private panel(hud: HTMLElement, className: string): HTMLDivElement {
    const el = document.createElement('div');
    el.className = `hud-panel ${className}`;
    hud.appendChild(el);
    return el;
  }
}
