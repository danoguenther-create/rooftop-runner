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

// Kamera dauerhaft auf +x drehen — alle Lauf-Abschnitte gehen in +x,
// W hält dann den Speed (A/D drehen seit dem Steuerungs-Umbau nur noch)
await page.evaluate(() => {
  window.game.followCamera.yaw = -Math.PI / 2;
});

// --- Dachlücken-Sprung: B0 (h14) -> B1 (h13), 3.5-m-Lücke (W hält +x-Speed)
// Auf die Landung warten statt fester Zeit — die Headless-Zeitdilatation
// schwankt von Lauf zu Lauf
await page.keyboard.down('w');
await teleport(-64, 15, -20, 8, 8, 0);
await page
  .waitForFunction(
    () => window.game.player.fsm.current === 'RUN' && window.game.player.body.translation().y > 13,
    null,
    { timeout: 15_000 },
  )
  .catch(() => {});
await page.keyboard.up('w');
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
// W nur bis zum Grab halten — gehaltenes W würde nach der
// 250-ms-Schonfrist sofort das Mantle auslösen
await page.keyboard.down('w');
await teleport(-43, 9.95, -48, 6, 0, 0);
await page
  .waitForFunction(() => window.game.player.fsm.current === 'HANG', null, { timeout: 8000 })
  .catch(() => {});
await page.keyboard.up('w');
await page.waitForTimeout(300);
results.shed = await state();
await reset();

// --- Treppe C6 von der Straße hoch (W = +x, Kamera oben gedreht)
await teleport(28.5, 1.0, -2.7, 0, 0, 0);
await page.waitForTimeout(300);
await page.keyboard.down('w');
await page.waitForTimeout(5000);
await page.keyboard.up('w');
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
