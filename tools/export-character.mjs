/** Run against the Vite development server. Rebuilds the optimized GLB from source FBX. */
import { chromium } from "playwright-core";
import { writeFileSync, mkdirSync } from "node:fs";
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium-browser",
  args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage();
  page.on("console", (m) => console.log(m.text()));
  await page.goto("http://127.0.0.1:5173/rooftop-runner/?nochar=1");
  const result = await page.evaluate(async () => {
    const THREE = await import(
      "/rooftop-runner/node_modules/three/build/three.module.js"
    );
    if (window.game) window.game.renderFrame = () => {};
    const { loadFBXCharacter } = await import(
      "/rooftop-runner/src/core/AssetLoader.ts"
    );
    const { GLTFExporter } = await import(
      "/rooftop-runner/node_modules/three/examples/jsm/exporters/GLTFExporter.js"
    );
    const assets = await loadFBXCharacter();
    // FBX geometry resolves before its embedded texture image decodes.
    const images = [];
    assets.model.traverse((o) => {
      if (o.isMesh)
        for (const m of Array.isArray(o.material) ? o.material : [o.material])
          for (const value of Object.values(m))
            if (value?.isTexture && value.image?.decode)
              images.push(value.image.decode());
    });
    await Promise.all(images);
    const textures = [];
    assets.model.traverse((o) => {
      if (o.isMesh)
        for (const m of Array.isArray(o.material) ? o.material : [o.material])
          for (const [key, value] of Object.entries(m))
            if (value?.isTexture)
              textures.push({ material: m.name, key, value });
    });
    for (let i = 0; i < 100 && textures.some((t) => !t.value.image); i++)
      await new Promise((r) => setTimeout(r, 100));
    console.log(
      "TEXTURES",
      JSON.stringify(
        textures.map((t) => ({
          material: t.material,
          key: t.key,
          type: t.value.image?.constructor?.name,
          width: t.value.image?.width,
        })),
      ),
    );
    assets.model.traverse((o) => {
      if (!o.isMesh) return;
      const convert = (m) => {
        let map = m.map;
        if (m.alphaMap && map) {
          const c = document.createElement("canvas");
          c.width = c.height = 1024;
          const ctx = c.getContext("2d");
          ctx.drawImage(map.image, 0, 0, 1024, 1024);
          const rgb = ctx.getImageData(0, 0, 1024, 1024);
          ctx.drawImage(m.alphaMap.image, 0, 0, 1024, 1024);
          const alpha = ctx.getImageData(0, 0, 1024, 1024);
          for (let i = 0; i < rgb.data.length; i += 4)
            rgb.data[i + 3] = alpha.data[i + 1];
          ctx.putImageData(rgb, 0, 0);
          map = new THREE.CanvasTexture(c);
          map.colorSpace = THREE.SRGBColorSpace;
          map.flipY = m.map.flipY;
        } else if (map) map.userData.mimeType = "image/jpeg";
        return new THREE.MeshStandardMaterial({
          name: m.name,
          map,
          normalMap: m.normalMap,
          color: m.color,
          roughness: 0.84,
          metalness: 0,
          transparent: m.transparent,
          alphaTest: m.alphaMap ? 0.01 : 0,
          side: m.side,
        });
      };
      o.material = Array.isArray(o.material)
        ? o.material.map(convert)
        : convert(o.material);
    });
    const clips = [...assets.clips.values()];
    for (const clip of clips) clip.optimize();
    const info = clips.map((c) => ({
      name: c.name,
      duration: c.duration,
      tracks: c.tracks.length,
    }));
    const buffer = await new GLTFExporter().parseAsync(assets.model, {
      binary: true,
      animations: clips,
      maxTextureSize: 1024,
      onlyVisible: false,
    });
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 32768)
      binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return { base64: btoa(binary), info };
  });
  mkdirSync("public/models/optimized", { recursive: true });
  writeFileSync(
    "public/models/optimized/runner.glb",
    Buffer.from(result.base64, "base64"),
  );
  console.log(JSON.stringify(result.info, null, 2));
  console.log("GLB bytes", Buffer.from(result.base64, "base64").length);
} finally {
  await browser.close();
}
