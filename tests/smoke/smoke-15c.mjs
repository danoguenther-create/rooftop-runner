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

const debug = () =>
  page.evaluate(() => {
    for (const el of document.querySelectorAll('#hud div'))
      if (el.textContent?.includes('state:')) return el.textContent;
    return null;
  });
const ticker = () =>
  page.evaluate(() => [...document.querySelectorAll('.hud-tick')].map((e) => e.textContent));
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

// 1) Diveroll: C in der Luft halten bis zur Landung (Fall ~5 m, vorwärts)
await page.evaluate(() => {
  window.game.followCamera.yaw = -Math.PI / 2; // Kamera auf +x
});
await page.keyboard.down('w'); // hält +x-Speed
await teleport(0, 6, -20, 5, 2, 0);
await page.keyboard.down('c');
await page.waitForTimeout(1400);
results.diveroll = await debug();
await page.keyboard.up('c');
await page.keyboard.up('w');
await reset();

// 2) Dive angesetzt, aber C vor der Landung losgelassen -> Bail schon ab 3 m
//    (Fall ~4.6 m: ohne Dive wäre das nur eine harte Landung, kein Bail)
await teleport(0, 5.5, -20, 0, 0, 0);
await page.waitForTimeout(150);
await page.keyboard.down('c');
await page.waitForTimeout(150);
await page.keyboard.up('c');
await page.waitForTimeout(800);
results.diveBail = await debug();
await reset();
await page.waitForTimeout(1500);

// 3) Kanten-Precision: Landung 0.3 m neben der Plattformkante (Fall ~2.5 m)
await teleport(7.7, 5.5, 0, 0, 0, 0);
await page.waitForTimeout(1200);
results.edgePrecision = await debug();
results.edgeTicker = await ticker();
await reset();
await page.waitForTimeout(2000);

// 4) Landung mitten auf derselben Plattform -> KEINE Precision
await teleport(6, 5.5, 0, 0, 0, 0);
await page.waitForTimeout(1200);
results.centerTicker = await ticker();
results.center = await debug();

for (const [k, v] of Object.entries(results)) console.log(`=== ${k} ===\n${JSON.stringify(v)}\n`);
console.log('Konsolen-Fehler:', errors.length ? errors : 'keine');
await browser.close();

const fails = [];
if (!results.diveroll?.includes('diveroll (')) fails.push('diveroll');
if (!results.diveBail?.includes('state: BAIL')) fails.push('dive-bail');
if (!results.edgePrecision?.includes('precision (edge)')) fails.push('kanten-precision');
if (results.centerTicker?.some((t) => t?.includes('PRECISION'))) fails.push('mitte-false-positive');

console.log(fails.length ? `FAILS: ${fails.join(', ')}` : 'DIVEROLL + KANTEN-PRECISION OK');
process.exit(fails.length || errors.length ? 1 : 0);
