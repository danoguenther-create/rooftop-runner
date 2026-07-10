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
    sway: window.game.player.balancer.sway,
    balanceVisible: document.querySelector('.hud-balance')?.style.display === 'block',
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

// --- 1) Auf Rail 1 landen (gerade, z=16) -> BALANCE, kein Auto-Slide mehr
await teleport(0, 3.6, 16, 3, 0, 0);
await page.waitForTimeout(300);
results.snap = await state();
await page.waitForTimeout(1200);
results.noSlide = await state();

// --- 2) Mit W auf der Rail gehen (Kamera-Ausrichtung -> +x)
await page.keyboard.down('w');
await page.waitForTimeout(1000);
await page.keyboard.up('w');
results.walk = await state();

// --- 3) Absprung mit Space -> balanceEnd
await page.keyboard.press('Space');
await page.waitForTimeout(400);
results.jumpOff = await state();
await page.keyboard.press('r'); // sauberer Reset (Rail ist auch Swing-Stange)
await page.waitForTimeout(800);

// --- 4) Erneut aufschnappen, dann mit D die Balance kippen -> Sturz
await teleport(0, 3.6, 16, 2, 0, 0);
await page.waitForTimeout(300);
results.resnap = await state();
await page.keyboard.down('d');
await page.waitForTimeout(700);
await page.keyboard.up('d');
results.tipped = await state();

for (const [k, v] of Object.entries(results))
  console.log(
    `=== ${k} === ${v.st} @ x=${v.pos.x.toFixed(2)} sway=${v.sway === null ? 'null' : v.sway.toFixed(2)} gauge=${v.balanceVisible} trick=${v.trick}`,
  );
console.log('Konsolen-Fehler:', errors.length ? errors : 'keine');
await browser.close();

const fails = [];
if (results.snap.st !== 'BALANCE') fails.push('snap');
if (!results.snap.balanceVisible) fails.push('hud-gauge');
if (results.noSlide.st !== 'BALANCE' || results.noSlide.pos.x > 2) fails.push('kein-autoslide');
if (results.walk.st !== 'BALANCE' || results.walk.pos.x - results.noSlide.pos.x < 1.5)
  fails.push('gehen');
if (!results.jumpOff.trick?.includes('balanceEnd')) fails.push('absprung');
if (results.resnap.st !== 'BALANCE') fails.push('resnap');
if (results.tipped.st === 'BALANCE' || !results.tipped.trick?.includes('balanceEnd'))
  fails.push('kippen');

console.log(fails.length ? `FAILS: ${fails.join(', ')}` : 'BALANCE OK');
process.exit(fails.length || errors.length ? 1 : 0);
