import { chromium } from 'playwright-core';
import { stepMs, stepUntil, waitForPlaying } from './harness.mjs';

const base = process.argv[2] ?? 'http://localhost:4173/rooftop-runner/';
const url = `${base}?level=city01&play=1&nochar=1`;
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium-browser',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: 'load' });
await waitForPlaying(page);

const state = () =>
  page.evaluate(() => ({
    st: window.game.player.fsm.current,
    pos: window.game.player.body.translation(),
    level: window.game.level.name,
  }));
const stats = () =>
  page.evaluate(() => {
    for (const el of document.querySelectorAll('#hud div'))
      if (el.textContent?.includes('calls')) return el.textContent;
    return null;
  });
const teleport = (x, y, z, vx, vy, vz) =>
  page.evaluate(
    ([x, y, z, vx, vy, vz]) => {
      const g = window.game;
      g.player.body.setTranslation({ x, y, z }, true);
      g.player.body.setNextKinematicTranslation({ x, y, z });
      g.player.velocity.set(vx, vy, vz);
    },
    [x, y, z, vx, vy, vz],
  );
const lookAt = (yaw) =>
  page.evaluate((y) => {
    window.game.followCamera.yaw = y;
  }, yaw);
const reset = async () => {
  await page.keyboard.press('r');
  await stepMs(page, 700);
};

/**
 * Die Ankerpunkte werden aus dem geladenen Level gelesen, nicht abgeschrieben.
 * Der Stadt-Generator variiert Grundflächen und damit Gebäude- und
 * Treppenkanten; ein Test mit festen Koordinaten wäre nach jeder Änderung am
 * Stadtplan rot, ohne dass an der Physik etwas kaputt wäre.
 */
const anchors = await page.evaluate(() => {
  const level = window.game.level;
  const faces = level.topFaces;
  const roof = (cx, cz, y) =>
    faces.find(
      (f) => Math.abs(f.cx - cx) < 0.5 && Math.abs(f.cz - cz) < 0.5 && Math.abs(f.y - y) < 0.3,
    );
  const flat = (f) => (f ? { x: f.cx, z: f.cz, y: f.y, halfX: f.halfX, halfZ: f.halfZ } : null);

  // Unterste Stufe der Treppe C6 (Stufen sind 3 x 0.4 x 0.9)
  const step = faces
    .filter((f) => Math.abs(f.halfX - 1.5) < 0.01 && Math.abs(f.halfZ - 0.45) < 0.01)
    .filter((f) => f.cx > 25 && f.cx < 42)
    .sort((a, b) => a.y - b.y)[0];

  // Geneigte Balance-Rail B1 -> A1: fällt von Zeile B nach Zeile A ab
  const sloped = level.rails
    .map((r) => r.curve.points)
    .find((p) => Math.abs(p[0].x + 52.5) < 0.5 && p[0].y > p[1].y + 1);

  // Erstes Feuerleiter-Podest in der Gasse zwischen B2 und B3 (1.4 x 3.2)
  const escape = faces
    .filter((f) => Math.abs(f.halfX - 0.7) < 0.01 && Math.abs(f.halfZ - 1.6) < 0.01)
    .filter((f) => Math.abs(f.cz + 20) < 0.5)
    .sort((a, b) => a.y - b.y)[0];

  // Karosserie eines parkenden Autos (4.4 x 1.9) an der A–B-Straße
  const car = faces
    .filter((f) => Math.abs(f.halfX - 2.2) < 0.01 && Math.abs(f.halfZ - 0.95) < 0.01)
    .sort((a, b) => a.cx - b.cx)[0];

  // Deck der Fußgängerbrücke (2.6 x 13)
  const bridge = faces.find((f) => Math.abs(f.halfX - 1.3) < 0.01 && Math.abs(f.halfZ - 6.5) < 0.01);

  return {
    b0: flat(roof(-70, -20, 14)),
    b1: flat(roof(-52.5, -20, 13)),
    step: flat(step),
    sloped: sloped ? { x: sloped[0].x, y: sloped[0].y, z: sloped[0].z } : null,
    escape: flat(escape),
    car: flat(car),
    bridge: flat(bridge),
  };
});
const missing = Object.entries(anchors)
  .filter(([, v]) => !v)
  .map(([k]) => k);
if (missing.length) {
  console.log(`FAILS: Ankerpunkte nicht gefunden — ${missing.join(', ')}`);
  await browser.close();
  process.exit(1);
}

const results = {};
// Der Spieler fällt beim Spawn kurz auf das Dach — erst landen lassen
await stepUntil(page, () => window.game.player.fsm.current === 'RUN', 300);
results.spawn = await state();
// Das Stats-Overlay (fps + draw calls) schreibt sich einmal pro echter Sekunde
// im Bildtakt — kurz darauf warten, statt eine Sekunde zu raten.
await page.waitForFunction(
  () =>
    [...document.querySelectorAll('#hud div')].some((el) => el.textContent?.includes('calls')),
  null,
  { timeout: 15_000 },
);
results.stats = await stats();

// --- Dachlücken-Sprung: B0 -> B1 über die Fuge (W hält den +x-Speed)
await lookAt(-Math.PI / 2);
await page.keyboard.down('w');
await teleport(anchors.b0.x + anchors.b0.halfX - 0.5, anchors.b0.y + 1, -20, 8, 8, 0);
// Auf die Landung DRÜBEN warten: nur „RUN und y > 13" wäre schon im Moment
// des Absprungs erfüllt und würde einen misslungenen Sprung durchwinken.
const b1West = anchors.b1.x - anchors.b1.halfX;
await stepUntil(
  page,
  (west) =>
    window.game.player.fsm.current === 'RUN' && window.game.player.body.translation().x > west,
  240,
  b1West,
);
await page.keyboard.up('w');
results.gapJump = await state();
await reset();

// --- Geneigte Balance-Rail über die Straße: B1 -> A1
await teleport(anchors.sloped.x, anchors.sloped.y + 0.9, anchors.sloped.z - 0.6, 0, 0, -3);
await stepMs(page, 400);
results.rail = await state();
await reset();

// --- Schwungstange: von B3-Dach fallend an die Stangenreihe (y=13, z=-28.5)
await teleport(-17.5, 12.1, -28.2, 0, 0, -3);
await stepMs(page, 400);
results.bar = await state();
await reset();

// --- Kletterhäuschen auf A2: Anlauf -> Wandlauf -> HANG
// W nur bis zum Grab halten — gehaltenes W würde nach der
// 250-ms-Schonfrist sofort das Mantle auslösen
await page.keyboard.down('w');
await teleport(-43, 9.95, -48, 6, 0, 0);
await stepUntil(page, () => window.game.player.fsm.current === 'HANG', 480);
await page.keyboard.up('w');
await stepMs(page, 300);
results.shed = await state();
await reset();

// --- Feuerleiter in der Gasse: unterstes Podest trägt (Stadtbild-Pass 17b)
await teleport(anchors.escape.x, anchors.escape.y + 1.4, anchors.escape.z, 0, 0, 0);
await stepUntil(page, () => window.game.player.fsm.current === 'RUN', 240);
results.fireEscape = await state();
await reset();

// --- Fußgängerbrücke über die C–D-Straße trägt
await teleport(anchors.bridge.x, anchors.bridge.y + 1.4, anchors.bridge.z, 0, 0, 0);
await stepUntil(page, () => window.game.player.fsm.current === 'RUN', 240);
results.bridge = await state();
await reset();

// --- Parkendes Auto ist ein Vault-Hindernis (Anlauf quer zur Straße; W läuft
// bei yaw 0 Richtung -z). Auf Höhe des Hecks: über dem Dach wäre das
// Hindernis 1.6 m hoch und damit außerhalb des Vault-Fensters (0.5–1.2 m).
await lookAt(0);
await teleport(anchors.car.x + 1.7, 1.0, anchors.car.z + 3.0, 0, 0, 0);
await page.keyboard.down('w');
results.carVault = await stepUntil(
  page,
  () => window.game.player.fsm.current === 'VAULT',
  240,
);
await page.keyboard.up('w');
await reset();

// --- Treppe C6 von der Straße hoch (W = +x, Kamera gedreht)
await lookAt(-Math.PI / 2);
await teleport(anchors.step.x - 2, 1.0, anchors.step.z, 0, 0, 0);
await stepMs(page, 300);
await page.keyboard.down('w');
// Hochlaufen, bis die Treppe genommen ist — nicht auf eine feste Dauer warten,
// sonst läuft er oben weiter und die Messung hängt von der Laufweite ab
await stepUntil(page, () => window.game.player.body.translation().y > 4, 300);
await page.keyboard.up('w');
results.stairs = await state();

for (const [k, v] of Object.entries(results))
  console.log(
    `=== ${k} ===`,
    typeof v === 'object' && v?.pos
      ? `${v.st} @ (${v.pos.x.toFixed(1)}, ${v.pos.y.toFixed(1)}, ${v.pos.z.toFixed(1)})`
      : v,
  );
console.log('Konsolen-Fehler:', errors.length ? errors : 'keine');
await browser.close();

const fails = [];
if (results.spawn.level !== 'Rooftops District' || results.spawn.st !== 'RUN') fails.push('spawn');
const calls = Number(results.stats?.match(/(\d+) calls/)?.[1] ?? 999);
// Budget aus Task 17b ist 150. Der Stadt-Batch bündelt alle Boxen nach Stil,
// deshalb liegt die Stadt bei ~30 — bei 80 ist etwas an der Bündelung kaputt.
if (calls >= 80) fails.push(`draw-calls (${calls})`);
if (results.gapJump.st !== 'RUN' || results.gapJump.pos.y < 13.5) fails.push('dachluecke');
if (results.rail.st !== 'BALANCE') fails.push('rail');
if (results.bar.st !== 'SWING') fails.push('stange');
if (results.shed.st !== 'HANG') fails.push('kletterhaus');
if (results.fireEscape.st !== 'RUN' || results.fireEscape.pos.y < 3) fails.push('feuerleiter');
if (results.bridge.st !== 'RUN' || results.bridge.pos.y < 7) fails.push('bruecke');
if (!results.carVault) fails.push('auto-vault');
if (results.stairs.pos.y < 4) fails.push('treppe');

console.log(fails.length ? `FAILS: ${fails.join(', ')} — calls=${calls}` : `CITY OK (${calls} draw calls)`);
process.exit(fails.length || errors.length ? 1 : 0);
