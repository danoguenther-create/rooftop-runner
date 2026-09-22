/** Real rig + physics regression: contact anchors and complete obstacle traversal. */
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { step, stepMs, waitForGrounded } from "./harness.mjs";
const base = process.argv[2] ?? "http://127.0.0.1:5173/rooftop-runner/";
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium-browser",
  args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
try {
  await page.goto(`${base}?level=testlevel&play=1`);
  await page.waitForFunction(() => window.game?.player?.animator, null, {
    timeout: 120000,
  });
  await waitForGrounded(page);
  const reset = async () => {
    await page.keyboard.press("r");
    await stepMs(page, 800);
  };
  const teleport = async (x, y, z, vx = 0, vy = 0, vz = 0) =>
    page.evaluate(
      (a) => {
        const p = window.game.player;
        p.body.setTranslation({ x: a[0], y: a[1], z: a[2] }, true);
        p.body.setNextKinematicTranslation({ x: a[0], y: a[1], z: a[2] });
        p.velocity.set(a[3], a[4], a[5]);
      },
      [x, y, z, vx, vy, vz],
    );
  const sample = () =>
    page.evaluate(() => {
      const p = window.game.player;
      return {
        state: p.fsm.current,
        pos: p.body.translation(),
        phase: p.mantleProgress,
        contacts: p.contactPose.activeHands,
        errors: [...p.contactPose.handErrors],
        kind: p.activeVault?.kind,
        progress: p.vaultProgress,
      };
    });
  await page.keyboard.down("s");
  await teleport(-16, 1, -3.5, 0, 0, -6);
  await stepMs(page, 450);
  await page.keyboard.up("s");
  await stepMs(page, 500);
  let s = await sample();
  assert.equal(s.state, "HANG");
  assert.equal(s.contacts, 2);
  assert(Math.max(...s.errors) < 0.025, `hang hands ${s.errors}`);
  console.log("OK real wall climb and two ledge contacts", s.errors);
  await page.keyboard.down("w");
  await step(page, 10);
  await page.keyboard.up("w");
  for (let i = 0; i < 5; i++) {
    s = await sample();
    if (s.phase < 0.55) {
      assert.equal(s.contacts, 2);
      assert(Math.max(...s.errors) < 0.025, `pull-up hands ${s.errors}`);
    }
    await step(page, 5);
  }
  await step(page, 35);
  s = await sample();
  assert.equal(s.state, "RUN");
  assert(s.pos.y > 4.3);
  console.log("OK pull / press / top-out to roof");
  await reset();
  await teleport(-16, 2.1, 8.3, 0, 0, 1);
  await step(page, 12);
  for (let i = 0; i < 6; i++) {
    s = await sample();
    assert.equal(s.state, "SWING");
    assert(Math.max(...s.errors) < 0.025, `bar hands ${s.errors}`);
    await step(page, 4);
  }
  console.log("OK both hands stay on swinging bar");
  // Four ledge orientations, including the reversed edge parameterization.
  for (const axis of ["x", "z"])
    for (const sign of [-1, 1]) {
      await reset();
      await page.evaluate(
        ({ axis, sign }) => {
          const p = window.game.player;
          const face = p.level.topFaces.find(
            (f) => f.cx === -16 && f.y === 3.5,
          );
          p.climb.grab = { face, axis, sign, t: 0 };
          p.fsm.transition("AIR");
          p.fsm.transition("HANG");
          p.velocity.set(0, 0, 0);
        },
        { axis, sign },
      );
      await step(page, 3);
      s = await sample();
      assert(Math.max(...s.errors) < 0.025, `${axis}/${sign} ${s.errors}`);
    }
  console.log("OK ledge contact from all four directions");
  // A narrow hurdle uses a one-handed speed vault, a deep box the same compact one-handed speed vault.
  for (const test of [
    { name: "speed", x: 3, z: -6.9, exit: -8.25 },
    { name: "deep-speed", x: -16, z: 21.7, exit: 17.5 },
  ]) {
    await reset();
    await teleport(test.x, 0.92, test.z, 0, 0, -6);
    // Camera-relative S initially points -Z.
    await page.keyboard.down("s");
    let entered = false,
      kind = null,
      maxProgress = 0,
      final = null,
      maxContact = 0;
    for (let i = 0; i < 110; i++) {
      await step(page, 1);
      const f = await sample();
      if (f.state === "VAULT") {
        entered = true;
        kind = f.kind;
        maxProgress = Math.max(maxProgress, f.progress);
        maxContact = Math.max(maxContact, f.contacts);
      }
      if (entered && f.state === "RUN") {
        final = f;
        break;
      }
    }
    await page.keyboard.up("s");
    assert(entered, `${test.name} entered`);
    assert.equal(kind, "speed");
    assert(maxProgress > 0.95);
    assert(final, `${test.name} lands`);
    assert(
      final.pos.z < test.exit - 0.25,
      `${test.name} clears back edge (${final.pos.z})`,
    );
    assert.equal(maxContact, 1);
    console.log(`OK complete ${test.name} vault`, final.pos);
  }
  assert.deepEqual(errors, []);
  console.log("CONTACT + TRAVERSAL REGRESSION OK");
} finally {
  await browser.close();
}
