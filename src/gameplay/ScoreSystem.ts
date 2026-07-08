import type { EventBus } from '../core/EventBus';
import type { StateName } from '../player/PlayerStates';

/**
 * Basispunkte pro Trick — zentrale, leicht erweiterbare Tabelle.
 * Tasks 15b/15c und M3.5 ergänzen hier flip/spin/diveroll/balance/swing,
 * ohne die Combo-Logik anzufassen.
 */
const BASE_POINTS: Record<string, number> = {
  wallrun: 100,
  walljump: 150,
  vault: 75,
  balanceStart: 50,
  balanceTick: 50,
  balanceFull: 100,
  gap: 200,
  precision: 250,
  roll: 50,
  flip: 120,
  flip2: 300,
  flip3: 600,
  gainer: 150,
  spin: 80,
  spin2: 200,
  spin3: 400,
  diveroll: 75,
  swing: 100,
  swingChain: 50,
};

/** Roll zählt nur nach echten Stürzen als Trick. */
const ROLL_MIN_FALL_M = 4;
/** Combo bankt nach so vielen Sekunden im RUN-Zustand ohne neuen Trick. */
const COMBO_BANK_S = 1.5;
const MULTIPLIER_MAX = 10;

/**
 * Score-, Combo- & Bail-System (Task 15). Rein eventgetrieben: konsumiert
 * trick:*- und player:*-Events, emittiert score:*-Events für die UI.
 * Keine Physik, keine Spielerreferenz — nur der Bus und update(dt) für
 * den Banking-Timer.
 */
export class ScoreSystem {
  private total = 0;
  private comboSum = 0;
  private multiplier = 0;
  private comboActive = false;
  private playerState: StateName = 'RUN';
  private runTimer = 0;

  constructor(private readonly bus: EventBus) {
    bus.on('player:stateChange', ({ to }) => {
      this.playerState = to;
      this.runTimer = 0;
    });

    bus.on('trick:wallrun', () => this.addTrick('wallrun'));
    bus.on('trick:walljump', () => this.addTrick('walljump'));
    bus.on('trick:vault', () => this.addTrick('vault'));
    bus.on('trick:balanceStart', () => this.addTrick('balanceStart'));
    // Balance-Ticks geben Punkte, treiben aber nicht den Multiplikator —
    // sonst wäre eine lange Rail allein schon ×10.
    bus.on('trick:balanceTick', () => this.addTrick('balanceTick', false));
    bus.on('trick:balanceEnd', ({ full }) => {
      if (full) this.addTrick('balanceFull', false); // Volle-Länge-Bonus
    });
    bus.on('trick:gap', () => this.addTrick('gap'));
    bus.on('trick:precision', () => this.addTrick('precision'));
    bus.on('player:roll', ({ fallHeight }) => {
      if (fallHeight > ROLL_MIN_FALL_M) this.addTrick('roll');
    });
    bus.on('trick:flip', ({ count, gainer }) => {
      this.addTrick(count >= 3 ? 'flip3' : count === 2 ? 'flip2' : 'flip');
      // Gainer: Bonuspunkte auf denselben Trick, kein zweiter Multiplikator-Schritt
      if (gainer) this.addTrick('gainer', false);
    });
    bus.on('trick:spin', ({ halfTurns }) => {
      this.addTrick(halfTurns >= 3 ? 'spin3' : halfTurns === 2 ? 'spin2' : 'spin');
    });
    // Diveroll punktet erst ab echter Sprunghöhe (kein Farmen auf Flachsprüngen)
    bus.on('trick:diveroll', ({ fallHeight }) => {
      if (fallHeight >= 2) this.addTrick('diveroll');
    });
    bus.on('trick:swing', ({ chain }) => {
      this.addTrick('swing');
      // Kettenbonus: +50 je weitere Stange, ohne zweiten Multiplikator-Schritt
      for (let i = 1; i < chain; i++) this.addTrick('swingChain', false);
    });

    bus.on('player:bail', () => this.discard());
    bus.on('player:hardLanding', () => this.discard());
  }

  /** Pro Frame aufrufen — treibt den Banking-Timer. */
  update(dt: number): void {
    if (!this.comboActive) return;
    if (this.playerState !== 'RUN') return;
    this.runTimer += dt;
    if (this.runTimer >= COMBO_BANK_S) this.bank();
  }

  getTotal(): number {
    return this.total;
  }

  /** Für Zeitrennen/Missionen: alles auf null. */
  reset(): void {
    this.total = 0;
    this.clearCombo();
    this.bus.emit('score:total', { total: this.total });
  }

  private addTrick(name: keyof typeof BASE_POINTS, raiseMultiplier = true): void {
    const points = BASE_POINTS[name] ?? 0;
    if (!this.comboActive) {
      this.comboActive = true;
      this.comboSum = points;
      this.multiplier = 1;
    } else {
      this.comboSum += points;
      if (raiseMultiplier) this.multiplier = Math.min(MULTIPLIER_MAX, this.multiplier + 1);
    }
    this.runTimer = 0;
    this.emitCombo();
  }

  private bank(): void {
    const amount = this.comboSum * this.multiplier;
    this.total += amount;
    this.clearCombo();
    this.bus.emit('score:banked', { amount, total: this.total });
    this.bus.emit('score:total', { total: this.total });
  }

  private discard(): void {
    if (!this.comboActive) return;
    const amount = this.comboSum * this.multiplier;
    this.clearCombo();
    this.bus.emit('score:lost', { amount });
  }

  private clearCombo(): void {
    this.comboActive = false;
    this.comboSum = 0;
    this.multiplier = 0;
    this.runTimer = 0;
    this.emitCombo();
  }

  private emitCombo(): void {
    this.bus.emit('score:combo', {
      sum: this.comboSum,
      multiplier: this.multiplier,
      active: this.comboActive,
    });
  }
}
