/**
 * Fassaden-Look der Stadt (Task 17b) — Fenster ohne Asset-Dateien.
 *
 * Die Fensterraster entstehen zur Laufzeit als CanvasTexture. Gezeichnet wird
 * auf WEISS mit dunklen Fenstern: die Wandfarbe kommt erst über die
 * Instanz-Farbe dazu (Textur multipliziert mit Farbe). Ein Material trägt so
 * beliebig viele Gebäudefarben.
 *
 * Zwei Shader-Eingriffe machen daraus einen Stadt-Batch, in dem alle Gebäude
 * — egal welcher Größe — in EINEM InstancedMesh stecken:
 *
 * 1. Kachelung aus der Instanz-Größe: die Geometrie ist ein Einheitswürfel,
 *    die Gebäudemaße stecken in der Instanz-Matrix. Ohne Eingriff würde ein
 *    Fenster über die ganze Wand gezogen. Der Vertex-Shader rechnet die UV
 *    deshalb aus `instanceSize` in Metern um — ein Fensterraster ist damit an
 *    jedem Haus gleich groß.
 * 2. Dach und Boden bleiben glatt: dort wird die Textur ausgeblendet. Ein
 *    Fensterraster auf der Lauffläche sähe falsch aus und würde die Kanten
 *    schlechter lesbar machen.
 *
 * Ohne diesen Umweg bräuchte jede Gebäudegröße ihre eigene Material-/
 * Geometrie-Gruppe — bei ~40 Häusern in ~20 Größen wären das ~20 Draw-Calls
 * allein für die Rohbauten, und jedes Stück Stadtmöblierung käme obendrauf.
 */
import * as THREE from 'three';
import { surfaceFinish } from './SurfaceFinish';
import type { BoxStyle } from './levelTypes';

/** Kantenlänge einer Textur-Kachel in Metern (Fassadenraster: 1 Geschoss). */
const TILE_W = 4;
const TILE_H = 3.2;

const CANVAS = 256;

/** Fensterfarbe (dunkel) und ein paar hellere „Jalousie"-Varianten. */
const GLASS = '#456575';
const BLINDS = ['#8d949c', '#6f757d', '#aeb4ba'];

type Ctx = CanvasRenderingContext2D;

/** Deterministischer Pseudo-Zufall — gleiche Textur bei jedem Seitenaufruf. */
const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

/** Ein Fenster mit Sturz, Sohlbank und gelegentlich heruntergelassener Jalousie. */
const window0 = (ctx: Ctx, x: number, y: number, w: number, h: number, r: () => number): void => {
  ctx.fillStyle = '#cfd3d7'; // Laibung
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = GLASS;
  ctx.fillRect(x, y, w, h);
  const reflection = ctx.createLinearGradient(x,y,x+w,y+h);
  reflection.addColorStop(0,'rgba(177,211,220,.4)');
  reflection.addColorStop(.5,'rgba(80,121,143,.12)');
  reflection.addColorStop(1,'rgba(12,26,34,.6)');
  ctx.fillStyle=reflection;ctx.fillRect(x,y,w,h);
  ctx.fillStyle='rgba(220,234,225,.35)';ctx.fillRect(x+w*.46,y,1,h);
  const blind = r();
  if (blind < 0.35) {
    ctx.fillStyle = BLINDS[Math.floor(r() * BLINDS.length)];
    ctx.fillRect(x, y, w, h * (0.25 + r() * 0.5));
  }
  ctx.fillStyle = '#b9bec4'; // Sohlbank
  ctx.fillRect(x - 3, y + h + 2, w + 6, 3);
};

const drawTile = (ctx: Ctx, style: BoxStyle, r: () => number): void => {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, CANVAS, CANVAS);

  // Geschossband unten — gibt der Fassade Maßstab, auch aus der Distanz
  ctx.fillStyle = '#dcdfe3';
  ctx.fillRect(0, CANVAS - 14, CANVAS, 14);

  if (style === 'windows-strip') {
    // Bandfassade: ein durchlaufendes Fensterband mit schmalen Pfosten
    const y = 40;
    const h = 96;
    ctx.fillStyle = '#cfd3d7';
    ctx.fillRect(6, y - 4, CANVAS - 12, h + 8);
    ctx.fillStyle = GLASS;
    ctx.fillRect(10, y, CANVAS - 20, h);
    ctx.fillStyle = '#c7ccd1';
    for (let k = 1; k < 5; k++) ctx.fillRect(10 + (k * (CANVAS - 20)) / 5 - 3, y, 6, h);
    if (r() < 0.5) {
      ctx.fillStyle = BLINDS[0];
      ctx.fillRect(10, y, CANVAS - 20, h * 0.3);
    }
    return;
  }

  if (style === 'windows-mixed') {
    // Altbau-Anmutung: zwei breite Fenster und ein schmales, plus Gesims
    window0(ctx, 26, 44, 62, 104, r);
    window0(ctx, 106, 44, 62, 104, r);
    window0(ctx, 190, 52, 34, 88, r);
    ctx.fillStyle = '#e6e9ec';
    ctx.fillRect(0, 22, CANVAS, 8);
    return;
  }

  // windows-grid: gleichmäßiges Raster aus drei Fenstern
  for (let k = 0; k < 3; k++) window0(ctx, 24 + k * 76, 48, 52, 100, r);
};

const textureCache = new Map<BoxStyle, THREE.CanvasTexture>();

const windowTexture = (style: BoxStyle): THREE.CanvasTexture => {
  let tex = textureCache.get(style);
  if (tex) return tex;

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS;
  canvas.height = CANVAS;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D-Kontext für die Fassaden-Textur nicht verfügbar');
  drawTile(ctx, style, rng(style.length * 7919));

  tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  textureCache.set(style, tex);
  return tex;
};

/**
 * Material für einen Stadt-Batch. `plain` ist ein normales Lambert-Material,
 * die Fenster-Stile bekommen die beiden oben beschriebenen Shader-Eingriffe.
 */
export const createStyleMaterial = (style: BoxStyle): THREE.MeshStandardMaterial => {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.84, metalness: 0.02 });
  if (style === 'plain') return surfaceFinish(mat, 'concrete');

  mat.map = windowTexture(style);
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'attribute vec3 instanceSize;\nvarying float vSide;\nvoid main() {')
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        vec3 an = abs(normal);
        // 1 = senkrechte Wand (Fenster), 0 = Dach/Boden (glatt)
        vSide = step(0.5, max(an.x, an.z));
        vec2 tile = an.x > 0.5
          ? vec2(instanceSize.z, instanceSize.y)
          : (an.z > 0.5 ? vec2(instanceSize.x, instanceSize.y)
                        : vec2(instanceSize.x, instanceSize.z));
        vMapUv = uv * tile / vec2(${TILE_W.toFixed(1)}, ${TILE_H.toFixed(1)});`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'varying float vSide;\nvoid main() {')
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
          diffuseColor *= mix(vec4(1.0), texture2D(map, vMapUv), vSide);
        #endif`,
      );
  };
  // Sonst teilen sich die Stile das kompilierte Programm der ersten Variante
  mat.customProgramCacheKey = () => `city-${style}`;
  return surfaceFinish(mat, 'plaster');
};

/**
 * Leichte, ortsabhängige Farbstreuung (±5 % Helligkeit, ±3° Farbton).
 * Deterministisch aus der Position — dieselbe Stadt sieht bei jedem Laden
 * gleich aus, aber keine zwei Nachbarhäuser haben exakt denselben Ton.
 */
export const jitterColor = (
  color: THREE.Color,
  pos: [number, number, number],
  out: THREE.Color,
): THREE.Color => {
  const seed = Math.abs(pos[0] * 73.1 + pos[2] * 31.7 + pos[1] * 11.3);
  const a = (seed % 1) * 2 - 1;
  const b = ((seed * 7.3) % 1) * 2 - 1;
  const hsl = { h: 0, s: 0, l: 0 };
  out.copy(color).getHSL(hsl);
  return out.setHSL(
    (hsl.h + (b * 3) / 360 + 1) % 1,
    hsl.s,
    THREE.MathUtils.clamp(hsl.l * (1 + a * 0.05), 0.05, 0.95),
  );
};
