import { chromium } from "playwright-core";
import { step, stepMs, waitForGrounded } from "../tests/smoke/harness.mjs";
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium-browser",
  args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await page.goto(
  `${process.argv[2] ?? "http://127.0.0.1:4175/rooftop-runner/"}?level=testlevel&play=1`,
);
await page.waitForFunction(() => window.game?.player?.animator, null, {
  timeout: 120000,
});
await waitForGrounded(page);
await page.evaluate(() => {
  const g=window.game;g.reviewRender=g.renderFrame.bind(g);g.renderFrame=()=>{};
  window.game.hintEl.style.display = "none";
});
async function teleport(x, y, z, vx = 0, vy = 0, vz = 0) {
  await page.evaluate(
    (a) => {
      const p = window.game.player;
      p.body.setTranslation({ x: a[0], y: a[1], z: a[2] }, true);
      p.body.setNextKinematicTranslation({ x: a[0], y: a[1], z: a[2] });
      p.velocity.set(a[3], a[4], a[5]);
    },
    [x, y, z, vx, vy, vz],
  );
}
async function state() {
  return page.evaluate(() => {
    const p = window.game.player;
    return {
      state: p.fsm.current,
      position: p.body.translation(),
      mantle: p.mantleProgress,
      vault: p.vaultProgress,
      kind: p.activeVault?.kind,
      contacts: p.contactPose.activeHands,
      errors: p.contactPose.handErrors,
      targets: p.contactPose.handTargets.map((v) => v.toArray()),
    };
  });
}
async function shot(name) {
  await page.evaluate((name) => {
    const g = window.game,
      p = g.player.body.translation();
    g.followCamera.update = () => {};
    g.camera.position.set(p.x + (name === "wallrun" ? -0.8 : 4), p.y + 1.4, p.z + (name === "wallrun" ? -3 : 3));
    g.camera.lookAt(p.x, p.y + 0.3, p.z);
    g.reviewRender(0);
  }, name);
  await page.screenshot({
    type: "jpeg",
    quality: 80,
    path: `artifacts/review/${name}.jpg`,
  });
}
await page.keyboard.down("s");
await teleport(-16, 1, -3.5, 0, 0, -6);
await stepMs(page, 450);
await page.keyboard.up("s");
await stepMs(page, 500);
console.log("HANG", JSON.stringify(await state()));
await shot("hang");
await page.keyboard.down("w");
await step(page, 16);
await page.keyboard.up("w");
console.log("MANTLE", JSON.stringify(await state()));
await shot("mantle");
await step(page, 14);
console.log("MANTLE2", JSON.stringify(await state()));
await shot("mantle-top");
await step(page, 35);
console.log("TOP", JSON.stringify(await state()));
await page.keyboard.press("r");
await stepMs(page, 800);
await teleport(-16, 2.1, 8.3, 0, 0, 1);
await step(page, 12);
console.log("SWING", JSON.stringify(await state()));
await shot("swing");
await page.keyboard.press("r");
await stepMs(page, 800);
// Print level obstacles to derive a real vault test from schema.
await teleport(3, 0.92, -6.9, 0, 0, -6);
await page.keyboard.down("s");
for (let i = 0; i < 40; i++) {
  await step(page, 1);
  if ((await state()).state === "VAULT") break;
}
await step(page, 9);
await shot("speed-vault");
await step(page, 12);
await shot("vault-landing");
await page.keyboard.up("s");
await page.keyboard.press("r");
await stepMs(page,800);
await teleport(-8.7,2.5,-1,0,0,7);
await page.keyboard.down("w");
await step(page,18);
await page.keyboard.up("w");
console.log("WALLRUN",JSON.stringify(await state()));
await shot("wallrun");
console.log(
  "FACES",
  JSON.stringify(
    await page.evaluate(() =>
      window.game.level.topFaces.filter((f) => f.y >= 0.5 && f.y <= 1.2),
    ),
  ),
);
console.log("ERRORS", JSON.stringify(errors));
await browser.close();
