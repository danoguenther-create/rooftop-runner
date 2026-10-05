import RAPIER from '@dimforge/rapier3d-compat';
import {clearTraversal,traversalPoint} from './DynamicParkour';
import * as THREE from 'three';
import type { PlayerController } from './PlayerController';
import type { VaultPlan } from './Vault';
import type { WallSide } from './WallRun';
import {
  BAIL_S,
  BALANCE_JUMP_VELOCITY,
  CAPSULE_RADIUS,
  CAPSULE_HALFHEIGHT,
  GRAVITY,
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
  RUN: ['AIR', 'VAULT', 'BAIL', 'BALANCE', 'HANG'],
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
    if(from==='AIR')this.player.parkour.jumpTarget=null;
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
    if(p.climb.tryDropToHang(p)){p.fsm.transition("HANG");return;}
    p.groundMove(dt);
    const plan = p.parkour.plan(p);
    if (plan) {
      p.pendingVault = plan;
      p.fsm.transition('VAULT');
      return;
    }

    p.climb.tryWallClimb(p);
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

    // Commit to the double-tap dive until contact with the ground. Automatic
    // grabs/vaults otherwise steal its short arc as a nearby crate enters range.
    if (!p.diveJumpActive) {
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
    }
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
  private safePosition=new THREE.Vector3();

  override enter(): void {
    const p = this.player;
    this.plan = p.pendingVault;
    p.activeVault = this.plan;
    p.vaultProgress = 0;
    p.pendingVault = null;
    this.t = 0;
    p.grounded = false;
    p.vaultDetector.markVaulted();
    this.safePosition.copy(p.body.translation());
    p.collider.setShape(new RAPIER.Capsule(this.plan?.halfHeight??.16,.3));
    if(this.plan?.kind==='drop')p.beginAirborne();
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
    traversalPoint(plan,this.t,_bezier);
    const from=new THREE.Vector3().copy(p.body.translation());
    if(!clearTraversal(p,from,_bezier,plan.halfHeight??.16)){
      p.body.setNextKinematicTranslation(this.safePosition);p.velocity.set(0,0,0);p.fsm.transition('AIR');return;
    }
    if(!p.physics.world.intersectionWithShape(_bezier,{x:0,y:0,z:0,w:1},new RAPIER.Capsule(CAPSULE_HALFHEIGHT,CAPSULE_RADIUS-.02),undefined,undefined,p.collider,p.body))this.safePosition.copy(_bezier);
    // Follow the obstacle-matched path only while its swept capsule stays clear.
    p.body.setNextKinematicTranslation({ x: _bezier.x, y: _bezier.y, z: _bezier.z });

    if (this.t >= 1) {
      // Horizontal-Momentum behalten, sanft weiter in die Luft/auf den Boden
      p.velocity.y = 0;
      if(plan.kind!=='drop')p.beginAirborne();
      p.fsm.transition('AIR');
    }
  }

  override exit(): void {
    this.plan = null;
    this.player.activeVault = null;
    this.player.collider.setShape(new RAPIER.Capsule(CAPSULE_HALFHEIGHT,CAPSULE_RADIUS));
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


class HangState extends PlayerState {
  readonly name = 'HANG' as const;
  private readonly mantleStart = new THREE.Vector3();
  private readonly mantleEnd = new THREE.Vector3();
  private mantleT = -1; // -1 = hängend, sonst Fortschritt 0..1
  private inputLockUntil = 0;
  private mantleIntent = 0;

  override enter(): void {
    const p = this.player;
    this.mantleT = -1;
    this.mantleIntent = 0;
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

    if(p.climb.transfer){
      if(!p.climb.tickTransfer(p,dt)){p.velocity.set(0,0,0);p.fsm.transition("AIR");}
      return;
    }
    p.climb.updateBracing(p);

    // --- Hochziehen läuft
    if (this.mantleT >= 0) {
      this.mantleT = Math.min(this.mantleT + dt / MANTLE_S, 1);
      p.mantleProgress = this.mantleT;
      // Pull vertically first, then transfer weight over the ledge and stand.
      const u = this.mantleT;
      const vertical = THREE.MathUtils.smoothstep(u,0,0.58);
      const forward = THREE.MathUtils.smoothstep(u,0.6,1);
      _hangPos.copy(this.mantleStart).lerp(this.mantleEnd,forward);
      _hangPos.y = THREE.MathUtils.lerp(this.mantleStart.y,this.mantleEnd.y,vertical);
      if(!clearTraversal(p,new THREE.Vector3().copy(p.body.translation()),_hangPos,CAPSULE_HALFHEIGHT,CAPSULE_RADIUS-.02)){
        p.velocity.set(0,0,0);p.fsm.transition('AIR');return;
      }
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
    const jump=p.consumeJumpRequest();
    const moveY = locked&&!jump ? 0 : (input?.moveY ?? 0);
    const moveX = input?.moveX ?? 0;

    if(jump&&(Math.abs(moveX)>.5||moveY>=0)){
      p.climb.edgeDir(_camRight);
      const cameraRight=new THREE.Vector3(Math.cos(p.cameraYaw),0,-Math.sin(p.cameraYaw));
      _camRight.multiplyScalar((_camRight.dot(cameraRight)>=0?1:-1)*Math.sign(moveX));
      if(p.climb.tryTransfer(p,Math.abs(moveX)>.5?0:1,Math.abs(moveX)>.5?_camRight.normalize():null))return;
      if(Math.abs(moveX)>.5)return; // A failed sideways hop must not start an unrelated mantle.
    }
    // Existing W / jump mantle input stays available when no transfer fits.
    if(moveY<=.5)this.mantleIntent=0;
    if (moveY > 0.5 || jump) {
      if(!jump){this.mantleIntent+=dt;if(this.mantleIntent<.16)return;}
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
      if(p.climb.tryTransfer(p,-1))return;
      p.climb.outward(_out);
      p.velocity.set(_out.x * 1.5, 0, _out.z * 1.5); // leicht von der Wand weg
      p.fsm.transition('AIR');
      return;
    }

    if(Math.abs(moveX)<=.5)p.climb.sideContinuation=null;
    // --- Hangeln (A/D, kamerarelativ entlang der Kante)
    if (Math.abs(moveX) > 0.5) {
      p.climb.edgeDir(_edgeDir);
      _camRight.set(Math.cos(p.cameraYaw), 0, -Math.sin(p.cameraYaw));
      const align = _edgeDir.dot(_camRight) >= 0 ? 1 : -1;
      p.climb.moveAlong(p,moveX * align * SHIMMY_SPEED * dt);
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
    p.climb.hangPosition(_hangPos);
    p.body.setNextKinematicTranslation({ x: _hangPos.x, y: _hangPos.y, z: _hangPos.z });
  }
}
