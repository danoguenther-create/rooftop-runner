import * as THREE from 'three';
import { EventBus } from './EventBus';
import { Input } from './Input';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { LevelLoader } from '../level/LevelLoader';

/** Systeme mit Physik-Takt (1/60 s, deterministisch). */
export interface FixedUpdatable {
  fixedUpdate(dt: number): void;
}

/** Systeme mit Render-Takt (variabel: Kamera, Animation, UI). */
export interface Updatable {
  update(dt: number): void;
}

const FIXED_DT = 1 / 60;
const MAX_STEPS = 3;

export class Game {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly bus = new EventBus();
  readonly input: Input;
  readonly physics = new PhysicsWorld();
  readonly level: LevelLoader;

  private fixedSystems: FixedUpdatable[] = [];
  private frameSystems: Updatable[] = [];
  private clock = new THREE.Clock();
  private accumulator = 0;

  // Stats-Overlay
  private statsEl: HTMLDivElement;
  private frameCount = 0;
  private statsTimer = 0;

  // Temporär (Task 4/5): Physik-Demo-Box, fliegt mit dem Player-Task raus
  private debugBoxMesh!: THREE.Mesh;
  private debugBoxBody!: import('@dimforge/rapier3d-compat').RigidBody;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      500,
    );
    this.camera.position.set(6, 5, 9);
    this.camera.lookAt(0, 1.5, 0);

    this.input = new Input(canvas);
    this.level = new LevelLoader(this.scene, this.physics);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    this.statsEl = document.createElement('div');
    this.statsEl.style.cssText =
      'position:absolute;top:8px;left:8px;padding:4px 8px;background:rgba(0,0,0,.55);' +
      'color:#9f9;font:12px monospace;border-radius:4px;pointer-events:none;';
    document.getElementById('hud')!.appendChild(this.statsEl);

    this.buildEnvironment();
  }

  /** Licht + Himmel (levelunabhängig). */
  private buildEnvironment(): void {
    this.scene.background = new THREE.Color(0x87b7dc);

    const sun = new THREE.DirectionalLight(0xffffff, 2.5);
    sun.position.set(15, 30, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -40;
    sun.shadow.camera.right = 40;
    sun.shadow.camera.top = 40;
    sun.shadow.camera.bottom = -40;
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x5a6b50, 1.2));
  }

  addFixedSystem(system: FixedUpdatable): void {
    this.fixedSystems.push(system);
  }

  addFrameSystem(system: Updatable): void {
    this.frameSystems.push(system);
  }

  /** Async wegen RAPIER.init(); erst danach startet der Loop. */
  async start(): Promise<void> {
    await this.physics.init();

    // Level aus URL-Parameter (?level=...) oder Default laden
    const levelName = new URLSearchParams(location.search).get('level') ?? 'testlevel';
    await this.level.load(levelName);

    // Kamera vorerst statisch schräg über dem Level (FollowCamera: Task 7)
    this.camera.position.set(-18, 22, 32);
    this.camera.lookAt(8, 2, 4);

    // Physik-Demo: dynamische Box fällt über dem Spawn ins Level
    const dyn = this.physics.addDynamicBox(
      this.level.spawn.clone().add(new THREE.Vector3(0.5, 6, 0.5)),
      new THREE.Vector3(1, 1, 1),
    );
    this.debugBoxBody = dyn.rigidBody;
    this.debugBoxMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x3aa0ff }),
    );
    this.debugBoxMesh.castShadow = true;
    this.scene.add(this.debugBoxMesh);

    this.clock.start();
    requestAnimationFrame(this.loop);
  }

  private loop = (): void => {
    const dt = Math.min(this.clock.getDelta(), 0.25);
    const input = this.input.poll();

    if (input.jumpPressed) this.bus.emit('debug:jumpPressed', undefined);

    // Fester Physik-Takt über Akkumulator (framerate-unabhängige Physik)
    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_STEPS) {
      for (const s of this.fixedSystems) s.fixedUpdate(FIXED_DT);
      this.physics.step();
      this.accumulator -= FIXED_DT;
      steps++;
    }
    if (steps === MAX_STEPS) this.accumulator = 0; // Spiral of death vermeiden

    // Render-Takt
    for (const s of this.frameSystems) s.update(dt);

    // Temporäre Physik-Demo-Box animieren
    const t = this.debugBoxBody.translation();
    const r = this.debugBoxBody.rotation();
    this.debugBoxMesh.position.set(t.x, t.y, t.z);
    this.debugBoxMesh.quaternion.set(r.x, r.y, r.z, r.w);

    this.renderer.render(this.scene, this.camera);

    // Stats jede Sekunde
    this.frameCount++;
    this.statsTimer += dt;
    if (this.statsTimer >= 1) {
      const fps = Math.round(this.frameCount / this.statsTimer);
      this.statsEl.textContent = `${fps} fps · ${this.renderer.info.render.calls} calls`;
      this.frameCount = 0;
      this.statsTimer = 0;
    }

    requestAnimationFrame(this.loop);
  };
}
