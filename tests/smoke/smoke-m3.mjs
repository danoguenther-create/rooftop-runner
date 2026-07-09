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

await page.goto(`${url}?play=1`, { waitUntil: 'load' });
await page.waitForTimeout(4000);

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

const hudState = () =>
  page.evaluate(() => ({
    score: document.querySelector('.hud-score')?.textContent ?? null,
    combo: document.querySelector('.hud-combo')?.textContent ?? null,
    comboVisible: document.querySelector('.hud-combo')?.style.opacity === '1',
    speedWidth: document.querySelector('.hud-speed-fill')?.style.width ?? null,
    ticker: [...document.querySelectorAll('.hud-tick')].map((e) => e.textContent),
    total: window.game.score.getTotal(),
  }));

const results = {};
results.initial = await hudState();

// --- Combo-Kette: Wall-Run -> Wall-Jump im Korridor, dann landen + banken
await page.keyboard.down('w');
await teleport(-8.7, 2.5, -1, 0, 0, 7);
await page.waitForTimeout(400);
results.duringWallrun = await hudState();
await page.keyboard.press('Space');
await page.waitForTimeout(400);
results.afterWalljump = await hudState();
await page.keyboard.up('w');
await page.waitForTimeout(2500); // landen + 1.5s Banking-Fenster
results.afterBank = await hudState();

// --- Verlust-Test: Combo starten (Gap), dann Bail durch hohen Sturz ohne Roll
await page.keyboard.press('r');
await page.waitForTimeout(600);
await teleport(7.8, 3.6, 0, 8, 0.5, 0); // Gap-Zone airborne durchfliegen
await page.waitForTimeout(700);
results.gapCombo = await hudState();
await teleport(0, 12, -20, 0, 0, 0); // 12 m Sturz auf den Boden -> BAIL
await page.waitForTimeout(2200); // Sturz ~1.1s + Verlust-Animation 0.4s
results.afterBail = await hudState();

for (const [k, v] of Object.entries(results)) console.log(`=== ${k} ===`, JSON.stringify(v));
console.log('Konsolen-Fehler:', errors.length ? errors : 'keine');
await browser.close();

const fails = [];
if (results.initial.score !== '0') fails.push('initial-score');
if (!results.duringWallrun.comboVisible && !results.afterWalljump.comboVisible)
  fails.push('combo-sichtbar');
if (!results.afterWalljump.combo?.includes('×')) fails.push('combo-format');
if (!(results.afterBank.total > 0)) fails.push('banking');
if (results.afterBank.score === '0') fails.push('score-anzeige');
if (results.afterBank.comboVisible) fails.push('combo-versteckt-nach-bank');
if (!(results.gapCombo.total === results.afterBank.total)) fails.push('gap-noch-nicht-gebankt');
if (results.afterBail.total !== results.afterBank.total) fails.push('bail-verwirft');
if (results.afterBail.comboVisible) fails.push('combo-versteckt-nach-bail');
if (!results.duringWallrun.ticker.some((t) => t?.includes('WALL RUN')) &&
    !results.afterWalljump.ticker.some((t) => t?.includes('WALL')))
  fails.push('ticker');

console.log(fails.length ? `FAILS: ${fails.join(', ')}` : 'SCORE + HUD OK');
process.exit(fails.length || errors.length ? 1 : 0);
