import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { EventBus } from '../core/EventBus';
import type { InputState } from '../core/Input';
import type { LevelLoader } from '../level/LevelLoader';
import { StateMachine } from './PlayerStates';
import { AirTricks } from './AirTricks';
import { Climber } from './Climb';
import { Swinger } from './Swing';
import { WallRunDetector, type WallHit, type WallSide } from './WallRun';
import { VaultDetector, type VaultPlan } from './Vault';
import { RailGrinder } from './RailGrind';
import {
  ACCEL,
  AIR_CONTROL,
  CAPSULE_HALFHEIGHT,
  CAPSULE_RADIUS,
  COYOTE_MS,
  DECEL,
  DIVE_GRAVITY_FACTOR,
  GRAVITY,
  HARD_LANDING_LOCK_S,
  JUMP_BUFFER_MS,
  JUMP_VELOCITY,
  LANDING_BAIL_M,
  LANDING_SOFT_M,
  ROLL_AFTER_MS,
  ROLL_BEFORE_MS,
  ROLL_BOOST,
  ROLL_BOOST_DIVE,
  ROLL_BOOST_S,
  RUN_SPEED,
  SPRINT_SPEED,
} from './tuning';

// Wiederverwendbare Temp-Objekte (keine Allokationen im Frame-Loop)
const _wish = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = { x: 0, y: 0, z: 0 };

/** Abstand Kapselzentrum -> Fußsohle */
const CENTER_TO_FEET = CAPSULE_HALFHEIGHT + CAPSULE_RADIUS;

export class PlayerController {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  private readonly cc: RAPIER.KinematicCharacterController;

  /** Ist-Geschwindigkeit in Weltkoordinaten (m/s) */
  readonly velocity = new THREE.Vector3();
  grounded = false;
  lastFallHeight = 0;

  readonly fsm: StateMachine;
  /** Kamera-Yaw für kamerarelative Bewegung (jeden Frame von Game gesetzt) */
  cameraYaw = 0;

  // Parkour-Systeme (M2)
  readonly wallDetector = new WallRunDetector();
  readonly vaultDetector = new VaultDetector();
  readonly grinder: RailGrinder;
  /** Lufttricks (Task 15b): Flips + Spins, rein visuell bis zur Landung */
  readonly airTricks = new AirTricks();
  /** Diveroll (Task 15c): C in der Luft gehalten = Hechtsprung */
  private diving = false;
  /** Wandlauf + Ledge-Grab (Task 16b) */
  readonly climb = new Climber();
  /** Stangenschwingen (Task 16c) */
  readonly swinger: Swinger;
  /** Aktueller Wanderkennungs-Treffer (AIR) bzw. aktive Wand (WALLRUN) */
  wallHit: WallHit | null = null;
  /** Für Kamera-Tilt + Debug: Seite der aktiven Wall-Run-Wand */
  currentWallSide: WallSide | null = null;
  /** Vom Zustandswechsel RUN/AIR -> VAULT übergebener Bewegungsplan */
  pendingVault: VaultPlan | null = null;

  /** Sichtbarer Platzhalter (Kapsel); Charaktermodell kommt in Task 21 */
  readonly mesh: THREE.Group;

  private input: InputState | null = null;
  private readonly spawnPos = new THREE.Vector3();

  // Timing (performance.now()-Basis für Eingabe-Fenster)
  private timeSinceGroundedS = 0;
  private jumpRequestedAt = -Infinity;
  private lastRollPressAt = -Infinity;
  private prevRollHeld = false;

  // Fallhöhe & Lande-Fenster (Task 8)
  private peakY = 0;
  private pendingLanding: { fallHeight: number; remaining: number; landedAt: number } | null =
    null;
  private boostRemaining = 0;
  private boostFactor = ROLL_BOOST;
  private noAccelRemaining = 0;

  private meshYaw = 0;

  constructor(
    readonly physics: PhysicsWorld,
    readonly bus: EventBus,
    scene: THREE.Scene,
    readonly level: LevelLoader,
  ) {
    const spawn = level.spawn;
    this.spawnPos.copy(spawn);
    this.grinder = new RailGrinder(this);
    this.swinger = new Swinger(this);

    const startY = spawn.y + CENTER_TO_FEET + 0.1;
    this.body = physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, startY, spawn.z),
    );
    this.collider = physics.world.createCollider(
      RAPIER.ColliderDesc.capsule(CAPSULE_HALFHEIGHT, CAPSULE_RADIUS),
      this.body,
    );

    this.cc = physics.world.createCharacterController(0.01);
    this.cc.enableAutostep(0.4, 0.2, true);
    this.cc.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    this.cc.enableSnapToGround(0.3);

    this.mesh = new THREE.Group();
    const capsule = new THREE.Mesh(
      new THREE.CapsuleGeometry(CAPSULE_RADIUS, CAPSULE_HALFHEIGHT * 2, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0xff6a00 }),
    );
    capsule.castShadow = true;
    // Nase als Blickrichtungs-Indikator (bis das Charaktermodell kommt)
    const nose = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, 0.25),
      new THREE.MeshStandardMaterial({ color: 0xffffff }),
    );
    nose.position.set(0, 0.45, -CAPSULE_RADIUS - 0.05);
    this.mesh.add(capsule, nose);
    scene.add(this.mesh);

    this.fsm = new StateMachine(this);
    this.peakY = startY;
  }

  // ---------------------------------------------------------- Frame-Eingang

  /** Einmal pro Render-Frame: Edge-Trigger latchen. */
  handleFrameInput(input: InputState): void {
    this.input = input;
    const now = performance.now();
    if (input.jumpPressed) this.jumpRequestedAt = now;
    if (input.rollHeld && !this.prevRollHeld) this.lastRollPressAt = now;
    this.prevRollHeld = input.rollHeld;
    // Lufttricks nur im freien Flug queuen
    if (this.fsm.current === 'AIR') {
      if (input.flipPressed) this.airTricks.queueFlip(input.flipPressed);
      if (input.spinPressed !== 0) this.airTricks.queueSpin(input.spinPressed);
      if (input.rollHeld) this.diving = true; // Dive angesetzt (bis zur Landung)
    }
    if (input.respawnPressed) this.respawn();
  }

  /** Render-Takt: Mesh nachziehen, Blickrichtung weich drehen. */
  update(dt: number): void {
    const t = this.body.translation();
    this.mesh.position.set(t.x, t.y, t.z);

    const hs = Math.hypot(this.velocity.x, this.velocity.z);
    if (hs > 0.5) {
      const targetYaw = Math.atan2(this.velocity.x, this.velocity.z);
      let delta = targetYaw - this.meshYaw;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      this.meshYaw += delta * (1 - Math.exp(-12 * dt));
    }
    this.mesh.rotation.y = this.meshYaw;
    this.airTricks.applyVisual(this.mesh);
    // Dive-Pose: nach vorn gekippt, solange kein Flip rotiert
    if (this.diving && !this.airTricks.active && this.fsm.current === 'AIR') {
      this.mesh.rotation.x = 0.7;
    }
  }

  // ---------------------------------------------------------- Physik-Takt

  fixedUpdate(dt: number): void {
    if (!this.input) return;

    this.timeSinceGroundedS = this.grounded ? 0 : this.timeSinceGroundedS + dt;
    if (this.boostRemaining > 0) this.boostRemaining -= dt;
    if (this.noAccelRemaining > 0) this.noAccelRemaining -= dt;

    // Lufttricks rotieren nur im freien Flug weiter; wer stattdessen an
    // Wand/Rail/Hindernis landet, verliert die Rotation kommentarlos
    if (this.fsm.current === 'AIR') this.airTricks.update(dt);
    else if (this.fsm.current !== 'RUN') {
      if (this.airTricks.active) this.airTricks.cancel();
      this.diving = false;
    }

    this.climb.tick(this); // Wand-Push nach abgelaufenem Wandlauf
    this.fsm.update(dt);

    // Sicherheitsnetz: aus der Welt gefallen
    if (this.body.translation().y < -10) this.respawn();
  }

  /** Bodenbewegung: Beschleunigen/Bremsen Richtung Wunschgeschwindigkeit. */
  groundMove(dt: number): void {
    this.accelerateHorizontal(dt, 1);
    if (this.grounded && this.velocity.y < 0) this.velocity.y = -2; // Boden-Haftung
  }

  /** Luftbewegung: reduzierte Steuerwirkung + Gravitation. */
  airMove(dt: number): void {
    this.accelerateHorizontal(dt, AIR_CONTROL);
    // Gehaltener Dive streckt den Steigflug: flachere, weitere Flugbahn
    const diveFloat = this.diving && this.velocity.y > 0 && (this.input?.rollHeld ?? false);
    this.velocity.y -= GRAVITY * (diveFloat ? DIVE_GRAVITY_FACTOR : 1) * dt;
    const y = this.body.translation().y;
    if (y > this.peakY) this.peakY = y;
  }

  private accelerateHorizontal(dt: number, control: number): void {
    const input = this.input!;

    // Wunschrichtung kamerarelativ
    _forward.set(-Math.sin(this.cameraYaw), 0, -Math.cos(this.cameraYaw));
    _right.set(Math.cos(this.cameraYaw), 0, -Math.sin(this.cameraYaw));
    _wish
      .set(0, 0, 0)
      .addScaledVector(_right, input.moveX)
      .addScaledVector(_forward, input.moveY);
    const wishLen = Math.min(_wish.length(), 1);
    if (wishLen > 0) _wish.normalize();

    let maxSpeed = input.sprintHeld ? SPRINT_SPEED : RUN_SPEED;
    if (this.boostRemaining > 0) maxSpeed *= this.boostFactor;

    const targetX = _wish.x * maxSpeed * wishLen;
    const targetZ = _wish.z * maxSpeed * wishLen;

    // Nach harter Landung: nur bremsen, nicht beschleunigen
    const accelBlocked = this.noAccelRemaining > 0;
    const rate = (wishLen > 0 && !accelBlocked ? ACCEL : DECEL) * control * dt;

    this.velocity.x = moveToward(this.velocity.x, accelBlocked ? 0 : targetX, rate);
    this.velocity.z = moveToward(this.velocity.z, accelBlocked ? 0 : targetZ, rate);
  }

  /** Sprung, wenn gepuffert + (grounded oder Coyote-Fenster). */
  tryJump(): boolean {
    const now = performance.now();
    const buffered = now - this.jumpRequestedAt <= JUMP_BUFFER_MS;
    const canJump = this.grounded || this.timeSinceGroundedS * 1000 <= COYOTE_MS;
    if (!buffered || !canJump || this.velocity.y > 1) return false;
    this.velocity.y = JUMP_VELOCITY;
    this.jumpRequestedAt = -Infinity;
    this.grounded = false;
    this.timeSinceGroundedS = 1; // Coyote sofort verbrauchen
    return true;
  }

  /**
   * Gepufferte Sprung-Eingabe abholen, ohne Boden-Bedingung — für
   * kontextabhängige Sprünge (Wall-Jump, Rail-Absprung).
   */
  consumeJumpRequest(): boolean {
    if (performance.now() - this.jumpRequestedAt > JUMP_BUFFER_MS) return false;
    this.jumpRequestedAt = -Infinity;
    return true;
  }

  /** Geschwindigkeit über den Character-Controller anwenden (Kollision). */
  applyMovement(dt: number): void {
    _move.x = this.velocity.x * dt;
    _move.y = this.velocity.y * dt;
    _move.z = this.velocity.z * dt;
    this.cc.computeColliderMovement(this.collider, _move);
    const m = this.cc.computedMovement();
    const t = this.body.translation();
    this.body.setNextKinematicTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z });
    this.grounded = this.cc.computedGrounded();

    // Kopf gestoßen: Aufwärtsbewegung wurde geblockt
    if (!this.grounded && this.velocity.y > 0 && m.y < this.velocity.y * dt * 0.5) {
      this.velocity.y = 0;
    }
  }

  // ---------------------------------------------------------- Landung (Task 8)

  /** Beim Eintritt in AIR: Fallhöhen-Tracking zurücksetzen. */
  beginAirborne(): void {
    this.peakY = this.body.translation().y;
  }

  /**
   * Beim Übergang AIR -> RUN aufrufen.
   * @returns true, wenn eine unfertige Flip-Rotation die Landung in einen
   *          BAIL zwingt (Aufrufer wechselt dann nach BAIL statt RUN).
   */
  onLanded(): boolean {
    const fallHeight = Math.max(0, this.peakY - this.body.translation().y);
    this.lastFallHeight = fallHeight;
    this.swinger.resetChain(); // Bodenkontakt beendet die Stangen-Kette

    // Lufttricks zuerst: unfertige Rotation überstimmt die Roll-Logik
    if (this.airTricks.evaluateLanding(this.bus, this.horizontalSpeed)) {
      this.pendingLanding = null;
      this.diving = false;
      return true;
    }

    // Diveroll (Task 15c): Dive angesetzt?
    if (this.diving) {
      this.diving = false;
      if (this.input?.rollHeld) {
        // C bis zur Landung gehalten -> automatische Rolle mit stärkerem Boost
        this.boostRemaining = ROLL_BOOST_S;
        this.boostFactor = ROLL_BOOST_DIVE;
        this.bus.emit('trick:diveroll', { fallHeight });
        return false;
      }
      // Dive ohne Rolle: Bail-Schwelle sinkt auf LANDING_SOFT_M
      if (fallHeight > LANDING_SOFT_M) return true;
    }

    if (fallHeight <= LANDING_SOFT_M) return false;

    const now = performance.now();
    if (now - this.lastRollPressAt <= ROLL_BEFORE_MS) {
      this.doRoll(fallHeight);
    } else {
      // Kurzes Nachdrück-Fenster, Auflösung in tickLandingWindow
      this.pendingLanding = {
        fallHeight,
        remaining: ROLL_AFTER_MS / 1000,
        landedAt: now,
      };
    }
    return false;
  }

  /** Läuft im RUN-Zustand: löst das Roll-Nachdrück-Fenster auf. */
  tickLandingWindow(dt: number): void {
    const pending = this.pendingLanding;
    if (!pending) return;

    if (this.lastRollPressAt >= pending.landedAt) {
      this.pendingLanding = null;
      this.doRoll(pending.fallHeight);
      return;
    }
    pending.remaining -= dt;
    if (pending.remaining > 0) return;

    this.pendingLanding = null;
    if (pending.fallHeight > LANDING_BAIL_M) {
      this.fsm.transition('BAIL');
    } else {
      this.velocity.x *= 0.5;
      this.velocity.z *= 0.5;
      this.noAccelRemaining = HARD_LANDING_LOCK_S;
      this.bus.emit('player:hardLanding', { fallHeight: pending.fallHeight });
    }
  }

  private doRoll(fallHeight: number): void {
    this.boostRemaining = ROLL_BOOST_S;
    this.boostFactor = ROLL_BOOST;
    this.bus.emit('player:roll', { fallHeight });
  }

  // ---------------------------------------------------------- Sonstiges

  respawn(): void {
    // Aktiven Zustand sauber verlassen (GRIND/HANG würden sonst die
    // Position weiter setzen; WALLRUN/VAULT halten Referenzen)
    if (this.fsm.current === 'GRIND') this.grinder.jumpOff(0);
    if (this.fsm.current === 'SWING') this.swinger.release();
    if (this.fsm.current === 'BAIL') this.fsm.transition('RUN');
    else this.fsm.transition('AIR'); // aus RUN/AIR/WALLRUN/GRIND/VAULT erlaubt

    const y = this.spawnPos.y + CENTER_TO_FEET + 0.1;
    this.body.setTranslation({ x: this.spawnPos.x, y, z: this.spawnPos.z }, true);
    this.body.setNextKinematicTranslation({ x: this.spawnPos.x, y, z: this.spawnPos.z });
    this.velocity.set(0, 0, 0);
    this.peakY = y;
    this.pendingLanding = null;
    this.pendingVault = null;
    this.boostRemaining = 0;
    this.noAccelRemaining = 0;
    this.airTricks.cancel();
    this.diving = false;
  }

  getPosition(out: THREE.Vector3): THREE.Vector3 {
    const t = this.body.translation();
    return out.set(t.x, t.y, t.z);
  }

  get horizontalSpeed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  /** Aktueller Frame-Input (für Zustände wie HANG). */
  get currentInput(): InputState | null {
    return this.input;
  }

  /** Kamerarelative Wunschrichtung (normalisiert) oder null ohne Input. */
  getWishDir(out: THREE.Vector3): THREE.Vector3 | null {
    const input = this.input;
    if (!input) return null;
    _forward.set(-Math.sin(this.cameraYaw), 0, -Math.cos(this.cameraYaw));
    _right.set(Math.cos(this.cameraYaw), 0, -Math.sin(this.cameraYaw));
    out.set(0, 0, 0).addScaledVector(_right, input.moveX).addScaledVector(_forward, input.moveY);
    if (out.lengthSq() < 0.25) return null;
    return out.normalize();
  }
}

/** Bewegt value um maxDelta Richtung target (ohne Überschwingen). */
function moveToward(value: number, target: number, maxDelta: number): number {
  const diff = target - value;
  if (Math.abs(diff) <= maxDelta) return target;
  return value + Math.sign(diff) * maxDelta;
}

