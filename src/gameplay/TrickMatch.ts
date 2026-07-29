import type { EventBus } from '../core/EventBus';
import { simNow } from '../core/SimClock';

const LETTERS = ['P', 'A', 'R', 'K'];
const SET_TIME_S = 25;
const MATCH_TIME_S = 25;
const ACCENT = '#ff6a00';

/**
 * „Game of PARK" (Splitscreen, 2026-07-10) — das S.K.A.T.E.-Prinzip:
 * Der Vorleger hat ein Zeitfenster, um einen Trick zu landen. Danach muss
 * der Gegner denselben Trick nachmachen — scheitert er (Zeit läuft ab),
 * kassiert er einen Buchstaben. Legt der Vorleger nichts vor (Zeit/Bail),
 * wechselt das Vorlegerecht ohne Buchstabe. Wer P-A-R-K voll hat, verliert.
 *
 * Trick-Identität = Event + prägende Parameter (Flip-Art×Anzahl×Gainer,
 * Spin-Grad); Wallrun-Seite o. Ä. ist bewusst egal.
 */
export class TrickMatch {
  private setter = 0;
  private phase: 'SET' | 'MATCH' = 'SET';
  private timeLeft = SET_TIME_S;
  private targetId: string | null = null;
  private targetLabel = '';
  private letters = [0, 0];
  private over = false;
  private flash = ['', ''];
  private flashUntil = 0;
  private readonly banners: HTMLDivElement[] = [];

  constructor(buses: EventBus[], roots: HTMLElement[]) {
    buses.forEach((bus, i) => {
      bus.on('trick:flip', (e) => {
        const name = e.kind === 'front' ? 'FRONTFLIP' : e.kind === 'back' ? 'BACKFLIP' : 'SIDEFLIP';
        const prefix = e.count >= 3 ? 'TRIPLE ' : e.count === 2 ? 'DOUBLE ' : '';
        const label = `${e.gainer ? 'GAINER ' : ''}${prefix}${name}`;
        this.onTrick(i, `flip:${e.kind}:${e.count}:${e.gainer ? 1 : 0}`, label);
      });
      bus.on('trick:spin', (e) => this.onTrick(i, `spin:${e.halfTurns}`, `SPIN ${e.halfTurns * 180}`));
      bus.on('trick:vault', () => this.onTrick(i, 'vault', 'VAULT'));
      bus.on('trick:wallrun', () => this.onTrick(i, 'wallrun', 'WALL RUN'));
      bus.on('trick:walljump', () => this.onTrick(i, 'walljump', 'WALL JUMP'));
      bus.on('trick:diveroll', () => this.onTrick(i, 'diveroll', 'DIVEROLL'));
      bus.on('trick:swing', () => this.onTrick(i, 'swing', 'BAR SWING'));
      bus.on('trick:balanceEnd', (e) => {
        if (e.full) this.onTrick(i, 'balance', 'RAIL BALANCE');
      });
      bus.on('player:bail', () => this.onBail(i));
    });

    for (const root of roots) {
      const el = document.createElement('div');
      el.style.cssText =
        'position:absolute;top:64px;left:50%;transform:translateX(-50%);' +
        'padding:8px 16px;background:rgba(0,0,0,.62);color:#fff;text-align:center;' +
        `font:700 15px/1.5 monospace;border-radius:3px;border-top:2px solid ${ACCENT};` +
        'pointer-events:none;white-space:pre;';
      root.appendChild(el);
      this.banners.push(el);
    }
    this.refresh();
  }

  /** Pro Frame (nur im PLAYING-Zustand): Timer + Anzeige. */
  update(dt: number): void {
    if (this.over) return;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      if (this.phase === 'SET') {
        // Nichts vorgelegt: Vorlegerecht wechselt, kein Buchstabe
        this.switchSetter();
      } else {
        // Nachmachen gescheitert: Buchstabe für den Nachmacher
        const matcher = 1 - this.setter;
        this.letters[matcher]++;
        this.flashFor(matcher, `✖ ${LETTERS[this.letters[matcher] - 1]} kassiert!`);
        if (this.letters[matcher] >= LETTERS.length) {
          this.over = true;
        } else {
          this.phase = 'SET';
          this.timeLeft = SET_TIME_S;
          this.targetId = null;
        }
      }
    }
    if (simNow() > this.flashUntil) this.flash = ['', ''];
    this.refresh();
  }

  private onTrick(playerIdx: number, id: string, label: string): void {
    if (this.over) return;
    if (this.phase === 'SET') {
      if (playerIdx !== this.setter) return;
      this.targetId = id;
      this.targetLabel = label;
      this.phase = 'MATCH';
      this.timeLeft = MATCH_TIME_S;
      this.flashFor(playerIdx, `✔ ${label} vorgelegt`);
    } else if (playerIdx !== this.setter && id === this.targetId) {
      // Gekontert: Vorleger bleibt, nächste Runde
      this.flashFor(playerIdx, `✔ ${label} gekontert!`);
      this.phase = 'SET';
      this.timeLeft = SET_TIME_S;
      this.targetId = null;
    }
    this.refresh();
  }

  private onBail(playerIdx: number): void {
    if (this.over || this.phase !== 'SET' || playerIdx !== this.setter) return;
    // Vorleger verpatzt den Versuch: Vorlegerecht wechselt sofort
    this.flashFor(playerIdx, '✖ verpatzt — Wechsel');
    this.switchSetter();
    this.refresh();
  }

  private switchSetter(): void {
    this.setter = 1 - this.setter;
    this.phase = 'SET';
    this.timeLeft = SET_TIME_S;
    this.targetId = null;
  }

  private flashFor(playerIdx: number, text: string): void {
    this.flash[playerIdx] = text;
    this.flashUntil = simNow() + 2500;
  }

  private lettersLine(playerIdx: number): string {
    const n = this.letters[playerIdx];
    return LETTERS.map((l, k) => (k < n ? l : '·')).join(' ');
  }

  private refresh(): void {
    const secs = Math.max(0, Math.ceil(this.timeLeft));
    for (let i = 0; i < this.banners.length; i++) {
      let line: string;
      if (this.over) {
        line = this.letters[i] >= LETTERS.length ? '💀 P-A-R-K — VERLOREN' : '🏆 GEWONNEN!';
        this.banners[i].textContent = `${line}\nEsc → Menü für Revanche`;
        continue;
      }
      if (this.phase === 'SET') {
        line = i === this.setter ? `DU LEGST VOR — ${secs}s` : 'Gegner legt vor …';
      } else {
        line =
          i === this.setter
            ? `Vorgelegt: ${this.targetLabel}`
            : `NACHMACHEN: ${this.targetLabel} — ${secs}s`;
      }
      const flash = this.flash[i] ? `\n${this.flash[i]}` : '';
      this.banners[i].textContent = `${line}\n${this.lettersLine(i)}${flash}`;
    }
  }
}
