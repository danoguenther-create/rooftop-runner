// Splitscreen-Duell (2026-07-10): zwei Spieler an einer Tastatur.
// Prüft getrennte Eingaben (P1 WASD, P2 Pfeile/Enter) und getrennte Scores.
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

await page.goto(`${url}?play=1&mode=split&nochar=1`, { waitUntil: 'load' });
await page.waitForTimeout(4000);

const state = () =>
  page.evaluate(() => ({
    count: window.game.players.length,
    huds: document.querySelectorAll('.hud-score').length,
    p1: {
      pos: window.game.players[0].body.translation(),
      fsm: window.game.players[0].fsm.current,
    },
    p2: {
      pos: window.game.players[1].body.translation(),
      fsm: window.game.players[1].fsm.current,
    },
  }));

const results = {};
results.initial = await state();

// P1 läuft mit W (Start-Yaw pi -> +z); P2 bleibt stehen
await page.keyboard.down('w');
await page.waitForTimeout(1200);
await page.keyboard.up('w');
results.p1moved = await state();

// P2 läuft mit Pfeil-hoch; P1 bleibt stehen
const p1After = results.p1moved.p1.pos;
await page.keyboard.down('ArrowUp');
await page.waitForTimeout(1200);
await page.keyboard.up('ArrowUp');
results.p2moved = await state();

// P2 springt mit Enter
await page.keyboard.press('Enter');
await page.waitForTimeout(250);
results.p2jump = await state();

for (const [k, v] of Object.entries(results))
  console.log(
    `=== ${k} === P1 ${v.p1.fsm} (${v.p1.pos.z.toFixed(1)})  P2 ${v.p2.fsm} (${v.p2.pos.z.toFixed(1)})`,
  );
console.log('Konsolen-Fehler:', errors.length ? errors : 'keine');
await browser.close();

const dz = (a, b) => Math.abs(a.pos.z - b.pos.z);
const fails = [];
if (results.initial.count !== 2) fails.push('zwei-spieler');
if (results.initial.huds !== 2) fails.push('zwei-huds');
if (dz(results.initial.p1, results.p1moved.p1) < 2) fails.push('p1-bewegt-sich-nicht');
if (dz(results.initial.p2, results.p1moved.p2) > 0.5) fails.push('p2-bewegt-sich-faelschlich');
if (dz(results.p1moved.p2, results.p2moved.p2) < 2) fails.push('p2-bewegt-sich-nicht');
if (Math.abs(results.p2moved.p1.pos.z - p1After.z) > 0.5) fails.push('p1-bewegt-sich-faelschlich');
if (results.p2jump.p2.fsm !== 'AIR') fails.push('p2-sprung');

console.log(fails.length ? `FAILS: ${fails.join(', ')}` : 'SPLITSCREEN OK');
process.exit(fails.length || errors.length ? 1 : 0);
