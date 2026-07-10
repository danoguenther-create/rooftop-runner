/**
 * Abstrakte Eingabestruktur. Tastatur/Maus (Desktop) und später Touch
 * (Task 30) speisen dieselbe Struktur — Konsumenten kennen die Quelle nicht.
 */
export interface InputState {
  /** -1..1, rechts positiv */
  moveX: number;
  /** -1..1, vorwärts positiv */
  moveY: number;
  /** Maus-Delta seit letztem Frame (nur bei aktivem Pointer Lock) */
  lookDX: number;
  lookDY: number;
  /** true nur in dem Frame, in dem Sprung gedrückt wurde */
  jumpPressed: boolean;
  jumpHeld: boolean;
  sprintHeld: boolean;
  rollHeld: boolean;
  pausePressed: boolean;
  respawnPressed: boolean;
  /** Flip-Richtung, nur im Frame des Tastendrucks — zählt nur in der Luft */
  flipPressed: 'front' | 'back' | 'left' | 'right' | null;
  /** Spin-Richtung, nur im Frame des Tastendrucks — zählt nur in der Luft */
  spinPressed: -1 | 0 | 1;
}

/**
 * Tastenbelegung eines Spielers (Splitscreen-Umbau 2026-07-10). Flips
 * liegen auf den BEWEGUNGSTASTEN: erneuter Druck in der Luft löst den
 * Flip aus (Edge-Trigger; der Controller konsumiert nur im AIR-Zustand).
 */
export interface KeyMap {
  fwd: string[];
  back: string[];
  left: string[];
  right: string[];
  jump: string[];
  sprint: string[];
  roll: string[];
  respawn: string[];
  pause: string[];
  spinL: string[];
  spinR: string[];
  flipFront: string[];
  flipBack: string[];
  flipLeft: string[];
  flipRight: string[];
  /** Maus steuert die Kamera (nur Spieler 1) */
  mouse: boolean;
}

/**
 * Spieler 1: WASD + Space/Shift/C, Spins Q/E. Im Solo-Modus lösen die
 * Pfeiltasten zusätzlich Flips aus (Muskelgedächtnis + Smoke-Tests).
 */
export function keymapP1(soloAliases: boolean): KeyMap {
  return {
    fwd: ['KeyW'],
    back: ['KeyS'],
    left: ['KeyA'],
    right: ['KeyD'],
    jump: ['Space'],
    sprint: ['ShiftLeft'],
    roll: ['KeyC', 'ControlLeft'],
    respawn: ['KeyR'],
    pause: ['Escape'],
    spinL: ['KeyQ'],
    spinR: ['KeyE'],
    flipFront: soloAliases ? ['KeyW', 'ArrowUp'] : ['KeyW'],
    flipBack: soloAliases ? ['KeyS', 'ArrowDown'] : ['KeyS'],
    flipLeft: soloAliases ? ['KeyA', 'ArrowLeft'] : ['KeyA'],
    flipRight: soloAliases ? ['KeyD', 'ArrowRight'] : ['KeyD'],
    mouse: true,
  };
}

/** Spieler 2 (Splitscreen): Pfeiltasten + Enter-Block, Spins Komma/Punkt. */
export function keymapP2(): KeyMap {
  return {
    fwd: ['ArrowUp'],
    back: ['ArrowDown'],
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    jump: ['Enter', 'NumpadEnter'],
    sprint: ['ShiftRight'],
    roll: ['ControlRight'],
    respawn: ['Backspace'],
    pause: [],
    spinL: ['Comma'],
    spinR: ['Period'],
    flipFront: ['ArrowUp'],
    flipBack: ['ArrowDown'],
    flipLeft: ['ArrowLeft'],
    flipRight: ['ArrowRight'],
    mouse: false,
  };
}

/** Pfeiltasten sollen nie scrollen. */
const PREVENT_DEFAULT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class Input {
  private keys = new Set<string>();
  private jumpQueued = false;
  private pauseQueued = false;
  private respawnQueued = false;
  private flipQueued: 'front' | 'back' | 'left' | 'right' | null = null;
  private spinQueued: -1 | 0 | 1 = 0;
  private accDX = 0;
  private accDY = 0;
  private pointerLocked = false;

  readonly state: InputState = {
    moveX: 0,
    moveY: 0,
    lookDX: 0,
    lookDY: 0,
    jumpPressed: false,
    jumpHeld: false,
    sprintHeld: false,
    rollHeld: false,
    pausePressed: false,
    respawnPressed: false,
    flipPressed: null,
    spinPressed: 0,
  };

  constructor(
    private readonly map: KeyMap,
    canvas?: HTMLCanvasElement,
  ) {
    window.addEventListener('keydown', (e) => {
      if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      const m = this.map;
      if (m.jump.includes(e.code)) this.jumpQueued = true;
      if (m.pause.includes(e.code)) this.pauseQueued = true;
      if (m.respawn.includes(e.code)) this.respawnQueued = true;
      // Flips: erneuter Druck einer Bewegungstaste in der Luft (Edge hier,
      // Kontext entscheidet der Controller — am Boden verfällt das Flag)
      if (m.flipFront.includes(e.code)) this.flipQueued = 'front';
      else if (m.flipBack.includes(e.code)) this.flipQueued = 'back';
      else if (m.flipLeft.includes(e.code)) this.flipQueued = 'left';
      else if (m.flipRight.includes(e.code)) this.flipQueued = 'right';
      if (m.spinL.includes(e.code)) this.spinQueued = -1;
      if (m.spinR.includes(e.code)) this.spinQueued = 1;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    if (this.map.mouse && canvas) {
      canvas.addEventListener('click', () => {
        if (!this.pointerLocked) canvas.requestPointerLock();
      });
      document.addEventListener('pointerlockchange', () => {
        this.pointerLocked = document.pointerLockElement === canvas;
      });
      window.addEventListener('mousemove', (e) => {
        if (!this.pointerLocked) return;
        this.accDX += e.movementX;
        this.accDY += e.movementY;
      });
    }
    // Bei Fokusverlust hängende Tasten lösen
    window.addEventListener('blur', () => this.keys.clear());
  }

  get isPointerLocked(): boolean {
    return this.pointerLocked;
  }

  private held(codes: string[]): boolean {
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  /** Einmal pro Render-Frame aufrufen; setzt Frame-Flags und Deltas zurück. */
  poll(): InputState {
    const s = this.state;
    const m = this.map;
    s.moveX = (this.held(m.right) ? 1 : 0) - (this.held(m.left) ? 1 : 0);
    s.moveY = (this.held(m.fwd) ? 1 : 0) - (this.held(m.back) ? 1 : 0);
    s.lookDX = this.accDX;
    s.lookDY = this.accDY;
    this.accDX = 0;
    this.accDY = 0;
    s.jumpPressed = this.jumpQueued;
    this.jumpQueued = false;
    s.pausePressed = this.pauseQueued;
    this.pauseQueued = false;
    s.respawnPressed = this.respawnQueued;
    this.respawnQueued = false;
    s.flipPressed = this.flipQueued;
    this.flipQueued = null;
    s.spinPressed = this.spinQueued;
    this.spinQueued = 0;
    s.jumpHeld = this.held(m.jump);
    s.sprintHeld = this.held(m.sprint);
    s.rollHeld = this.held(m.roll);
    return s;
  }
}
