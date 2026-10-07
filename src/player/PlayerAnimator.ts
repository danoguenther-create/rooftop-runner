import * as THREE from "three";
import { visualTrial } from "../level/FactoryPreview";
import type { EventBus } from "../core/EventBus";
import type { StateName } from "./PlayerStates";
import { GRAVITY, LANDING_BAIL_M } from "./tuning";
import { motionMarkers } from "../core/AssetLoader";
import type { FlipKind } from "./AirTricks";

const FADE_S = 0.15;
/** Bodenrolle knackiger abspielen als der gemächliche Mixamo-Clip. */
const ROLL_TIMESCALE = 1.5;
/**
 * Einstiegszeitpunkt je Clip (per Hips-Kurve vermessen). Die 2026-07-10
 * hochgeladenen Jump-Clips starten direkt im Absprung (keine Aushol-Hocke
 * mehr); wallclimb hat vorn ~0,3 s Absprung-Hocke.
 */
const CLIP_START_S: Record<string, number> = {
  jump: 0.05,
  "running-jump": 0.05,
  wallclimb: 0.3,
  // Vault-Clip: 0,3 s Anlauf, eigentliche Überwindung 0,3–1,3 s
  vault: 0.3,
};

/** Clips, die einmalig durchlaufen und dann auf dem letzten Frame halten. */
const ONE_SHOT = new Set([
  "jump",
  "running-jump",
  "land",
  "wallclimb",
  "vault",
  "land-soft",
  "land-stand",
  "land-precision",
  "land-run",
  "land-hard",
  "hang-catch",
  "hang-crouch",
]);
/** Abspieltempo je Clip (Beine ziehen sonst zu träge an, Spieler-Feedback). */
const CLIP_TIMESCALE: Record<string, number> = {
  jump: 1.35,
  "running-jump": 1.2,
  // 1 s Vault-Bewegung im Clip auf VAULT_DURATION_S 0,4 s gestaucht
  vault: 2.5,
};
/** Ab dieser Horizontalgeschwindigkeit nimmt der Absprung den Anlauf-Clip. */
const RUNNING_JUMP_MIN_SPEED = 4;

/**
 * Bindet die Mixamo-Clips an die Player-FSM (Task 21). Rein visuell:
 * liest Zustand + Geschwindigkeit, entscheidet den Ziel-Clip und blendet
 * mit kurzem CrossFade um. Fehlende Clips fallen auf idle/fall zurück —
 * so kann Daniel später weitere Animationen (Hang, Balance …) nachliefern,
 * ohne dass bis dahin etwas kaputt ist.
 */
export class PlayerAnimator {
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private currentName = "";
  private time = 0;
  /** Bis dahin hat ein One-Shot (Rolle) Vorrang vor der Zustandslogik. */
  private lockUntil = 0;
  /** Set by the controller each frame (see PlayerController.update). */
  timeToLanding = Infinity;
  landingKind: "precision" | "soft" | "run" | "hard" = "soft";
  flip: { kind: FlipKind; target: number; progress: number } | null = null;
  /** Share of the flip the clip rotates; the controller hands it to AirTricks. */
  flipShare = 0;
  private previousState: StateName = "RUN";
  /** Motion-capture jump locked onto the physical one (takeoff, apex, touchdown). */
  private air: { name: string; elapsed: number; vy0: number } | null = null;
  /** Catching a ledge from a jump: the body swings in under the hands. */
  private catchUntil = 0;
  private hangPhase = -1;
  /** Landing clip started at its touchdown frame. */
  private landing: { name: string; until: number; lowAt: number; run: boolean } | null = null;

  constructor(
    model: THREE.Group,
    clips: Map<string, THREE.AnimationClip>,
    bus: EventBus,
  ) {
    this.mixer = new THREE.AnimationMixer(model);
    for (const [name, clip] of clips) {
      this.actions.set(name, this.mixer.clipAction(clip));
    }
    // Falling To Roll ist laut Daniel eine Landung aus größerer Höhe —
    // flache Landungen nehmen die knackigere Sprint-Rolle
    bus.on("player:roll", (e) => {
      const name =
        e.fallHeight <= LANDING_BAIL_M && this.actions.has("sprint-roll")
          ? "sprint-roll"
          : "roll";
      this.playOneShot(name, ROLL_TIMESCALE);
    });
    bus.on("trick:diveroll", () =>
      this.playOneShot(
        // landing-roll is a landing recovery, without a full shoulder rotation.
        this.actions.has("sprint-roll") ? "sprint-roll" : "roll",
        1.75,
      ),
    );
  }

  get isRolling(): boolean { return this.time<this.lockUntil && ["sprint-roll","roll"].includes(this.currentName); }

  get clipName(): string { return this.currentName; }

  /** Render-Takt: Ziel-Clip aus FSM-Zustand + Bewegung ableiten. */
  update(
    dt: number,
    state: StateName,
    hSpeed: number,
    vy: number,
    climbing: boolean,
    mantle = -1,
    vault = 0,
    diveJump = false,
    hangClip: string | null = null,
    hangPhase = -1,
  ): void {
    this.time += dt;
    this.hangPhase = hangPhase;
    const motion = this.motionClip(dt, state, hSpeed, vy, climbing, diveJump);
    const contact = diveJump || state === "HANG" || state === "SWING" || state === "VAULT" || state === "WALLRUN";
    if (contact) this.lockUntil = 0; // an earlier roll cannot delay a new grip pose
    if (this.time >= this.lockUntil) {
      this.play(
        diveJump ? "idle" : motion?.name === "hang-catch" ? motion.name : state==="HANG" && hangClip && this.actions.has(hangClip) ? hangClip : mantle >= 0 ? "wallclimb" : motion?.name ?? this.pickClip(state, hSpeed, vy, climbing),
      );
      // Scrubbed by physics phase, not played through.
      if (motion && this.current && this.currentName === motion.name) {
        if (motion.time === null) this.current.paused = false;
        else { this.current.paused = true; this.current.time = motion.time; }
      }
    }
    if (this.current) {
      if(state==='HANG'&&hangClip&&hangPhase>=0&&this.actions.has(hangClip)){
        this.current.paused=true;this.current.time=hangPhase*this.current.getClip().duration;
      } else if (state === "VAULT" || mantle >= 0) {
        const phase = state === "VAULT" ? vault : mantle;
        const duration = this.current.getClip().duration;
        this.current.paused = true;
        this.current.time =
          state === "VAULT"
            ? THREE.MathUtils.lerp(0.3, Math.min(duration, 1.3), phase)
            : THREE.MathUtils.lerp(0.3, Math.min(duration, 1.5), phase);
      } else if(state==="HANG") {
        this.current.paused=false;
      } else if (this.currentName === "run" || this.currentName === "sprint") {
        this.current.setEffectiveTimeScale(
          THREE.MathUtils.clamp(
            hSpeed / (this.currentName === "run" ? 5.5 : 8.5),
            0.35,
            1.5,
          ),
        );
      }
    }
    this.mixer.update(dt);
  }

  /**
   * Motion-capture clips keyed to the physics: a jump clip leaves the ground
   * on the real takeoff, reaches its apex with the body and touches down when
   * the feet do; a flip clip follows the flip's progress; a landing clip
   * starts at its touchdown frame. null = the state machine's usual clip.
   */
  private motionClip(dt: number, state: StateName, hSpeed: number, vy: number, climbing: boolean, diveJump: boolean): { name: string; time: number | null } | null {
    const previous = this.previousState;
    this.previousState = state;
    this.flipShare = 0;
    if (state === "AIR" && previous !== "AIR") {
      const name = hSpeed > RUNNING_JUMP_MIN_SPEED ? "jump-run" : "jump-stand";
      this.air = vy > 1 && motionMarkers.has(name) ? { name, elapsed: 0, vy0: vy } : null;
    }
    if (state !== "AIR") this.air = null;
    if (state === "HANG" && previous === "AIR" && motionMarkers.has("hang-catch")) {
      this.catchUntil = this.time + 0.75;
      this.play("hang-catch");
      // From the moment the hands close on the edge.
      if (this.current && this.currentName === "hang-catch") { this.current.time = 0.45; this.current.paused = false; }
    }
    if (state === "HANG" && this.time < this.catchUntil && this.hangPhase < 0) return { name: "hang-catch", time: null };
    if (state !== "HANG") this.catchUntil = 0;
    // A roll (dive roll, auto-roll) owns the touchdown.
    if (state === "RUN" && previous === "AIR" && this.landingKind !== "hard" && this.time >= this.lockUntil && !diveJump) {
      const name = { precision: "land-precision", soft: hSpeed < 2.5 ? "land-stand" : "land-soft", run: "land-run" }[this.landingKind];
      const m = motionMarkers.get(name);
      if (m) {
        const touch = m.touchdown ?? 0, low = m.lowest ?? touch + 0.25;
        // At sprint pace the clip's own steps are far slower than the runner:
        // keep only the absorbing crouch, then the sprint cycle takes over.
        const run = this.landingKind === "run" ? (hSpeed > 6 ? 0.42 : m.duration - touch) : low - touch + 0.3;
        this.landing = { name, until: this.time + run, lowAt: this.time + low - touch, run: this.landingKind === "run" };
        this.play(name);
        if (this.current && this.currentName === name) { this.current.time = touch; this.current.paused = false; }
      }
    }
    if (this.landing) {
      // Running on after the crouch cuts the recovery short.
      const breakOut = !this.landing.run && hSpeed > 3 && this.time > this.landing.lowAt;
      if (state !== "RUN" || this.time >= this.landing.until || breakOut || this.time < this.lockUntil) this.landing = null;
      else return { name: this.landing.name, time: null };
    }
    if (state !== "AIR" || climbing || diveJump) return null;
    const air = this.air;
    if (air) air.elapsed += dt;
    const flip = this.flip;
    if (flip && (flip.kind === "front" || flip.kind === "back") && flip.progress < flip.target) {
      const name = `flip-${flip.kind}`, m = motionMarkers.get(name);
      if (m?.turn?.length) {
        // The clip turns once; further turns stay procedural. Progress maps
        // through the clip's measured rotation, not its takeoff..touchdown
        // span: mocap flips land folded and finish the turn on the ground,
        // so the airborne span alone would leave the body half inverted.
        this.flipShare = 1 / flip.target;
        const turn = m.turn, deg = Math.min(1, flip.progress / flip.target) * turn[turn.length - 1][1];
        let k = 1;
        while (k < turn.length - 1 && turn[k][1] < deg) k++;
        const [t0, a0] = turn[k - 1], [t1, a1] = turn[k];
        return { name, time: t0 + (t1 - t0) * (a1 > a0 ? Math.min(1, Math.max(0, (deg - a0) / (a1 - a0))) : 1) };
      }
    }
    // A finished flip opens into the jump's descent: legs reach for the ground.
    if (!air) return null;
    const m = motionMarkers.get(air.name)!;
    if (m.takeoff === null || m.apex === null || m.touchdown === null) return null;
    if (vy > 0) {
      const toApex = air.vy0 / GRAVITY;
      return { name: air.name, time: m.takeoff + (m.apex - m.takeoff) * Math.min(1, air.elapsed / toApex) };
    }
    const span = m.touchdown - m.apex, tti = this.timeToLanding;
    // A long fall hands over to the falling loop until the ground is near.
    if (tti > span + 0.35) return { name: "fall", time: null };
    return { name: air.name, time: m.touchdown - Math.min(span, tti) };
  }

  private pickClip(
    state: StateName,
    hSpeed: number,
    vy: number,
    climbing: boolean,
  ): string {
    switch (state) {
      case "RUN":
        if (hSpeed > 7) return "sprint";
        if (hSpeed > 0.5) return "run";
        return "idle";
      case "AIR":
        if (
          !climbing &&
          (this.currentName === "jump" ||
            this.currentName === "running-jump") &&
          this.current &&
          this.current.time < this.current.getClip().duration * 0.9
        )
          return this.currentName;
        // Vertikaler Wandlauf hat Vorrang (Climber wirkt im AIR-Zustand)
        if (climbing) return "wallclimb";
        // Aufwärtsphase nach Absprung: Jump-Clip (mit/ohne Anlauf) halten,
        // bis der Scheitel überschritten ist; danach Falling-Loop
        if (vy > 1) {
          if (
            this.currentName === "jump" ||
            this.currentName === "running-jump"
          ) {
            return this.currentName;
          }
          if (this.currentName !== "fall") {
            return hSpeed > RUNNING_JUMP_MIN_SPEED ? "running-jump" : "jump";
          }
        }
        return "fall";
      case "WALLRUN":
        return "run"; // feet-on-wall IK supplies the wall contact, torso stays upright
      case "VAULT":
        return "idle"; // contact pose drives the short one-hand vault
      case "BAIL":
        return "land";
      case "BALANCE":
        // Catwalk-Gang beim Gehen, im Stand eingefroren wirkt Idle ruhiger
        return hSpeed > 0.5 ? "balance" : "idle";
      case "HANG":
      case "SWING":
        return "hang";
    }
  }

  private play(name: string): void {
    if (this.currentName === name) return;
    const next = this.actions.get(name) ?? this.actions.get("idle");
    if (!next || next === this.current) return;

    const locomotion=visualTrial && ["run","sprint"].includes(name) && ["run","sprint"].includes(this.currentName);
    const phase=locomotion&&this.current ? (this.current.time/this.current.getClip().duration)%1 : 0;
    next.reset();
    next.paused = false;
    next.time = CLIP_START_S[name] ?? 0;
    next.setLoop(
      ONE_SHOT.has(name) ? THREE.LoopOnce : THREE.LoopRepeat,
      Infinity,
    );
    next.clampWhenFinished = true;
    next.setEffectiveTimeScale(CLIP_TIMESCALE[name] ?? 1);
    if(locomotion) next.time=phase*next.getClip().duration;
    next.play();
    // Landings and flips must read on the frame they happen: short blends.
    const fade=name.startsWith("land-")?.07:name.startsWith("flip-")?.1:name.startsWith("jump-")?.08:visualTrial ? (locomotion?.22:(["fall","jump","running-jump"].includes(name)?.19:FADE_S)) : FADE_S;
    if (this.current) next.crossFadeFrom(this.current, fade, false);
    this.current = next;
    this.currentName = name;
  }

  /** Rolle o. Ä. einmalig abspielen; solange keine Zustandslogik. */
  private playOneShot(name: string, timeScale: number): void {
    const action = this.actions.get(name);
    if (!action) return;
    action.reset();
    action.paused = false;
    action.setEffectiveWeight(1);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.setEffectiveTimeScale(timeScale);
    action.play();
    if (this.current && this.current !== action) {
      action.crossFadeFrom(this.current, FADE_S, false);
    }
    this.current = action;
    this.currentName = name;
    this.lockUntil = this.time + action.getClip().duration / timeScale - FADE_S;
  }
}
