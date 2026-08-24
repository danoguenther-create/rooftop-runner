import { chromium } from 'playwright-core';
import { stepMs, waitForGrounded } from './harness.mjs';

const base = process.argv[2] ?? 'http://localhost:4173/rooftop-runner/';
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium-browser',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

const teleport = (x, y, z) =>
  page.evaluate(
    ([x, y, z]) => {
      const g = window.game;
      g.player.body.setTranslation({ x, y, z }, true);
      g.player.body.setNextKinematicTranslation({ x, y, z });
      g.player.velocity.set(0, 0, 0);
    },
    [x, y, z],
  );
const hudText = (sel) => page.evaluate((s) => document.querySelector(s)?.textContent ?? '', sel);

const results = {};

// ========== City: Mission (Combo) + Zeitrennen ==========
await page.goto(`${base}?level=city01&play=1&nochar=1`, { waitUntil: 'load' });
await waitForGrounded(page);

// --- Mission 3 (Combo ×6): Tricks über den Bus simulieren, dann banken
await page.keyboard.press('Digit3');
await stepMs(page, 300);
results.missionPanel = await page.evaluate(
  () => [...document.querySelectorAll('#hud div')].some((d) => d.textContent?.includes('Combo-König')),
);
await page.evaluate(() => {
  for (let i = 0; i < 6; i++) window.game.bus.emit('trick:wallrun', { side: 'left' });
});
await stepMs(page, 2500); // Banking nach 1.5 s in RUN
results.missionDone = await page.evaluate(
  () => [...document.querySelectorAll('#hud div')].some((d) => d.textContent?.includes('Mission erfüllt')),
);

// --- Zeitrennen: Start berühren, Tore in Reihenfolge, Finish.
// Die Strecke kommt aus dem Level, nicht aus abgeschriebenen Zahlen — sonst
// ist der Test nach jeder Änderung am Stadtplan rot (siehe Kapitel 7.3).
const route = await page.evaluate(() => {
  const m = window.game.level.markers;
  return {
    start: m.find((x) => x.type === 'trialStart').pos,
    gates: m
      .filter((x) => x.type === 'checkpoint')
      .sort((a, b) => Number(a.id.replace(/\D/g, '')) - Number(b.id.replace(/\D/g, '')))
      .map((x) => x.pos)
      .concat([m.find((x) => x.type === 'finish').pos]),
  };
});
await teleport(...route.start);
await stepMs(page, 500);
results.timerVisible = await page.evaluate(() =>
  [...document.querySelectorAll('#hud div')].some(
    (d) => d.style.display !== 'none' && /^\d\d:\d\d\.\d\d$/.test(d.textContent ?? ''),
  ),
);
for (const [x, y, z] of route.gates) {
  // Ein Tor liegt über einer Balance-Rail. Landet der Spieler darauf, führt
  // der Balancer die Kapsel und überschreibt jeden weiteren Teleport — die
  // restlichen Tore würden nie erreicht. Deshalb vor dem Teleport von der
  // Rail lösen und knapp über dem Tor absetzen (Torradius ist 1.6 m).
  await page.evaluate(() => {
    window.game.player.balancer.active = null;
  });
  await teleport(x, y + 0.8, z);
  await stepMs(page, 120);
}
await stepMs(page, 500);
results.trialOverlay = await page.evaluate(() => {
  const el = [...document.querySelectorAll('#hud div')].find((d) =>
    d.textContent?.includes('GOLD') || d.textContent?.includes('Medaille'),
  );
  return el?.textContent ?? null;
});

// ========== Testlevel: Collectible einsammeln ==========
await page.goto(`${base}?play=1&nochar=1`, { waitUntil: 'load' });
await waitForGrounded(page);
await teleport(6, 3.0, 0); // col-t1
await stepMs(page, 600);
results.collectCounter = await hudText('.hud-collect');

for (const [k, v] of Object.entries(results)) console.log(`=== ${k} ===`, JSON.stringify(v));
console.log('Konsolen-Fehler:', errors.length ? errors : 'keine');
await browser.close();

const fails = [];
if (!results.missionPanel) fails.push('missions-panel');
if (!results.missionDone) fails.push('mission-erfuellt');
if (!results.timerVisible) fails.push('trial-timer');
if (!results.trialOverlay?.includes('GOLD')) fails.push('trial-gold');
if (!results.collectCounter?.includes('1/3') && !results.collectCounter?.includes('1 / 3'))
  fails.push('collect-zaehler');

console.log(fails.length ? `FAILS: ${fails.join(', ')}` : 'M4 OK');
process.exit(fails.length || errors.length ? 1 : 0);
