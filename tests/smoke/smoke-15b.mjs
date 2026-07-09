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
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(4000);

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
  await page.waitForTimeout(600);
};

const results = {};

// 1) Einfacher Backflip aus ~5.7 m Fall (Pfeil-runter sofort)
await teleport(0, 6.5, -20, 0, 2, 0);
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(1400);
results.backflip = await debug();
await reset();

// 2) Double-Backflip aus ~13 m Fall (zweimal Pfeil-runter)
await teleport(0, 14, -20, 0, 0, 0);
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(60);
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(1700);
results.doubleBackflip = await debug();
await reset();

// 3) Unfertige Rotation: Frontflip erst kurz vor der Landung -> BAIL
await teleport(0, 6.5, -20, 0, 0, 0);
await page.waitForTimeout(500);
await page.keyboard.press('ArrowUp');
await page.waitForTimeout(700);
results.flipBail = await debug();
await reset();
await page.waitForTimeout(1500); // BAIL ausstehen lassen

// 4) Spin 180 (E in der Luft)
await teleport(0, 5, -20, 0, 2, 0);
await page.keyboard.press('KeyE');
await page.waitForTimeout(1300);
results.spin = await debug();
await reset();

// 5) Gainer: Backflip mit Vorwärtsspeed (A hält +x-Richtung)
await page.keyboard.down('a');
await teleport(0, 6, -20, 6, 1, 0);
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(1300);
results.gainer = await debug();
await page.keyboard.up('a');

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
