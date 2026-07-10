import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { EventBus } from './EventBus';
import { Input, keymapP1, keymapP2 } from './Input';
import { loadCharacter } from './AssetLoader';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { LevelLoader } from '../level/LevelLoader';
import { PlayerController } from '../player/PlayerController';
import { FollowCamera } from '../camera/FollowCamera';
import { Markers } from '../gameplay/Markers';
import { Collectibles } from '../gameplay/Collectibles';
import { TimeTrial } from '../gameplay/TimeTrial';
import { Missions } from '../gameplay/Missions';
import { EdgePrecision } from '../gameplay/EdgeDetection';
import { ScoreSystem } from '../gameplay/ScoreSystem';
import { HUD } from '../ui/HUD';
import { Menus } from '../ui/Menus';
import { SaveGame } from '../save/SaveGame';

const FIXED_DT = 1 / 60;
const MAX_STEPS = 3;
/** Kräftiger Blaustich für das Charaktermodell von Spieler 2 */
const P2_TINT = new THREE.Color(0.35, 0.65, 2.2);

export class Game {
  readonly scene = new THREE.Scene();
  readonly renderer: THREE.WebGLRenderer;
  readonly bus = new EventBus();
  readonly physics = new PhysicsWorld();
  readonly level: LevelLoader;
  /** Splitscreen-Duell (Task-Erweiterung 2026-07-10): ?mode=split */
  readonly mode: 'solo' | 'split';

  // Pro Spieler (Index 0 = Spieler 1); im Solo-Modus je genau ein Eintrag
  readonly inputs: Input[] = [];
  readonly cameras: THREE.PerspectiveCamera[] = [];
  players: PlayerController[] = [];
  followCameras: FollowCamera[] = [];
  huds: HUD[] = [];
  scores: ScoreSystem[] = [];
  private buses: EventBus[] = [];
  private edges: EdgePrecision[] = [];

  // Solo-Systeme (im Splitscreen-Duell bewusst aus: fairer Trick-Vergleich)
  markers?: Markers;
  collectibles?: Collectibles;
  trial?: TimeTrial;
  missions?: Missions;
  menus!: Menus;
  save!: SaveGame;

  /** Game-Flow (Task 23): Menü offen, Spiel läuft oder pausiert */
  state: 'MENU' | 'PLAYING' | 'PAUSED' = 'MENU';
  private sun!: THREE.DirectionalLight;
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

  // Kompatibilitäts-Aliasse (Solo-Code, Menüs, Smoke-Tests)
  get player(): PlayerController {
    return this.players[0];
  }
  get followCamera(): FollowCamera {
    return this.followCameras[0];
  }
  get camera(): THREE.PerspectiveCamera {
    return this.cameras[0];
  }
  get input(): Input {
    return this.inputs[0];
  }
  get hud(): HUD {
    return this.huds[0];
  }
  get score(): ScoreSystem {
    return this.scores[0];
  }

  private get playerCount(): number {
    return this.mode === 'split' ? 2 : 1;
  }

  constructor(canvas: HTMLCanvasElement) {
    this.mode = new URLSearchParams(location.search).get('mode') === 'split' ? 'split' : 'solo';

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    for (let i = 0; i < this.playerCount; i++) {
      this.cameras.push(
        new THREE.PerspectiveCamera(60, this.viewAspect(), 0.1, 500),
      );
    }

    // Spieler 1: Maus optional; Spieler 2 (Splitscreen): reine Tastatur
    this.inputs.push(new Input(keymapP1(this.mode === 'solo'), canvas));
    if (this.mode === 'split') this.inputs.push(new Input(keymapP2()));

    this.level = new LevelLoader(this.scene, this.physics);

    window.addEventListener('resize', () => {
      for (const cam of this.cameras) {
        cam.aspect = this.viewAspect();
        cam.updateProjectionMatrix();
      }
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
      // F4: Physik-Kapsel über dem Charaktermodell einblenden (Task 21)
      if (e.code === 'F4') {
        e.preventDefault();
        for (const p of this.players) p.togglePlaceholder();
      }
    });

    // Pointer-Lock-Hinweis (nur Solo — im Splitscreen spielen beide Tastatur)
    this.hintEl = document.createElement('div');
    this.hintEl.textContent =
      'Click to play — W/S laufen · A/D drehen · Space Sprung · Shift Sprint · ' +
      'C Roll · Luft: W/A/S/D erneut = Flip, Q/E Spin · R Respawn · Maus optional';
    this.hintEl.style.cssText =
      'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);' +
      'padding:14px 22px;background:rgba(0,0,0,.65);color:#fff;font:15px system-ui;' +
      'border-radius:8px;border:1px solid #ff6a00;';
    hud.appendChild(this.hintEl);

    if (this.mode === 'split') {
      // Trennlinie zwischen den Bildhälften
      const divider = document.createElement('div');
      divider.style.cssText =
        'position:absolute;left:50%;top:0;bottom:0;width:2px;' +
        'background:rgba(0,0,0,.6);transform:translateX(-50%);';
      hud.appendChild(divider);
    }

    this.buildEnvironment();
  }

  /** Seitenverhältnis einer Bildhälfte (Splitscreen: links/rechts geteilt). */
  private viewAspect(): number {
    return window.innerWidth / (this.mode === 'split' ? 2 : 1) / window.innerHeight;
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
    this.sun = sun;
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x5a6b50, 1.2));
  }

  /** Async wegen RAPIER.init(); erst danach startet der Loop. */
  async start(): Promise<void> {
    await this.physics.init();

    const params = new URLSearchParams(location.search);
    const levelName = params.get('level') ?? 'testlevel';
    await this.level.load(levelName);

    // Spieler anlegen — jeder mit eigenem EventBus, damit Score/HUD
    // getrennt bleiben; Bus von Spieler 1 ist zugleich this.bus
    this.buses = [this.bus];
    if (this.mode === 'split') this.buses.push(new EventBus());
    for (let i = 0; i < this.playerCount; i++) {
      const p = new PlayerController(this.physics, this.buses[i], this.scene, this.level);
      // Spieler 2 versetzt starten, sonst stecken beide ineinander
      if (i > 0) {
        const t = p.body.translation();
        p.body.setTranslation({ x: t.x + 1.5, y: t.y, z: t.z }, true);
        p.body.setNextKinematicTranslation({ x: t.x + 1.5, y: t.y, z: t.z });
      }
      this.players.push(p);
      this.followCameras.push(new FollowCamera(this.cameras[i], p));
      this.edges.push(new EdgePrecision(this.level.topFaces, p, this.buses[i]));
      this.scores.push(new ScoreSystem(this.buses[i]));
    }

    // Charaktermodell (Task 21). ?nochar=1 überspringt den Download —
    // für die Headless-Smoke-Tests, die nur Physik prüfen. Schlägt das Laden
    // fehl, bleibt die Platzhalter-Kapsel sichtbar und das Spiel läuft weiter.
    if (params.get('nochar') !== '1') {
      try {
        const assets = await loadCharacter();
        this.players[0].attachCharacter(assets);
        if (this.players[1]) {
          const model = cloneSkeleton(assets.model) as THREE.Group;
          // Spieler 2 einfärben (geklonte Materialien, Original bleibt)
          model.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            if (mesh.isMesh && mesh.material) {
              const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
              mat.color.multiply(P2_TINT);
              mesh.material = mat;
            }
          });
          this.players[1].attachCharacter({ model, clips: assets.clips });
        }
      } catch (err) {
        console.warn('Charaktermodell konnte nicht geladen werden:', err);
      }
    }

    // HUDs: Solo direkt in #hud, Splitscreen je Bildhälfte ein Container
    const hudRoot = document.getElementById('hud')!;
    for (let i = 0; i < this.playerCount; i++) {
      let root: HTMLElement = hudRoot;
      if (this.mode === 'split') {
        root = document.createElement('div');
        root.style.cssText = `position:absolute;top:0;bottom:0;width:50%;left:${i * 50}%;`;
        hudRoot.appendChild(root);
      }
      this.huds.push(new HUD(this.buses[i], root));
    }

    // Solo-Systeme: Sammelobjekte, Zeitrennen, Missionen, Marker-Zonen.
    // Im Splitscreen-Duell bewusst deaktiviert (V1): reiner Trick-Vergleich.
    this.save = new SaveGame(this.bus, levelName);
    if (this.mode === 'solo') {
      this.markers = new Markers(this.scene, this.level, this.bus, this.player);
      this.collectibles = new Collectibles(this.scene, this.level, this.bus, this.player);
      this.collectibles.setCollected(this.save.getCollectibles(levelName));
      this.trial = new TimeTrial(this.scene, this.level, this.bus, this.player);
      this.missions = new Missions(this.bus, this.trial);
      await this.missions.load(levelName);
      this.missions.setCompleted(this.save.getMissions());
      this.hud.setCollectibleTotal(this.collectibles.total);
      // setCollectibleTotal zeigt immer "0/total"; den geladenen Stand
      // nachträglich anzeigen, ohne 'collect:pickup' zu emittieren (würde
      // ScoreSystem/Missions fälschlich erneut Punkte gutschreiben).
      const alreadyCollected = this.collectibles.getCollected().size;
      if (alreadyCollected > 0) {
        const collectEl = document.querySelector<HTMLElement>('.hud-collect');
        if (collectEl)
          collectEl.innerHTML = `<b>${alreadyCollected}</b>/${this.collectibles.total}`;
      }
    }

    // Debug: zuletzt ausgelöstes Trick-Event anzeigen (Spieler 1)
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

    // Menü/Direkteinstieg (Task 23): ?play=1 und ?trial=1 überspringen das Menü
    this.menus = new Menus(this);
    // Gespeicherte Einstellungen (Task 24) auf die frisch gebaute Menus-Instanz
    // anwenden, bevor das Menü ggf. angezeigt wird.
    const s = this.save.getSettings();
    this.menus.musicVol = s.musicVol;
    this.menus.sfxVol = s.sfxVol;
    this.menus.quality = s.quality;
    this.setQuality(s.quality === 'hoch');

    if (params.get('trial') === '1' && this.trial) {
      this.trial.teleportToStart();
      this.state = 'PLAYING';
    } else if (params.get('play') === '1') {
      this.state = 'PLAYING';
    } else {
      this.menus.showStart();
    }

    this.clock.start();
    requestAnimationFrame(this.loop);
  }

  resume(): void {
    this.state = 'PLAYING';
    this.menus.hide();
  }

  pause(): void {
    if (this.state !== 'PLAYING') return;
    this.state = 'PAUSED';
    this.menus.showPause();
    document.exitPointerLock();
  }

  /** Qualität hoch/niedrig: Schatten + Renderauflösung (Task 23). */
  setQuality(high: boolean): void {
    this.sun.castShadow = high;
    this.renderer.setPixelRatio(high ? Math.min(window.devicePixelRatio, 2) : 1);
  }

  private loop = (): void => {
    const dt = Math.min(this.clock.getDelta(), 0.25);
    const frameInputs = this.inputs.map((i) => i.poll());

    // Esc: Pause an/aus (Task 23) — liegt nur auf Spieler 1
    if (frameInputs[0].pausePressed) {
      if (this.state === 'PLAYING') this.pause();
      else if (this.state === 'PAUSED') this.resume();
    }

    this.hintEl.style.display =
      this.mode === 'solo' && this.state === 'PLAYING' && !this.input.isPointerLocked
        ? 'block'
        : 'none';

    if (this.state === 'PLAYING') {
      this.players.forEach((p, i) => {
        p.handleFrameInput(frameInputs[i]);
        p.cameraYaw = this.followCameras[i].getYaw();
      });
      // R während des Rennens: Neustart am trialStart (überschreibt den Respawn)
      if (frameInputs[0].respawnPressed) this.trial?.onRespawn();

      // Fester Physik-Takt über Akkumulator (framerate-unabhängige Physik)
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= FIXED_DT && steps < MAX_STEPS) {
        for (const p of this.players) p.fixedUpdate(FIXED_DT);
        this.physics.step();
        this.markers?.fixedUpdate();
        this.collectibles?.fixedUpdate();
        this.trial?.fixedUpdate();
        for (const e of this.edges) e.fixedUpdate(FIXED_DT);
        this.accumulator -= FIXED_DT;
        steps++;
      }
      if (steps === MAX_STEPS) this.accumulator = 0; // Spiral of death vermeiden

      // Render-Takt
      this.players.forEach((p, i) => {
        p.update(dt);
        this.followCameras[i].update(dt, frameInputs[i]);
      });
      this.markers?.update(dt);
      this.collectibles?.update(dt);
      this.trial?.update(dt);
      this.missions?.update(dt);
      this.scores.forEach((s) => s.update(dt));
      this.huds.forEach((h, i) =>
        h.update(dt, this.players[i].horizontalSpeed, this.players[i].balancer.sway),
      );
    }

    if (this.mode === 'split') {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.renderer.setScissorTest(true);
      for (let i = 0; i < 2; i++) {
        this.renderer.setViewport((i * w) / 2, 0, w / 2, h);
        this.renderer.setScissor((i * w) / 2, 0, w / 2, h);
        this.renderer.render(this.scene, this.cameras[i]);
      }
      this.renderer.setScissorTest(false);
    } else {
      this.renderer.render(this.scene, this.cameras[0]);
    }

    // Overlays
    this.frameCount++;
    this.statsTimer += dt;
    if (this.statsTimer >= 1) {
      const fps = Math.round(this.frameCount / this.statsTimer);
      this.statsEl.textContent = `${fps} fps · ${this.renderer.info.render.calls} calls`;
      this.frameCount = 0;
      this.statsTimer = 0;
    }
    if (this.debugVisible && this.players.length) {
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
