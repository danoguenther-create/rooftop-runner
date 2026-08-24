/**
 * Treppen: kommt der Charakter wirklich hoch — und wieder runter?
 *
 * Die Treppen sind der einzige Weg zurück aufs Dach, der keine Technik
 * verlangt. Bleibt der Spieler auf halber Höhe hängen, ist die Stadt kaputt,
 * ohne dass irgendein anderer Test rot wird. Genau das ist beim Stadtbild-Pass
 * passiert (Autostep-Limit, Deck über der Treppe — siehe Kapitel 7.3), deshalb
 * prüft das hier jede Treppe einzeln, hoch und runter, gehend und sprintend.
 *
 * Die Treppen werden im Level gesucht (Stufen sind 3 x 0.4 x 0.9), nicht
 * abgeschrieben — der Stadtplan verschiebt sie.
 */
import { chromium } from 'playwright-core';
import { stepMs, waitForPlaying } from './harness.mjs';

const base = process.argv[2] ?? 'http://localhost:4173/rooftop-runner/';
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium-browser',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
// Bewusst MIT Charaktermodell: der Test soll die Treppe so prüfen, wie sie
// gespielt wird. Auf die Physik wirkt das Modell nicht, aber ein Fehler beim
// Animieren fiele hier ebenfalls als Konsolenfehler auf.
await page.goto(`${base}?level=city01&play=1`, { waitUntil: 'load' });
await waitForPlaying(page);

const teleport = (x, y, z) =>
  page.evaluate(
    ([x, y, z]) => {
      const g = window.game;
      g.player.balancer.active = null;
      g.player.body.setTranslation({ x, y, z }, true);
      g.player.body.setNextKinematicTranslation({ x, y, z });
      g.player.velocity.set(0, 0, 0);
    },
    [x, y, z],
  );
const lookAt = (yaw) =>
  page.evaluate((y) => {
    window.game.followCamera.yaw = y;
  }, yaw);
const state = () =>
  page.evaluate(() => {
    const t = window.game.player.body.translation();
    return { st: window.game.player.fsm.current, x: t.x, y: t.y, z: t.z };
  });

/** Alle Treppen aus den Stufen-Deckflächen rekonstruieren. */
const flights = await page.evaluate(() => {
  const steps = window.game.level.topFaces.filter(
    (f) => Math.abs(f.halfX - 1.5) < 0.01 && Math.abs(f.halfZ - 0.45) < 0.01,
  );
  const byZ = new Map();
  for (const s of steps) {
    const key = s.cz.toFixed(1);
    if (!byZ.has(key)) byZ.set(key, []);
    byZ.get(key).push(s);
  }
  return [...byZ.values()]
    .map((group) => {
      group.sort((a, b) => a.y - b.y);
      return {
        z: group[0].cz,
        xFoot: group[0].cx - group[0].halfX, // Vorderkante der untersten Stufe
        yTop: group[group.length - 1].y,
        steps: group.length,
      };
    })
    .sort((a, b) => a.z - b.z);
});

const EAST = -Math.PI / 2; // W läuft nach +x — die Treppen steigen in +x
const WEST = Math.PI / 2;

/**
 * Takten und Prüfen in EINEM page.evaluate: die Schleife läuft im Browser.
 * Über die Playwright-Brücke wären das pro Treppe hunderte Runden, und jede
 * kostet unter Software-GL bis zu einen Bildtakt — der Test brauchte so
 * dreieinhalb Minuten statt weniger Sekunden.
 */
const runUntil = (goal, maxSteps, arg) =>
  page.evaluate(
    ([goal, maxSteps, arg]) => {
      const g = window.game;
      const reached = () =>
        goal === 'up'
          ? g.player.body.translation().y > arg + 0.7
          : g.player.body.translation().y < 1.6;
      for (let i = 0; i < maxSteps && !reached(); i++) g.stepFixed(1);
      const t = g.player.body.translation();
      return { reached: reached(), st: g.player.fsm.current, x: t.x, y: t.y, z: t.z };
    },
    [goal, maxSteps, arg],
  );

/** Läuft die Treppe hoch und liefert den erreichten Zustand. */
const climb = async (f, sprint) => {
  await lookAt(EAST);
  await teleport(f.xFoot - 3, 1.4, f.z);
  await stepMs(page, 400); // absetzen lassen, sonst startet er im Fall
  if (sprint) await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  const res = await runUntil('up', 900, f.yTop);
  await page.keyboard.up('w');
  if (sprint) await page.keyboard.up('Shift');
  return res;
};

/** Läuft von oben wieder hinunter — ohne Sturz (BAIL wäre ein Fehlschlag). */
const descend = async (f) => {
  await climb(f, false);
  await stepMs(page, 200);
  await lookAt(WEST); // umdrehen und dieselbe Treppe zurück
  await page.keyboard.down('w');
  const res = await runUntil('down', 900);
  await page.keyboard.up('w');
  await stepMs(page, 300);
  return res;
};

const fails = [];
for (const [n, f] of flights.entries()) {
  const label = `Treppe ${n + 1} (z=${f.z.toFixed(1)}, ${f.steps} Stufen, Dach ${f.yTop.toFixed(1)} m)`;

  const walked = await climb(f, false);
  const sprinted = await climb(f, true);
  const back = await descend(f);

  const ok = walked.reached && sprinted.reached && back.reached && back.st !== 'BAIL';
  if (!ok) fails.push(`Treppe ${n + 1}`);
  console.log(
    `${ok ? 'OK  ' : 'FAIL'} ${label}\n` +
      `       gehend   ${walked.reached ? 'oben' : 'STECKEN'} bei y=${walked.y.toFixed(2)} (${walked.st})\n` +
      `       sprint   ${sprinted.reached ? 'oben' : 'STECKEN'} bei y=${sprinted.y.toFixed(2)} (${sprinted.st})\n` +
      `       zurück   ${back.reached ? 'unten' : 'STECKEN'} bei y=${back.y.toFixed(2)} (${back.st})`,
  );
}

console.log('Konsolen-Fehler:', errors.length ? errors : 'keine');
await browser.close();
console.log(
  fails.length ? `FAILS: ${fails.join(', ')}` : `TREPPEN OK (${flights.length} Stück, hoch und runter)`,
);
process.exit(fails.length || errors.length ? 1 : 0);
