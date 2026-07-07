import type { PlayerController } from './PlayerController';
import { BAIL_S, GRAVITY } from './tuning';

export type StateName = 'RUN' | 'AIR' | 'WALLRUN' | 'GRIND' | 'VAULT' | 'BAIL';

/**
 * Erlaubte Übergänge. WALLRUN/GRIND/VAULT sind deklariert, werden aber
 * erst ab Task 11/12/13 erreichbar.
 */
const ALLOWED: Record<StateName, readonly StateName[]> = {
  RUN: ['AIR', 'BAIL'],
  AIR: ['RUN', 'BAIL'],
  WALLRUN: [],
  GRIND: [],
  VAULT: [],
  BAIL: ['RUN'],
};

export abstract class PlayerState {
  abstract readonly name: StateName;
  constructor(protected readonly player: PlayerController) {}
  enter(): void {}
  update(_dt: number): void {}
  exit(): void {}
}

export class StateMachine {
  private states: Record<StateName, PlayerState>;
  private currentState: PlayerState;

  constructor(private readonly player: PlayerController) {
    this.states = {
      RUN: new RunState(player),
      AIR: new AirState(player),
      WALLRUN: new WallRunState(player),
      GRIND: new GrindState(player),
      VAULT: new VaultState(player),
      BAIL: new BailState(player),
    };
    this.currentState = this.states.AIR; // Spawn: fällt kurz auf den Boden
    this.currentState.enter();
  }

  get current(): StateName {
    return this.currentState.name;
  }

  update(dt: number): void {
    this.currentState.update(dt);
  }

  transition(to: StateName): void {
    const from = this.currentState.name;
    if (from === to) return;
    if (!ALLOWED[from].includes(to)) {
      console.warn(`FSM: Übergang ${from} -> ${to} nicht erlaubt`);
      return;
    }
    this.currentState.exit();
    this.currentState = this.states[to];
    this.currentState.enter();
    this.player.bus.emit('player:stateChange', { from, to });
  }
}

class RunState extends PlayerState {
  readonly name = 'RUN' as const;

  override update(dt: number): void {
    const p = this.player;
    p.tickLandingWindow(dt);
    p.groundMove(dt);
    const jumped = p.tryJump();
    p.applyMovement(dt);
    if (jumped || !p.grounded) p.fsm.transition('AIR');
  }
}

class AirState extends PlayerState {
  readonly name = 'AIR' as const;

  override enter(): void {
    this.player.beginAirborne();
  }

  override update(dt: number): void {
    const p = this.player;
    p.airMove(dt);
    p.tryJump(); // Coyote-Sprung kurz nach Kantenverlust
    p.applyMovement(dt);
    if (p.grounded && p.velocity.y <= 0) {
      p.onLanded();
      p.fsm.transition('RUN');
    }
  }
}

class BailState extends PlayerState {
  readonly name = 'BAIL' as const;
  private remaining = 0;

  override enter(): void {
    const p = this.player;
    this.remaining = BAIL_S;
    p.velocity.set(0, p.velocity.y, 0);
    p.bus.emit('player:bail', { fallHeight: p.lastFallHeight });
  }

  override update(dt: number): void {
    const p = this.player;
    // liegen bleiben: nur Gravitation, keine Steuerung
    p.velocity.x = 0;
    p.velocity.z = 0;
    if (!p.grounded) p.velocity.y -= GRAVITY * dt;
    p.applyMovement(dt);
    this.remaining -= dt;
    if (this.remaining <= 0) p.fsm.transition('RUN');
  }
}

// Ab Task 11/12/13 mit Leben gefüllt — bis dahin unerreichbar.
class WallRunState extends PlayerState {
  readonly name = 'WALLRUN' as const;
}
class GrindState extends PlayerState {
  readonly name = 'GRIND' as const;
}
class VaultState extends PlayerState {
  readonly name = 'VAULT' as const;
}
