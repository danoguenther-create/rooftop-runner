// Game of PARK (S.K.A.T.E.-Prinzip im Splitscreen): treibt die
// Zustandsmaschine über synthetische Trick-Events auf den Spieler-Bussen.
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

await page.goto(`${url}?play=1&mode=split&game=park&nochar=1`, { waitUntil: 'load' });
await waitForGrounded(page);

const tm = () =>
  page.evaluate(() => {
    const t = window.game.trickMatch;
    return { phase: t.phase, setter: t.setter, target: t.targetId, letters: [...t.letters], over: t.over };
  });
const emit = (playerIdx, event, payload) =>
  page.evaluate(
    ([i, ev, pl]) => window.game.players[i].bus.emit(ev, pl),
    [playerIdx, event, payload],
  );

const results = {};
results.initial = await tm();

// P1 legt Double-Backflip vor -> Phase MATCH
await emit(0, 'trick:flip', { kind: 'back', count: 2, gainer: false });
await stepMs(page, 200);
results.set = await tm();

// P2 macht den FALSCHEN Trick -> bleibt MATCH
await emit(1, 'trick:spin', { halfTurns: 2 });
await stepMs(page, 200);
results.wrong = await tm();

// P2 kontert den richtigen Trick -> zurück zu SET, P1 bleibt Vorleger, kein Buchstabe
await emit(1, 'trick:flip', { kind: 'back', count: 2, gainer: false });
await stepMs(page, 200);
results.matched = await tm();

// P1 legt erneut vor; P2 lässt die Zeit ablaufen -> Buchstabe für P2
await emit(0, 'trick:vault', { obstacleHeight: 1 });
await stepMs(page, 200);
await page.evaluate(() => {
  window.game.trickMatch.timeLeft = 0.01;
});
await stepMs(page, 400);
results.letter = await tm();

// P1 (Vorleger) verpatzt den nächsten Versuch -> Vorlegerecht wechselt zu P2
await emit(0, 'player:bail', { fallHeight: 7 });
await stepMs(page, 200);
results.switched = await tm();

console.log(JSON.stringify(results, null, 1));
console.log('Konsolen-Fehler:', errors.length ? errors : 'keine');
await browser.close();

const fails = [];
if (results.initial.phase !== 'SET' || results.initial.setter !== 0) fails.push('startphase');
if (results.set.phase !== 'MATCH' || results.set.target !== 'flip:back:2:0') fails.push('vorlegen');
if (results.wrong.phase !== 'MATCH') fails.push('falscher-trick-zaehlt');
if (results.matched.phase !== 'SET' || results.matched.setter !== 0) fails.push('kontern');
if (String(results.matched.letters) !== '0,0') fails.push('kontern-buchstabe');
if (String(results.letter.letters) !== '0,1') fails.push('buchstabe');
if (results.switched.setter !== 1) fails.push('vorleger-wechsel');

console.log(fails.length ? `FAILS: ${fails.join(', ')}` : 'GAME OF PARK OK');
process.exit(fails.length || errors.length ? 1 : 0);
