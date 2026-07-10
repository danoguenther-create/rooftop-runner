import { chromium } from 'playwright-core';

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
await page.waitForTimeout(4000);

const state = () =>
  page.evaluate(() => ({
    st: window.game.player.fsm.current,
    pos: window.game.player.body.translation(),
  }));
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
  await page.waitForTimeout(800);
};

const results = {};

// --- 1) Wandlauf -> Ledge-Grab -> HANG an der 3.5-m-Wand (Front z=-6)
await page.keyboard.down('s'); // Kamera-Start: S laeuft Richtung -z
await teleport(-16, 1.0, -3.5, 0, 0, -6);
await page.waitForTimeout(450);
await page.keyboard.up('s');
await page.waitForTimeout(500);
results.hang = await state();

// --- 2) Mantle: W antippen -> oben auf der Wand (y_center ~ 4.4)
await page.keyboard.down('w');
await page.waitForTimeout(150);
await page.keyboard.up('w');
await page.waitForTimeout(950);
results.mantled = await state();
await reset();

// --- 3) Fall-Grab an der Hangelkante (Slab top y=3.15, Suedkante z=1.6):
//        fallend dicht neben der Kante, S erst im Grab-Fenster druecken
await teleport(-16, 4.2, 1.95, 0, 0, 0);
await page.waitForTimeout(350);
await page.keyboard.down('s'); // Input Richtung Slab (-z)
await page.waitForTimeout(300);
await page.keyboard.up('s');
await page.waitForTimeout(400);
results.fallGrab = await state();

await page.keyboard.down('a');
await page.waitForTimeout(600);
await page.keyboard.up('a');
results.shimmy = await state();

await page.keyboard.down('s');
await page.waitForTimeout(250);
await page.keyboard.up('s');
await page.waitForTimeout(800);
results.released = await state();

for (const [k, v] of Object.entries(results))
  console.log(`=== ${k} === ${v.st} @ (${v.pos.x.toFixed(2)}, ${v.pos.y.toFixed(2)}, ${v.pos.z.toFixed(2)})`);
console.log('Konsolen-Fehler:', errors.length ? errors : 'keine');
await browser.close();

const fails = [];
if (results.hang.st !== 'HANG') fails.push('wandlauf-grab');
if (results.mantled.st !== 'RUN' || results.mantled.pos.y < 4.0) fails.push('mantle');
if (results.fallGrab.st !== 'HANG') fails.push('fall-grab');
if (results.shimmy.st !== 'HANG' || Math.abs(results.shimmy.pos.x - results.fallGrab.pos.x) < 0.3)
  fails.push('shimmy');
if (results.released.st !== 'RUN' || results.released.pos.y > 2) fails.push('loslassen');

console.log(fails.length ? `FAILS: ${fails.join(', ')}` : 'HANG/CLIMB OK');
process.exit(fails.length || errors.length ? 1 : 0);
