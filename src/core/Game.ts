import * as THREE from 'three';
import { EventBus } from './EventBus';
import { Input } from './Input';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { LevelLoader } from '../level/LevelLoader';
import { PlayerController } from '../player/PlayerController';
import { FollowCamera } from '../camera/FollowCamera';
import { Markers } from '../gameplay/Markers';
import { EdgePrecision } from '../gameplay/EdgeDetection';
import { ScoreSystem } from '../gameplay/ScoreSystem';
import { HUD } from '../ui/HUD';

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
  player!: PlayerController;
  followCamera!: FollowCamera;
  markers!: Markers;
  edges!: EdgePrecision;
  score!: ScoreSystem;
  hud!: HUD;
  private lastTrick = '–';

  private clock = new THREE.Clock();
  private accumulator = 0;

  // Overlays
  private statsEl: HTMLDivElement;
  private debugEl: HTMLDivElement;
  private hintEl: HTMLDivElement;
  private debugVisible = true;
  private frameCount = 0;
  private statsTimer = 0;

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

    this.input = new Input(canvas);
    this.level = new LevelLoader(this.scene, this.physics);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    const hud = document.getElementById('hud')!;

    this.statsEl = document.createElement('div');
    this.statsEl.style.cssText =
      'position:absolute;top:8px;left:8px;padding:4px 8px;background:rgba(0,0,0,.55);' +
      'color:#9f9;font:12px monospace;border-radius:4px;';
    hud.appendChild(this.statsEl);

    // Debug-Panel (Task 9), F3 blendet um
    this.debugEl = document.createElement('div');
    this.debugEl.style.cssText =
      'position:absolute;bottom:8px;left:8px;padding:4px 8px;background:rgba(0,0,0,.55);' +
      'color:#fc6;font:12px monospace;border-radius:4px;white-space:pre;';
    hud.appendChild(this.debugEl);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F3') {
        e.preventDefault();
        this.debugVisible = !this.debugVisible;
        this.debugEl.style.display = this.debugVisible ? 'block' : 'none';
      }
    });

    // Pointer-Lock-Hinweis
    this.hintEl = document.createElement('div');
    this.hintEl.textContent =
      'Click to play — WASD laufen · Maus Kamera · Space Sprung · Shift Sprint · ' +
      'C Roll · Pfeile Flips · Q/E Spin · R Respawn';
    this.hintEl.style.cssText =
      'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);' +
      'padding:14px 22px;background:rgba(0,0,0,.65);color:#fff;font:15px system-ui;' +
      'border-radius:8px;border:1px solid #ff6a00;';
    hud.appendChild(this.hintEl);

    this.buildEnvironment();
  }

  /** Licht + Himmel (levelunabhängig). */
  private buildEnvironment(): void {
    this.scene.background = new THREE.Color(0x87b7dc);
    // Distanznebel in Himmelfarbe: kaschiert das Levelende (Task 17)
    this.scene.fog = new THREE.Fog(0x87b7dc, 40, 180);

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

  /** Async wegen RAPIER.init(); erst danach startet der Loop. */
  async start(): Promise<void> {
    await this.physics.init();

    const levelName = new URLSearchParams(location.search).get('level') ?? 'testlevel';
    await this.level.load(levelName);

    this.player = new PlayerController(this.physics, this.bus, this.scene, this.level);
    this.followCamera = new FollowCamera(this.camera, this.player);
    this.markers = new Markers(this.scene, this.level, this.bus, this.player);
    this.edges = new EdgePrecision(this.level.topFaces, this.player, this.bus);
    this.score = new ScoreSystem(this.bus);
    this.hud = new HUD(this.bus);

    // Debug: zuletzt ausgelöstes Trick-Event anzeigen
    const trackTrick = (name: string) => {
      this.lastTrick = name;
    };
    this.bus.on('trick:wallrun', (e) => trackTrick(`wallrun (${e.side})`));
    this.bus.on('trick:walljump', (e) => trackTrick(`walljump (${e.side})`));
    this.bus.on('trick:vault', (e) => trackTrick(`vault (${e.obstacleHeight.toFixed(2)}m)`));
    this.bus.on('trick:balanceStart', (e) => trackTrick(`balanceStart (rail ${e.rail})`));
    this.bus.on('trick:balanceTick', (e) => trackTrick(`balanceTick (${e.seconds}s)`));
    this.bus.on('trick:balanceEnd', (e) =>
      trackTrick(`balanceEnd (${e.durationMs}ms${e.full ? ', full' : ''})`),
    );
    this.bus.on('trick:gap', (e) => trackTrick(`gap (${e.id})`));
    this.bus.on('trick:precision', (e) => trackTrick(`precision (${e.id})`));
    this.bus.on('trick:flip', (e) =>
      trackTrick(`flip (${e.kind} x${e.count}${e.gainer ? ', gainer' : ''})`),
    );
    this.bus.on('trick:spin', (e) => trackTrick(`spin (${e.halfTurns * 180}°)`));
    this.bus.on('trick:diveroll', (e) => trackTrick(`diveroll (${e.fallHeight.toFixed(1)}m)`));
    this.bus.on('trick:swing', (e) => trackTrick(`swing (x${e.chain})`));

    this.clock.start();
    requestAnimationFrame(this.loop);
  }

  private loop = (): void => {
    const dt = Math.min(this.clock.getDelta(), 0.25);
    const input = this.input.poll();

    this.hintEl.style.display = this.input.isPointerLocked ? 'none' : 'block';

    this.player.handleFrameInput(input);
    this.player.cameraYaw = this.followCamera.getYaw();

    // Fester Physik-Takt über Akkumulator (framerate-unabhängige Physik)
    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_STEPS) {
      this.player.fixedUpdate(FIXED_DT);
      this.physics.step();
      this.markers.fixedUpdate();
      this.edges.fixedUpdate(FIXED_DT);
      this.accumulator -= FIXED_DT;
      steps++;
    }
    if (steps === MAX_STEPS) this.accumulator = 0; // Spiral of death vermeiden

    // Render-Takt
    this.player.update(dt);
    this.followCamera.update(dt, input);
    this.markers.update(dt);
    this.score.update(dt);
    this.hud.update(dt, this.player.horizontalSpeed, this.player.balancer.sway);

    this.renderer.render(this.scene, this.camera);

    // Overlays
    this.frameCount++;
    this.statsTimer += dt;
    if (this.statsTimer >= 1) {
      const fps = Math.round(this.frameCount / this.statsTimer);
      this.statsEl.textContent = `${fps} fps · ${this.renderer.info.render.calls} calls`;
      this.frameCount = 0;
      this.statsTimer = 0;
    }
    if (this.debugVisible) {
      const wall =
        this.player.currentWallSide ??
        (this.player.fsm.current === 'AIR' ? (this.player.wallHit?.side ?? 'none') : 'none');
      this.debugEl.textContent =
        `state: ${this.player.fsm.current}\n` +
        `speed: ${this.player.horizontalSpeed.toFixed(1)} m/s\n` +
        `grounded: ${this.player.grounded}\n` +
        `wall: ${wall}\n` +
        `trick: ${this.lastTrick}`;
    }

    requestAnimationFrame(this.loop);
  };
}
