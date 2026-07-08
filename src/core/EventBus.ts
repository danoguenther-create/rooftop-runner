import type { FlipKind } from '../player/AirTricks';
import type { StateName } from '../player/PlayerStates';
import type { WallSide } from '../player/WallRun';

/**
 * Zentrales Event-Map-Interface. Jedes System, das Events einführt,
 * erweitert dieses Interface (Task-weise wachsend).
 */
export interface GameEvents {
  'player:stateChange': { from: StateName; to: StateName };
  'player:roll': { fallHeight: number };
  'player:hardLanding': { fallHeight: number };
  'player:bail': { fallHeight: number };
  'trick:wallrun': { side: WallSide };
  'trick:walljump': { side: WallSide };
  'trick:vault': { obstacleHeight: number };
  'trick:balanceStart': { rail: number };
  'trick:balanceTick': { seconds: number };
  /** full = (fast) die gesamte Rail-Länge balanciert -> Bonus. */
  'trick:balanceEnd': { durationMs: number; full: boolean };
  'trick:gap': { id: string };
  'trick:precision': { id: string };
  /** Gestandener Flip: count = Umdrehungen (1-3), gainer = Backflip vorwärts. */
  'trick:flip': { kind: FlipKind; count: number; gainer: boolean };
  /** Gestandener Spin in 180°-Schritten (1 = 180°, 2 = 360°, …). */
  'trick:spin': { halfTurns: number };
  /** Diveroll: Hechtsprung (C in der Luft gehalten) mit Auto-Rolle gelandet. */
  'trick:diveroll': { fallHeight: number };
  /** Stangen-Abgang; chain = Stangen in Folge ohne Bodenkontakt. */
  'trick:swing': { chain: number };
  /** Laufende Combo geändert (Trick hinzugekommen) oder beendet (active=false). */
  'score:combo': { sum: number; multiplier: number; active: boolean };
  /** Combo sauber gebankt: amount = sum × multiplier. */
  'score:banked': { amount: number; total: number };
  /** Combo durch Bail/harte Landung verworfen (amount = entgangene Punkte). */
  'score:lost': { amount: number };
  /** Gesamtscore geändert. */
  'score:total': { total: number };
}

type Handler<T> = (payload: T) => void;

/**
 * Minimaler typsicherer Pub/Sub-Bus. Systeme kommunizieren ausschließlich
 * hierüber — keine direkten Querverweise zwischen Systemen.
 */
export class EventBus {
  private handlers = new Map<keyof GameEvents, Set<Handler<never>>>();

  on<K extends keyof GameEvents>(event: K, handler: Handler<GameEvents[K]>): void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<never>);
  }

  off<K extends keyof GameEvents>(event: K, handler: Handler<GameEvents[K]>): void {
    this.handlers.get(event)?.delete(handler as Handler<never>);
  }

  emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of set) {
      (handler as Handler<GameEvents[K]>)(payload);
    }
  }
}
