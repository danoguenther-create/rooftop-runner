/** Regression for continuous wall-run exits, first-frame grabs and airborne tuck. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { waitForGrounded, stepMs } from './harness.mjs';
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium-browser',
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(
    `${process.argv[2] ?? 'http://127.0.0.1:4175/rooftop-runner/'}?level=testlevel&play=1`,
  );
  await page.waitForFunction(() => window.game?.player?.animator, null, {
    timeout: 120000,
  });
  await waitForGrounded(page);
  await page.keyboard.down('w');
  const wall = await page.evaluate(() => {
    const g = window.game,
      p = g.player;
    p.body.setTranslation({ x: -8.7, y: 2.5, z: -1 }, true);
    p.body.setNextKinematicTranslation({ x: -8.7, y: 2.5, z: -1 });
    p.velocity.set(0, 0, 7);
    let starts = 0;
    const states = [];
    g.bus.on('player:stateChange', (e) => {
      if (e.to === 'WALLRUN') starts++;
      states.push(e.to);
    });
    for (let i = 0; i < 240; i++) g.stepFixed(1);
    return { starts, states, pos: p.body.translation() };
  });
  await page.keyboard.up('w');
  assert.equal(wall.starts, 1, `wall-run retriggers: ${JSON.stringify(wall)}`);
  assert(wall.states.includes('RUN'), 'wall-run reaches a landing');
  console.log('OK continuous wall-run exits once and lands', wall.pos);
  for (const kind of ['front', 'back', 'left', 'right']) {
    await page.keyboard.press('r');
    await stepMs(page, 800);
    const flip = await page.evaluate((kind) => {
      const g = window.game,
        p = g.player;
      p.body.setTranslation({ x: 0, y: 15, z: -20 }, true);
      p.body.setNextKinematicTranslation({ x: 0, y: 15, z: -20 });
      p.velocity.set(0, 0, 0);
      p.fsm.transition('AIR');
      g.stepFixed(2); // synchronize the teleported collider before starting the trick
      p.airTricks.queueFlip(kind);
      const distances = () =>
        ['Left', 'Right'].map((side) => {
          const leg = p.contactPose.legs[side === 'Left' ? 0 : 1];
          const a = leg.upper.position.clone(),
            b = a.clone();
          return leg.upper
            .getWorldPosition(a)
            .distanceTo(leg.end.getWorldPosition(b));
        });
      p.update(1 / 60);
      const extended = distances();
      for (let i = 0; i < 15; i++) {
        g.stepFixed(1);
      }
      const folded = distances(),
        weight = p.airTricks.tuckWeight;
      for (let i = 0; i < 19; i++) {
        g.stepFixed(1);
      }
      return {
        extended,
        folded,
        weight,
        open: p.airTricks.tuckWeight,
        state: p.fsm.current,
        progress: p.airTricks.flipProgress,
      };
    }, kind);
    assert(flip.weight > 0.95, JSON.stringify(flip));
    assert(
      flip.folded.every((v, i) => v < flip.extended[i] * 0.7),
      `${kind}: ${JSON.stringify(flip)}`,
    );
    assert.equal(flip.open, 0);
    console.log(`OK ${kind} flip tucks both legs and opens`, flip.folded);
  }
  for (const vx of [-4, 0, 4]) {
    await page.keyboard.press('r');
    await stepMs(page, 800);
    await page.keyboard.down('s');
    const grab = await page.evaluate((vx) => {
      const g = window.game,
        p = g.player;
      p.body.setTranslation({ x: -16, y: 2.8, z: -4.9 }, true);
      p.body.setNextKinematicTranslation({ x: -16, y: 2.8, z: -4.9 });
      p.velocity.set(vx, -1, -12);
      p.fsm.transition('AIR');
      p.grounded = false;
      g.physics.step();
      p.airTricks.queueFlip('left');
      p.airTricks.update(0.15);
      let first = null,
        frames = 0,
        maxError = 0;
      for (let i = 0; i < 14; i++) {
        g.stepFixed(1);
        if (p.fsm.current === 'HANG') {
          first ??= {
            active: p.airTricks.active,
            rx: p.mesh.rotation.x,
            rz: p.mesh.rotation.z,
            hands: p.contactPose.activeHands,
          };
          frames++;
          maxError = Math.max(maxError, ...p.contactPose.handErrors);
        }
      }
      return {
        first,
        frames,
        maxError,
        state: p.fsm.current,
        pos: p.body.translation(),
      };
    }, vx);
    await page.keyboard.up('s');
    assert(grab.frames > 3, `fast grab missed: ${JSON.stringify(grab)}`);
    assert.deepEqual(grab.first, { active: false, rx: 0, rz: 0, hands: 2 });
    assert(grab.maxError < 0.025, JSON.stringify(grab));
    console.log(
      'OK fast diagonal grab, contacts from first frame',
      vx,
      grab.maxError,
    );
  }
  assert.deepEqual(errors, []);
  console.log('MOTION FLOW OK');
} finally {
  await browser.close();
}
