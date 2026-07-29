import { chromium } from 'playwright-core';
import { stepMs, waitForGrounded } from './harness.mjs';

const url = process.argv[2] ?? 'http://localhost:4173/rooftop-runner/';
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium-browser',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${url}?play=1&nochar=1`, { waitUntil: 'load' });
await waitForGrounded(page);

const debug = () =>
  page.evaluate(() => {
    for (const el of document.querySelectorAll('#hud div'))
      if (el.textContent?.includes('state:')) return el.textContent;
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
const reset = async () => {
  await page.keyboard.press('r');
  // Bis zur Landung warten: nach Respawn sind Lufttricks erst nach dem
  // ersten Bodenkontakt wieder scharf (Spawn-Fall-Schutz)
  await page.waitForFunction(() => window.game.player.grounded, null, { timeout: 8000 });
  await stepMs(page, 200);
};

const results = {};

// 1) Einfacher Backflip aus ~5.7 m Fall (Pfeil-runter sofort)
await teleport(0, 6.5, -20, 0, 2, 0);
await stepMs(page, 100); // erst AIR werden — Lufttricks werden nur im Flug gequeued
await page.keyboard.press('ArrowDown');
await stepMs(page, 1400);
results.backflip = await debug();
await reset();

// 2) Double-Backflip aus ~13 m Fall (zweimal Pfeil-runter)
await teleport(0, 14, -20, 0, 0, 0);
await stepMs(page, 100); // erst AIR werden — Lufttricks werden nur im Flug gequeued
await page.keyboard.press('ArrowDown');
await stepMs(page, 60);
await page.keyboard.press('ArrowDown');
await stepMs(page, 1700);
results.doubleBackflip = await debug();
await reset();

// 3) Unfertige Rotation: Frontflip erst kurz vor der Landung -> BAIL
await teleport(0, 6.5, -20, 0, 0, 0);
await stepMs(page, 500);
await page.keyboard.press('ArrowUp');
await stepMs(page, 700);
results.flipBail = await debug();
await reset();
await stepMs(page, 1500); // BAIL ausstehen lassen

// 4) Spin 180 (E in der Luft — seit dem Splitscreen-Umbau wieder Q/E)
await teleport(0, 5, -20, 0, 2, 0);
await stepMs(page, 100); // erst AIR werden — Lufttricks werden nur im Flug gequeued
await page.keyboard.press('e');
await stepMs(page, 1300);
results.spin = await debug();
await reset();

// 5) Gainer: Backflip mit Vorwärtsspeed (Kamera auf +x, W hält den Speed)
await page.evaluate(() => {
  window.game.followCamera.yaw = -Math.PI / 2;
});
await page.keyboard.down('w');
await teleport(0, 6, -20, 6, 1, 0);
// Hier ohne Vorlauf: der Spieler dreht sich mit gehaltenem W in die neue
// Kamerarichtung, und ein Vorlauf würde die Flip-Achse mitdrehen (aus dem
// Backflip würde ein Frontflip). Der Teleport mit vy=1 macht ihn sofort AIR.
await page.keyboard.press('ArrowDown');
await stepMs(page, 1300);
results.gainer = await debug();
await page.keyboard.up('w');

for (const [k, v] of Object.entries(results)) console.log(`=== ${k} ===\n${v}\n`);
console.log('Konsolen-Fehler:', errors.length ? errors : 'keine');
await browser.close();

const fails = [];
if (!results.backflip?.includes('flip (back x1')) fails.push('backflip');
if (!results.doubleBackflip?.includes('flip (back x2')) fails.push('double');
if (!results.flipBail?.includes('state: BAIL')) fails.push('flip-bail');
if (results.flipBail?.includes('flip (front')) fails.push('bail-darf-nicht-punkten');
if (!results.spin?.includes('spin (180°)')) fails.push('spin');
if (!results.gainer?.includes('gainer')) fails.push('gainer');

console.log(fails.length ? `FAILS: ${fails.join(', ')}` : 'FLIPS + SPINS OK');
process.exit(fails.length || errors.length ? 1 : 0);
