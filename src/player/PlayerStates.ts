import * as THREE from 'three';
import type { PlayerController } from './PlayerController';
import type { VaultPlan } from './Vault';
import type { WallSide } from './WallRun';
import {
  BAIL_S,
  BALANCE_JUMP_VELOCITY,
  CAPSULE_RADIUS,
  GRAVITY,
  HANG_CENTER_BELOW,
  MANTLE_S,
  SHIMMY_SPEED,
  WALLJUMP_NORMAL_IMPULSE,
  WALLJUMP_UP_IMPULSE,
  WALLRUN_GRAVITY_FACTOR,
  WALLRUN_MAX_MS,
  WALLRUN_MIN_SPEED,
} from './tuning';
import { simNow } from '../core/SimClock';

export type StateName =
  | 'RUN'
  | 'AIR'
  | 'WALLRUN'
  | 'BALANCE'
  | 'VAULT'
  | 'BAIL'
  | 'HANG'
  | 'SWING';

/** Erlaubte Übergänge (Tasks 9/11/12/16b/16c/16d). */
const ALLOWED: Record<StateName, readonly StateName[]> = {
  RUN: ['AIR', 'VAULT', 'BAIL', 'BALANCE'],
  AIR: ['RUN', 'WALLRUN', 'BALANCE', 'VAULT', 'BAIL', 'HANG', 'SWING'],
  WALLRUN: ['AIR'],
  BALANCE: ['AIR'],
  VAULT: ['RUN', 'AIR'],
  BAIL: ['RUN'],
  HANG: ['AIR', 'RUN'],
  SWING: ['AIR'],
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
      BALANCE: new BalanceState(player),
      VAULT: new VaultState(player),
      BAIL: new BailState(player),
      HANG: new HangState(player),
      SWING: new SwingState(player),
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
    if (to !== 'AIR' && to !== 'RUN') {
      this.player.cancelAirPose();
      this.player.climb.stopWallClimb();
    }
    this.currentState = this.states[to];
    this.currentState.enter();
    this.player.bus.emit('player:stateChange', { from, to });
  }
}

// --------------------------------------------------------------- RUN

class RunState extends PlayerState {
  readonly name = 'RUN' as const;

  override update(dt: number): void {
    const p = this.player;
    p.tickLandingWindow(dt);
    if(p.tryDiveJump()){p.fsm.transition("AIR");p.applyMovement(dt);return;}
    // Solid rails can be reached by a grounded step, not only by falling.
    if (p.balancer.trySnap()) { p.fsm.transition('BALANCE'); return; }
    p.groundMove(dt);
    p.climb.tryWallClimb(p); // frontaler Wandlauf hebt ab -> AIR

    const plan = p.vaultDetector.tryPlan(p);
    if (plan) {
      p.pendingVault = plan;
      p.fsm.transition('VAULT');
      return;
    }

    const jumped = p.tryJump();
    p.applyMovement(dt);
    if (jumped || !p.grounded) p.fsm.transition('AIR');
  }
}

// --------------------------------------------------------------- AIR

class AirState extends PlayerState {
  readonly name = 'AIR' as const;

  override enter(): void {
    this.player.beginAirborne();
  }

  override update(dt: number): void {
    const p = this.player;
    p.airMove(dt);

    // Rail von oben fangen? (spezifischster Move zuerst) -> Balancieren
    if (p.balancer.trySnap()) {
      p.fsm.transition('BALANCE');
      return;
    }

    // Stange von unten? -> SWING
    if (p.swinger.trySnap()) {
      p.fsm.transition('SWING');
      return;
    }

    // Frontaler Wandlauf (Boost) + Kante in Griffweite? -> HANG
    p.climb.tryWallClimb(p);
    if (p.climb.tryGrab(p)) {
      p.fsm.transition('HANG');
      return;
    }

    // Wand seitlich? -> Wall-Run (Task 10: Erkennung, Task 11: Bewegung)
    p.wallHit = p.wallDetector.check(p);
    if (p.wallHit) {
      p.fsm.transition('WALLRUN');
      return;
    }

    // Flaches Anfliegen eines kniehohen Hindernisses -> Vault
    if (p.velocity.y > -2) {
      const plan = p.vaultDetector.tryPlan(p);
      if (plan) {
        p.pendingVault = plan;
        p.fsm.transition('VAULT');
        return;
      }
    }

    p.tryJump(); // Coyote-Sprung kurz nach Kantenverlust
    p.applyMovement(dt);
    if (p.grounded && p.velocity.y <= 0) {
      // Unfertiger Flip bei der Landung -> direkt BAIL statt RUN
      const flipBail = p.onLanded();
      p.fsm.transition(flipBail ? 'BAIL' : 'RUN');
    }
  }
}

// --------------------------------------------------------------- WALLRUN

const UP = new THREE.Vector3(0, 1, 0);

class WallRunState extends PlayerState {
  readonly name = 'WALLRUN' as const;
  private readonly normal = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private side: WallSide = 'left';
  private speed = 0;
  private elapsed = 0;

  override enter(): void {
    const p = this.player;
    const hit = p.wallHit!;
    this.side = hit.side;
    this.elapsed = 0;
    this.speed = p.horizontalSpeed;
    this.normal.copy(hit.normal);
    this.updateTangent();

    p.velocity.y = Math.max(p.velocity.y, -1);
    p.currentWallSide = this.side;
    p.bus.emit('trick:wallrun', { side: this.side });
  }

  /** Tangente entlang der Wand, in bisheriger Laufrichtung. */
  private updateTangent(): void {
    const p = this.player;
    this.tangent.crossVectors(this.normal, UP).normalize();
    if (this.tangent.x * p.velocity.x + this.tangent.z * p.velocity.z < 0) {
      this.tangent.negate();
    }
  }

  override update(dt: number): void {
    const p = this.player;
    this.elapsed += dt;

    // Wand noch da?
    const hit = p.wallDetector.checkSide(p, this.side);
    if (!hit || this.elapsed * 1000 > WALLRUN_MAX_MS || this.speed < WALLRUN_MIN_SPEED) {
      p.fsm.transition('AIR');
      return;
    }
    this.normal.copy(hit.normal);
    this.updateTangent();

    // Wall-Jump?
    if (p.consumeJumpRequest()) {
      p.velocity.set(
        this.normal.x * WALLJUMP_NORMAL_IMPULSE + this.tangent.x * this.speed * 0.7,
        WALLJUMP_UP_IMPULSE,
        this.normal.z * WALLJUMP_NORMAL_IMPULSE + this.tangent.z * this.speed * 0.7,
      );
      p.bus.emit('trick:walljump', { side: this.side });
      p.fsm.transition('AIR');
      return;
    }

    // Entlang der Wand, leicht abklingend; sanft an die Wand ziehen
    this.speed = Math.max(this.speed - 1 * dt, 0);
    p.velocity.x = this.tangent.x * this.speed - this.normal.x * 0.5;
    p.velocity.z = this.tangent.z * this.speed - this.normal.z * 0.5;
    p.velocity.y -= GRAVITY * WALLRUN_GRAVITY_FACTOR * dt;

    p.applyMovement(dt);
    if (p.grounded) p.fsm.transition('AIR');
  }

  override exit(): void {
    this.player.wallDetector.endRun();
    this.player.wallHit = null;
    this.player.currentWallSide = null;
  }
}

// --------------------------------------------------------------- BALANCE (Task 16d)

class BalanceState extends PlayerState {
  readonly name = 'BALANCE' as const;

  override update(dt: number): void {
    const p = this.player;

    if (p.consumeJumpRequest()) {
      p.balancer.jumpOff(BALANCE_JUMP_VELOCITY);
      p.fsm.transition('AIR');
      return;
    }

    if (!p.balancer.ride(dt)) {
      p.fsm.transition('AIR'); // Kurvenende oder Balance verloren
    }
  }
}

// --------------------------------------------------------------- VAULT

const _bezier = new THREE.Vector3();

class VaultState extends PlayerState {
  readonly name = 'VAULT' as const;
  private plan: VaultPlan | null = null;
  private t = 0;

  override enter(): void {
    const p = this.player;
    this.plan = p.pendingVault;
    p.activeVault = this.plan;
    p.vaultProgress = 0;
    p.pendingVault = null;
    this.t = 0;
    p.grounded = false;
    p.vaultDetector.markVaulted();
    p.bus.emit('trick:vault', { obstacleHeight: this.plan?.obstacleHeight ?? 0, kind: this.plan?.kind });
  }

  override update(dt: number): void {
    const p = this.player;
    const plan = this.plan;
    if (!plan) {
      p.fsm.transition('AIR');
      return;
    }

    this.t = Math.min(this.t + dt / plan.duration, 1);
    p.vaultProgress = this.t;
    quadraticBezier(plan.start, plan.control, plan.end, this.t, _bezier);
    // Eingaben/Kollision ignorieren: Position direkt setzen
    p.body.setNextKinematicTranslation({ x: _bezier.x, y: _bezier.y, z: _bezier.z });

    if (this.t >= 1) {
      // Horizontal-Momentum behalten, sanft weiter in die Luft/auf den Boden
      p.velocity.y = 0;
      p.beginAirborne();
      p.fsm.transition('AIR');
    }
  }

  override exit(): void {
    this.plan = null;
    this.player.activeVault = null;
  }
}

// --------------------------------------------------------------- BAIL

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
    p.velocity.x = 0;
    p.velocity.z = 0;
    if (!p.grounded) p.velocity.y -= GRAVITY * dt;
    p.applyMovement(dt);
    this.remaining -= dt;
    if (this.remaining <= 0) p.fsm.transition('RUN');
  }
}

// --------------------------------------------------------------- SWING (Task 16c)

class SwingState extends PlayerState {
  readonly name = 'SWING' as const;

  override update(dt: number): void {
    const p = this.player;

    // Loslassen: Pendel-Timing bestimmt die Flugbahn
    if (p.consumeJumpRequest()) {
      const chain = p.swinger.release();
      p.bus.emit('trick:swing', { chain });
      p.fsm.transition('AIR');
      return;
    }

    p.swinger.ride(dt);
  }
}

// --------------------------------------------------------------- HANG (Task 16b)

const _edge = new THREE.Vector3();
const _out = new THREE.Vector3();
const _edgeDir = new THREE.Vector3();
const _hangPos = new THREE.Vector3();
const _camRight = new THREE.Vector3();

const HANG_CENTER_OFFSET = CAPSULE_RADIUS + 0.1;

class HangState extends PlayerState {
  readonly name = 'HANG' as const;
  private readonly mantleStart = new THREE.Vector3();
  private readonly mantleEnd = new THREE.Vector3();
  private mantleT = -1; // -1 = hängend, sonst Fortschritt 0..1
  private inputLockUntil = 0;

  override enter(): void {
    const p = this.player;
    this.mantleT = -1;
    p.mantleProgress = -1;
    // Kurze Schonfrist: beim Anflug gehaltene Tasten sollen nicht sofort
    // Mantle/Loslassen auslösen — erst greifen, dann entscheiden
    this.inputLockUntil = simNow() + 250;
    p.velocity.set(0, 0, 0);
    p.grounded = false;
    this.applyHangPosition();
  }

  override update(dt: number): void {
    const p = this.player;

    // --- Hochziehen läuft
    if (this.mantleT >= 0) {
      this.mantleT = Math.min(this.mantleT + dt / MANTLE_S, 1);
      p.mantleProgress = this.mantleT;
      // Pull vertically first, then transfer weight over the ledge and stand.
      const u = this.mantleT;
      const vertical = THREE.MathUtils.smoothstep(u,0,0.85);
      const forward = THREE.MathUtils.smoothstep(u,0.35,1);
      _hangPos.copy(this.mantleStart).lerp(this.mantleEnd,forward);
      _hangPos.y = THREE.MathUtils.lerp(this.mantleStart.y,this.mantleEnd.y,vertical);
      p.body.setNextKinematicTranslation({ x: _hangPos.x, y: _hangPos.y, z: _hangPos.z });
      if (this.mantleT >= 1) {
        p.velocity.set(0, 0, 0);
        p.grounded = true;
        p.fsm.transition('RUN');
      }
      return;
    }

    const input = p.currentInput;
    const locked = simNow() < this.inputLockUntil;
    const moveY = locked ? 0 : (input?.moveY ?? 0);
    const moveX = input?.moveX ?? 0;

    // --- Hochziehen starten (W oder Sprungtaste)
    if (moveY > 0.5 || (!locked && p.consumeJumpRequest())) {
      p.getPosition(this.mantleStart);
      p.climb.edgePoint(_edge);
      p.climb.outward(_out);
      if (!p.climb.mantleTarget(p, this.mantleEnd)) return;
      this.mantleT = 0;
      p.mantleProgress = 0;
      return;
    }

    // --- Loslassen (S)
    if (moveY < -0.5) {
      p.climb.outward(_out);
      p.velocity.set(_out.x * 1.5, 0, _out.z * 1.5); // leicht von der Wand weg
      p.fsm.transition('AIR');
      return;
    }

    // --- Hangeln (A/D, kamerarelativ entlang der Kante)
    if (Math.abs(moveX) > 0.5) {
      p.climb.edgeDir(_edgeDir);
      _camRight.set(Math.cos(p.cameraYaw), 0, -Math.sin(p.cameraYaw));
      const align = _edgeDir.dot(_camRight) >= 0 ? 1 : -1;
      p.climb.shimmy(moveX * align * SHIMMY_SPEED * dt);
    }

    this.applyHangPosition();
  }

  override exit(): void {
    this.player.climb.releaseGrab();
    this.player.mantleProgress = -1;
  }

  /** Kapselzentrum: knapp außerhalb der Kante, Hände auf Kantenhöhe. */
  private applyHangPosition(): void {
    const p = this.player;
    p.climb.edgePoint(_edge);
    p.climb.outward(_out);
    _hangPos.copy(_edge).addScaledVector(_out, HANG_CENTER_OFFSET);
    _hangPos.y = p.climb.grab!.face.y - HANG_CENTER_BELOW;
    p.body.setNextKinematicTranslation({ x: _hangPos.x, y: _hangPos.y, z: _hangPos.z });
  }
}

function quadraticBezier(
  a: THREE.Vector3,
  c: THREE.Vector3,
  b: THREE.Vector3,
  t: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const u = 1 - t;
  out.set(
    u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    u * u * a.y + 2 * u * t * c.y + t * t * b.y,
    u * u * a.z + 2 * u * t * c.z + t * t * b.z,
  );
  return out;
}
