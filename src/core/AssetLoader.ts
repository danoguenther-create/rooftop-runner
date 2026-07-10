import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

/** Ergebnis von loadCharacter(): fertig skaliertes Modell + benannte Clips. */
export interface CharacterAssets {
  model: THREE.Group;
  clips: Map<string, THREE.AnimationClip>;
}

/**
 * Welche Animations-FBX geladen werden (Task 21). Schlüssel = interner
 * Clip-Name, Wert = Dateiname unter public/models/mixamo/. Weitere Clips
 * liegen ungenutzt im Ordner (Flips, big-jump, sprint-alt …) — Flips
 * rotieren prozedural und die Mixamo-Flip-Clips enthalten Anlaufschritte,
 * die sich nicht mit Double/Triple kombinieren lassen.
 */
const ANIMATION_FILES: Record<string, string> = {
  idle: 'idle.fbx',
  run: 'run.fbx',
  sprint: 'sprint.fbx',
  fall: 'fall.fbx',
  land: 'land.fbx',
  roll: 'roll.fbx',
  jump: 'jump.fbx',
  'running-jump': 'running-jump.fbx',
  'landing-roll': 'landing-roll.fbx',
  'sprint-roll': 'sprint-roll.fbx',
  hang: 'hang.fbx',
  wallrun: 'wallrun.fbx',
  wallclimb: 'wallclimb.fbx',
  balance: 'balance.fbx',
  vault: 'vault.fbx',
};

/** Mixamo exportiert in cm; unsere Welt rechnet in Metern. */
const MIXAMO_SCALE = 0.01;

/**
 * Clips, bei denen auch die VERTIKALE Hips-Bewegung fixiert wird: der
 * Wall-Run-Clip ist ein kompletter Bogen (hoch + runter, ~0,9 m Hub) —
 * als Loop würde der Charakter pulsieren; die echte Höhe macht die Kapsel.
 */
const STRIP_Y = new Set(['wallrun', 'wallclimb']);

/**
 * Entfernt die horizontale Root-Bewegung (X/Z der Hips) aus einem Clip.
 * Nötig, weil nicht alle Mixamo-Animationen als "In Place" verfügbar sind —
 * die Fortbewegung übernimmt bei uns ausschließlich die Physik-Kapsel.
 * Die Y-Spur bleibt normalerweise erhalten (Hocke bei Landung/Rolle).
 */
function stripRootMotion(clip: THREE.AnimationClip, stripY: boolean): void {
  for (const track of clip.tracks) {
    if (!track.name.endsWith('Hips.position')) continue;
    const values = track.values;
    const x0 = values[0];
    const y0 = values[1];
    const z0 = values[2];
    for (let i = 0; i < values.length; i += 3) {
      values[i] = x0;
      if (stripY) values[i + 1] = y0;
      values[i + 2] = z0;
    }
  }
}

/**
 * Lädt Charakter + Animationen (Task 21) mit einem simplen DOM-Lade-Overlay.
 * Wirft bei Fehlern — der Aufrufer entscheidet, ob die Platzhalter-Kapsel
 * sichtbar bleibt.
 */
export async function loadCharacter(basePath = 'models/mixamo/'): Promise<CharacterAssets> {
  const overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
    'background:rgba(10,14,20,.85);color:#fff;font:16px system-ui;z-index:50;';
  overlay.textContent = 'Lade Charakter … 0 %';
  document.body.appendChild(overlay);

  const loader = new FBXLoader();
  const base = `${import.meta.env.BASE_URL}${basePath}`;
  const total = 1 + Object.keys(ANIMATION_FILES).length;
  let done = 0;
  const tick = () => {
    done++;
    overlay.textContent = `Lade Charakter … ${Math.round((done / total) * 100)} %`;
  };

  try {
    const [model, ...animGroups] = await Promise.all([
      loader.loadAsync(`${base}character.fbx`).then((g) => (tick(), g)),
      ...Object.values(ANIMATION_FILES).map((file) =>
        loader.loadAsync(`${base}${file}`).then((g) => (tick(), g)),
      ),
    ]);

    model.scale.setScalar(MIXAMO_SCALE);
    let bonePrefix = 'mixamorig';
    model.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = true;
        obj.frustumCulled = false; // SkinnedMesh-Bounds stimmen sonst nicht
      }
      // Skelett-Prefix des Modells ermitteln (z. B. "mixamorig" oder "mixamorig2")
      if ((obj as THREE.Bone).isBone && obj.name.endsWith('Hips')) {
        bonePrefix = obj.name.slice(0, -'Hips'.length);
      }
    });

    const clips = new Map<string, THREE.AnimationClip>();
    Object.keys(ANIMATION_FILES).forEach((name, i) => {
      const clip = animGroups[i].animations[0];
      if (!clip) return;
      clip.name = name;
      // Mixamo nummeriert das Rig je Export zufällig um (mixamorig9Hips …) —
      // ohne Angleich an das Modell-Skelett bindet der Mixer nichts (T-Pose)
      for (const track of clip.tracks) {
        track.name = track.name.replace(/^mixamorig\d*/, bonePrefix);
      }
      stripRootMotion(clip, STRIP_Y.has(name));
      clips.set(name, clip);
    });

    return { model, clips };
  } finally {
    overlay.remove();
  }
}
