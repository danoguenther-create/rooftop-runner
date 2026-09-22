import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
const base = process.argv[2] ?? "http://127.0.0.1:4175/rooftop-runner/";
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium-browser",
  args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
  page.setDefaultTimeout(120000);
  const errors = [],
    requests = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("request", (r) => {
    if (/models/.test(r.url())) requests.push(r.url());
  });
  await page.goto(`${base}?level=city01&play=1`);
  await page.waitForFunction(() => window.game?.state === "PLAYING");
  await page.evaluate(() => {
    const g = window.game;
    g.stepFixed(60);
    g.hintEl.style.display = "none";
  });
  mkdirSync("artifacts/review", { recursive: true });
  await page.screenshot({
    path: "artifacts/review/rooftops.jpg",
    type: "jpeg",
    quality: 80,
  });
  const stats = await page.evaluate(() => {
    const g = window.game;
    return {
      calls: g.renderer.info.render.calls,
      triangles: g.renderer.info.render.triangles,
      clips: g.player.animator.actions.size,
      level: g.level.name,
    };
  });
  for (const [name, pos, look] of [
    ["street", [-45, 3, -37], [-20, 5, -26]],
    ["car", [-67, 2.1, -33], [-65, 1, -35.6]],
    ["coast", [60, 9, 115], [20, 4, 87]],
    ["aerial", [120, 90, 140], [-5, 3, -5]],
  ]) {
    await page.evaluate(
      ({ pos, look }) => {
        const g = window.game;
        g.followCamera.update = () => {};
        g.camera.position.set(...pos);
        g.camera.lookAt(...look);
        g.renderFrame(0);
      },
      { pos, look },
    );
    await page.screenshot({
      path: `artifacts/review/${name}.jpg`,
      type: "jpeg",
      quality: 80,
    });
  }
  const report = { stats, requests, errors };
  writeFileSync(
    "artifacts/review/render-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  if (errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
