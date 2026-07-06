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
}

export class Input {
  private keys = new Set<string>();
  private jumpQueued = false;
  private pauseQueued = false;
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
  };

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space') this.jumpQueued = true;
      if (e.code === 'Escape') this.pauseQueued = true;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    canvas.addEventListener('click', () => {
      if (!this.pointerLocked) canvas.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      this.accDX += e.movementX;
      this.accDY += e.movementY;
    });
    // Bei Fokusverlust hängende Tasten lösen
    window.addEventListener('blur', () => this.keys.clear());
  }

  get isPointerLocked(): boolean {
    return this.pointerLocked;
  }

  /** Einmal pro Render-Frame aufrufen; setzt Frame-Flags und Deltas zurück. */
  poll(): InputState {
    const s = this.state;
    s.moveX = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    s.moveY = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    s.lookDX = this.accDX;
    s.lookDY = this.accDY;
    this.accDX = 0;
    this.accDY = 0;
    s.jumpPressed = this.jumpQueued;
    this.jumpQueued = false;
    s.pausePressed = this.pauseQueued;
    this.pauseQueued = false;
    s.jumpHeld = this.keys.has('Space');
    s.sprintHeld = this.keys.has('ShiftLeft');
    s.rollHeld = this.keys.has('KeyC') || this.keys.has('ControlLeft');
    return s;
  }
}
