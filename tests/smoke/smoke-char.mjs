// Task 21: Charaktermodell + Animator. Lädt bewusst OHNE ?nochar=1 —
// der einzige Test, der den FBX-Ladepfad und das Clip-Mapping prüft.
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

// FBX-Download (~17 MB) + Parsen dauert headless deutlich länger
await page.waitForFunction(() => window.game?.player?.animator != null, null, {
  timeout: 120_000,
});
await page.waitForTimeout(2000);

const state = () =>
  page.evaluate(() => {
    const p = window.game.player;
    let skinned = 0;
    p.mesh.traverse((o) => o.isSkinnedMesh && skinned++);
    return {
      skinned,
      placeholderVisible: p.placeholder[0].visible,
      clip: p.animator.currentName,
      fsm: p.fsm.current,
    };
  });

const results = {};
results.loaded = await state();

// Loslaufen → run-Clip
await page.keyboard.down('w');
await page.waitForTimeout(1500);
results.running = await state();
await page.keyboard.up('w');

// Stehenbleiben → idle-Clip
await page.waitForTimeout(1500);
results.idle = await state();

await browser.close();

const checks = {
  'SkinnedMesh vorhanden': results.loaded.skinned > 0,
  'Kapsel unsichtbar': results.loaded.placeholderVisible === false,
  'run-Clip beim Laufen': results.running.clip === 'run' || results.running.clip === 'sprint',
  'idle-Clip im Stand': results.idle.clip === 'idle',
  'keine Konsolen-Fehler': errors.length === 0,
};

console.log(JSON.stringify({ results, errors }, null, 2));
let ok = true;
for (const [name, pass] of Object.entries(checks)) {
  console.log(`${pass ? 'OK  ' : 'FAIL'} ${name}`);
  if (!pass) ok = false;
}
process.exit(ok ? 0 : 1);
