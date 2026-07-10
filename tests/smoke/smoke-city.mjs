import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:4173/rooftop-runner/';
const url = `${base}?level=city01&play=1&nochar=1`;
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium-browser',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(5000);

const state = () =>
  page.evaluate(() => ({
    st: window.game.player.fsm.current,
    pos: window.game.player.body.translation(),
    level: window.game.level.name,
  }));
const stats = () =>
  page.evaluate(() => {
    for (const el of document.querySelectorAll('#hud div'))
      if (el.textContent?.includes('calls')) return el.textContent;
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
  await page.waitForTimeout(700);
};

const results = {};
results.spawn = await state();
results.stats = await stats();

// --- Dachlücken-Sprung: B0 (h14) -> B1 (h13), 3.5-m-Lücke (A hält +x-Speed)
await page.keyboard.down('a');
await teleport(-64, 15, -20, 8, 8, 0);
await page.waitForTimeout(1700);
await page.keyboard.up('a');
results.gapJump = await state();
await reset();

// --- Geneigte Balance-Rail über die Straße: B1 (13) -> A1 (11)
await teleport(-52.5, 14.3, -27.5, 0, 0, -3);
await page.waitForTimeout(400);
results.rail = await state();
await reset();

// --- Schwungstange: von B3-Dach (12) fallend an Stange (y=13, z=-28.5)
await teleport(-17.5, 12.1, -28.2, 0, 0, -3);
await page.waitForTimeout(400);
results.bar = await state();
await reset();

// --- Kletterhäuschen auf A2: Anlauf -> Wandlauf -> HANG
await page.keyboard.down('a');
await teleport(-43, 9.95, -48, 6, 0, 0);
await page.waitForTimeout(2400);
await page.keyboard.up('a');
results.shed = await state();
await reset();

// --- Treppe C6 von der Straße hoch (A-Taste = +x)
await teleport(28.5, 1.0, -2.7, 0, 0, 0);
await page.waitForTimeout(300);
await page.keyboard.down('a');
await page.waitForTimeout(5000);
await page.keyboard.up('a');
results.stairs = await state();

for (const [k, v] of Object.entries(results))
  console.log(
    `=== ${k} ===`,
    typeof v === 'string'
      ? v
      : `${v.st} @ (${v.pos.x.toFixed(1)}, ${v.pos.y.toFixed(1)}, ${v.pos.z.toFixed(1)})`,
  );
console.log('Konsolen-Fehler:', errors.length ? errors : 'keine');
await browser.close();

const fails = [];
if (results.spawn.level !== 'Rooftops District' || results.spawn.st !== 'RUN')
  fails.push('spawn');
const calls = Number(results.stats?.match(/(\d+) calls/)?.[1] ?? 999);
if (calls >= 150) fails.push(`draw-calls (${calls})`);
if (results.gapJump.st !== 'RUN' || results.gapJump.pos.y < 13.5) fails.push('dachluecke');
if (results.rail.st !== 'BALANCE') fails.push('rail');
if (results.bar.st !== 'SWING') fails.push('stange');
if (results.shed.st !== 'HANG') fails.push('kletterhaus');
if (results.stairs.pos.y < 4) fails.push('treppe');

console.log(fails.length ? `FAILS: ${fails.join(', ')} — calls=${calls}` : `CITY OK (${calls} draw calls)`);
process.exit(fails.length || errors.length ? 1 : 0);
