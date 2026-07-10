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
    trick: (() => {
      for (const el of document.querySelectorAll('#hud div'))
        if (el.textContent?.includes('state:')) return el.textContent.split('trick: ')[1];
      return null;
    })(),
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

const results = {};

// --- 1) Von unten an Stange 1 (y=3.2, z=8.6) anfliegen -> SWING
await teleport(-16, 2.4, 8.2, 0, 0, 3);
await page.waitForTimeout(250);
results.snap = await state();

// --- 2) Pendeln + Pumpen (W), Position muss unter der Stange schwingen
await page.keyboard.down('w');
await page.waitForTimeout(600);
await page.keyboard.up('w');
results.pumping = await state();

// --- 3) Loslassen mit Space -> AIR mit Momentum, Event trick:swing
await page.keyboard.press('Space');
await page.waitForTimeout(300);
results.released = await state();
await page.waitForTimeout(1500);
results.landed = await state();

for (const [k, v] of Object.entries(results))
  console.log(
    `=== ${k} === ${v.st} @ (${v.pos.x.toFixed(2)}, ${v.pos.y.toFixed(2)}, ${v.pos.z.toFixed(2)}) trick=${v.trick}`,
  );
console.log('Konsolen-Fehler:', errors.length ? errors : 'keine');
await browser.close();

const fails = [];
if (results.snap.st !== 'SWING') fails.push('snap');
if (results.pumping.st !== 'SWING' || results.pumping.pos.y > 3.2) fails.push('pendel');
if (results.released.st !== 'AIR' && results.released.st !== 'RUN') fails.push('release');
if (!results.released.trick?.includes('swing (x1)')) fails.push('swing-event');
if (results.landed.st !== 'RUN') fails.push('landung');

console.log(fails.length ? `FAILS: ${fails.join(', ')}` : 'BAR-SWING OK');
process.exit(fails.length || errors.length ? 1 : 0);
