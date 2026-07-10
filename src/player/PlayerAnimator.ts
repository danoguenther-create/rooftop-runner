import * as THREE from 'three';
import type { EventBus } from '../core/EventBus';
import type { StateName } from './PlayerStates';

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
  'running-jump': 0.05,
  wallclimb: 0.3,
  // Vault-Clip: 0,3 s Anlauf, eigentliche Überwindung 0,3–1,3 s
  vault: 0.3,
};

/** Clips, die einmalig durchlaufen und dann auf dem letzten Frame halten. */
const ONE_SHOT = new Set(['jump', 'running-jump', 'land', 'wallclimb', 'vault']);
/** Abspieltempo je Clip (Beine ziehen sonst zu träge an, Spieler-Feedback). */
const CLIP_TIMESCALE: Record<string, number> = {
  jump: 1.35,
  'running-jump': 1.2,
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
  private currentName = '';
  private time = 0;
  /** Bis dahin hat ein One-Shot (Rolle) Vorrang vor der Zustandslogik. */
  private lockUntil = 0;

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
    bus.on('player:roll', (e) => {
      const name =
        e.fallHeight < 4 && this.actions.has('sprint-roll') ? 'sprint-roll' : 'roll';
      this.playOneShot(name, ROLL_TIMESCALE);
    });
    bus.on('trick:diveroll', () =>
      this.playOneShot(this.actions.has('landing-roll') ? 'landing-roll' : 'roll', ROLL_TIMESCALE),
    );
  }

  /** Render-Takt: Ziel-Clip aus FSM-Zustand + Bewegung ableiten. */
  update(dt: number, state: StateName, hSpeed: number, vy: number, climbing: boolean): void {
    this.time += dt;
    if (this.time >= this.lockUntil) {
      this.play(this.pickClip(state, hSpeed, vy, climbing));
    }
    this.mixer.update(dt);
  }

  private pickClip(state: StateName, hSpeed: number, vy: number, climbing: boolean): string {
    switch (state) {
      case 'RUN':
        if (hSpeed > 7) return 'sprint';
        if (hSpeed > 0.5) return 'run';
        return 'idle';
      case 'AIR':
        // Vertikaler Wandlauf hat Vorrang (Climber wirkt im AIR-Zustand)
        if (climbing) return 'wallclimb';
        // Aufwärtsphase nach Absprung: Jump-Clip (mit/ohne Anlauf) halten,
        // bis der Scheitel überschritten ist; danach Falling-Loop
        if (vy > 1) {
          if (this.currentName === 'jump' || this.currentName === 'running-jump') {
            return this.currentName;
          }
          if (this.currentName !== 'fall') {
            return hSpeed > RUNNING_JUMP_MIN_SPEED ? 'running-jump' : 'jump';
          }
        }
        return 'fall';
      case 'WALLRUN':
        return 'wallrun';
      case 'VAULT':
        return 'vault';
      case 'BAIL':
        return 'land';
      case 'BALANCE':
        // Catwalk-Gang beim Gehen, im Stand eingefroren wirkt Idle ruhiger
        return hSpeed > 0.5 ? 'balance' : 'idle';
      case 'HANG':
      case 'SWING':
        return 'hang';
    }
  }

  private play(name: string): void {
    if (this.currentName === name) return;
    const next = this.actions.get(name) ?? this.actions.get('idle');
    if (!next || next === this.current) return;

    next.reset();
    next.time = CLIP_START_S[name] ?? 0;
    next.setLoop(ONE_SHOT.has(name) ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = true;
    next.setEffectiveTimeScale(CLIP_TIMESCALE[name] ?? 1);
    next.play();
    if (this.current) next.crossFadeFrom(this.current, FADE_S, false);
    this.current = next;
    this.currentName = name;
  }

  /** Rolle o. Ä. einmalig abspielen; solange keine Zustandslogik. */
  private playOneShot(name: string, timeScale: number): void {
    const action = this.actions.get(name);
    if (!action) return;
    action.reset();
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
