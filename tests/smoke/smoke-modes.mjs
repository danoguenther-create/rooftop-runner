/**
 * Prüft, dass ALLE Spielmodi das City-Level laden und beide Spieler dort
 * sauber stehen. Singleplayer, Zeitrennen, Splitscreen und Game of PARK
 * teilen sich dieselbe Level-Datei, aber unterschiedliche Startpfade — nach
 * einem Umbau am Stadtplan kann ein Modus kaputt sein, während die anderen
 * laufen (Spieler 2 spawnt 1.5 m versetzt und landet sonst auf einem
 * Dachaufbau). Die Kennzahlen unterscheiden außerdem die neue Stadt von der
 * alten Fassung, damit ein veralteter Build auffällt.
 */
import { chromium } from 'playwright-core';
import { stepUntil, waitForPlaying } from './harness.mjs';

const base = process.argv[2] ?? 'http://localhost:4173/rooftop-runner/';
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium-browser',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});

const modes = [
  ['Singleplayer', 'level=city01&play=1&nochar=1'],
  ['Time Trial', 'level=city01&play=1&trial=1&nochar=1'],
  ['Splitscreen', 'level=city01&mode=split&play=1&nochar=1'],
  ['Game of PARK', 'level=city01&mode=split&game=park&play=1&nochar=1'],
];

let bad = 0;
for (const [name, query] of modes) {
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${base}?${query}`, { waitUntil: 'load' });
  await waitForPlaying(page);
  await stepUntil(page, () => window.game.players.every((p) => p.fsm.current === 'RUN'), 300);

  const info = await page.evaluate(() => ({
    level: window.game.level.name,
    // Kennzahlen der neuen Stadt: alte Fassung hatte 163 Deckflächen / 29 Rails
    faces: window.game.level.topFaces.length,
    rails: window.game.level.rails.length,
    collectibles: window.game.level.markers.filter((m) => m.type === 'collectible').length,
    players: window.game.players.map((p) => {
      const t = p.body.translation();
      return `${p.fsm.current} @ (${t.x.toFixed(1)}, ${t.y.toFixed(1)}, ${t.z.toFixed(1)})`;
    }),
  }));
  const ok =
    info.level === 'Rooftops District' &&
    info.faces > 400 &&
    info.collectibles === 33 &&
    info.players.every((p) => p.startsWith('RUN')) &&
    errors.length === 0;
  if (!ok) bad++;
  console.log(
    `${ok ? 'OK  ' : 'FAIL'} ${name.padEnd(13)} ${info.level} · ${info.faces} Deckflächen · ` +
      `${info.rails} Rails · ${info.collectibles} Sammelobjekte · ${info.players.join('  ')}` +
      (errors.length ? `\n     Fehler: ${errors.join(' | ')}` : ''),
  );
  await page.close();
}
await browser.close();
console.log(bad ? `${bad} Modus/Modi fehlerhaft` : 'Alle Modi laden die neue Stadt');
process.exit(bad ? 1 : 0);
