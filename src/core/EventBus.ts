/**
 * Zentrales Event-Map-Interface. Jedes System, das Events einführt,
 * erweitert dieses Interface (Task-weise wachsend).
 */
export interface GameEvents {
  'debug:jumpPressed': void;
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
