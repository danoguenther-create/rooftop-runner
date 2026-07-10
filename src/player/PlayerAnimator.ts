import * as THREE from 'three';
import type { EventBus } from '../core/EventBus';
import type { StateName } from './PlayerStates';

const FADE_S = 0.15;
/** Bodenrolle knackiger abspielen als der gemächliche Mixamo-Clip. */
const ROLL_TIMESCALE = 1.5;
/**
 * Einstiegszeitpunkt je Clip. Der Mixamo-Jump enthält vorn ~0,55 s
 * Aushol-Hocke plus ~0,25 s Beinstreckung (Abdruck) — die Beine ziehen
 * erst kurz vor dem Scheitel (~0,9 s) an. Unser Sprung dauert nur ~0,8 s,
 * also direkt in der Anzieh-Phase einsteigen.
 */
const CLIP_START_S: Record<string, number> = { jump: 0.8 };

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
    bus.on('player:roll', () => this.playOneShot('roll', ROLL_TIMESCALE));
    bus.on('trick:diveroll', () => this.playOneShot('roll', ROLL_TIMESCALE));
  }

  /** Render-Takt: Ziel-Clip aus FSM-Zustand + Bewegung ableiten. */
  update(dt: number, state: StateName, hSpeed: number, vy: number): void {
    this.time += dt;
    if (this.time >= this.lockUntil) {
      this.play(this.pickClip(state, hSpeed, vy));
    }
    this.mixer.update(dt);
  }

  private pickClip(state: StateName, hSpeed: number, vy: number): string {
    switch (state) {
      case 'RUN':
        if (hSpeed > 7) return 'sprint';
        if (hSpeed > 0.5) return 'run';
        return 'idle';
      case 'AIR':
        // Aufwärtsphase nach Absprung: Jump-Clip; sonst Falling-Loop
        if (vy > 1 && this.currentName !== 'fall') return 'jump';
        return 'fall';
      case 'WALLRUN':
        return 'run';
      case 'VAULT':
        return 'jump';
      case 'BAIL':
        return 'land';
      case 'BALANCE':
      case 'HANG':
        return 'idle'; // Platzhalter, bis eigene Clips hochgeladen sind
      case 'SWING':
        return 'fall';
    }
  }

  private play(name: string): void {
    if (this.currentName === name) return;
    const next = this.actions.get(name) ?? this.actions.get('idle');
    if (!next || next === this.current) return;

    next.reset();
    next.time = CLIP_START_S[name] ?? 0;
    next.setLoop(
      name === 'jump' || name === 'land' ? THREE.LoopOnce : THREE.LoopRepeat,
      Infinity,
    );
    next.clampWhenFinished = true;
    next.setEffectiveTimeScale(1);
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
