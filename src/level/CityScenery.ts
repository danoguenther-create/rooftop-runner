import * as THREE from "three";
import { surfaceFinish } from "./SurfaceFinish";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { LevelData, BoxData, RailData } from "./levelTypes";

type Scenery = NonNullable<LevelData["scenery"]>;
/** Static dressing is merged by material; gameplay surfaces remain in the level schema. */
export function buildCityScenery(
  data: Scenery,
  rails: RailData[],
  boxes: BoxData[],
): THREE.Group {
  const root = new THREE.Group();
  root.name = "Palm Quay architectural details";
  const batches = new Map<
    string,
    { material: THREE.MeshStandardMaterial; parts: THREE.BufferGeometry[] }
  >();
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  function material(color: string, metal = 0, rough = 0.8) {
    const key = `${color}/${metal}/${rough}`;
    let m = materials.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color,
        metalness: metal,
        roughness: rough,
      });
      if (metal < 0.2) surfaceFinish(m, "plaster");
      materials.set(key, m);
    }
    return m;
  }
  const cream = material("#e8dfcc");
  const dark = material("#263b40", 0.5, 0.36);
  const glass = material("#6a99a7", 0.45, 0.19);
  const trim = material("#72958e", 0.3, 0.42);
  const rubber = material("#171d21", 0, 0.95);
  const chrome = material("#a9b7ba", 0.8, 0.25);
  const wood = material("#896f50");
  function add(
    g: THREE.BufferGeometry,
    mat: THREE.MeshStandardMaterial,
    x: number,
    y: number,
    z: number,
    rx = 0,
    ry = 0,
    rz = 0,
  ) {
    // Merge requires a consistent attribute layout (all primitives include these).
    g.deleteAttribute("uv");
    if (!g.index)
      g.setIndex(
        Array.from({ length: g.getAttribute("position").count }, (_, i) => i),
      );
    g.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(x, y, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
        new THREE.Vector3(1, 1, 1),
      ),
    );
    const colors = new Float32Array(g.getAttribute("position").count * 3);
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = mat.color.r;
      colors[i + 1] = mat.color.g;
      colors[i + 2] = mat.color.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const key = [
      mat.metalness,
      mat.roughness,
      mat.side,
      mat.emissive.getHex(),
      mat.emissiveIntensity,
      mat.customProgramCacheKey(),
    ].join("/");
    let b = batches.get(key);
    if (!b) {
      const shared = mat.clone();
      shared.color.set(0xffffff);
      shared.vertexColors = true;
      shared.onBeforeCompile = mat.onBeforeCompile;
      shared.customProgramCacheKey = mat.customProgramCacheKey;
      b = { material: shared, parts: [] };
      batches.set(key, b);
    }
    b.parts.push(g);
  }
  function box(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat: THREE.MeshStandardMaterial,
    round = 0,
  ) {
    add(
      round
        ? new RoundedBoxGeometry(
            w,
            h,
            d,
            2,
            Math.min(round, w / 3, h / 3, d / 3),
          )
        : new THREE.BoxGeometry(w, h, d),
      mat,
      x,
      y,
      z,
    );
  }
  function rod(
    a: THREE.Vector3,
    b: THREE.Vector3,
    r: number,
    mat: THREE.MeshStandardMaterial,
    r2 = r,
  ) {
    const dir = b.clone().sub(a),
      mid = a.clone().add(b).multiplyScalar(0.5);
    const g = new THREE.CylinderGeometry(r2, r, dir.length(), 8);
    g.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        dir.normalize(),
      ),
    );
    add(g, mat, mid.x, mid.y, mid.z);
  }
  const names = [
    "PALM HOUSE",
    "OCEAN SOCIAL",
    "MARINA STUDIOS",
    "THE COLLINS",
    "QUAY MARKET",
    "SUNSET HOTEL",
    "LA COSTA",
    "ATELIER 08",
  ];
  const signs: {
    x: number;
    y: number;
    z: number;
    text: string;
    color: string;
    side: number;
    w: number;
    h: number;
  }[] = [];
  function sign(
    x: number,
    y: number,
    z: number,
    text: string,
    color = "#164b50",
    side = 1,
    w = 4,
    h = 0.7,
  ) {
    signs.push({ x, y, z, text, color, side, w, h });
  }
  data.buildings.forEach((b, index) => {
    const { x, z, width: w, depth: d, height: h, variant: v } = b;
    const accent = material(
      ["#799e97", "#b78169", "#7e949f", "#b0a782"][v],
      0.12,
      0.65,
    );
    // Coping, pronounced cornices, horizontal floor bands, pilasters.
    for (const side of [-1, 1]) {
      const front = z + side * (d / 2 + 0.06);
      box(x, h - 0.12, front, w + 0.2, 0.22, 0.28, cream);
      box(x, 3.05, front, w, 0.22, 0.48, accent);
      for (let y = 6.25; y < h - 0.4; y += 3.2)
        box(x, y, front, w, 0.11, 0.24, cream);
      for (const dx of [-w / 2 + 0.18, w / 2 - 0.18])
        box(x + dx, h / 2, front, 0.3, h, 0.22, cream);
      // Projecting vertical blades make each Art Deco block legible in silhouette.
      if (v === 0 || v === 3)
        for (const dx of [-0.7, 0, 0.7])
          box(x + dx, h - 1.2, front, 0.22, 3.2, 0.3, accent);
      const bays = Math.floor((w - 1) / 2.8);
      for (let k = 0; k < bays; k++) {
        const wx = x + (k - (bays - 1) / 2) * 2.8;
        // Ground floor glazing with real mullions, entrance and canopy.
        box(wx, 1.53, front + side * 0.06, 2.25, 2.55, 0.13, glass);
        box(wx - 1.15, 1.5, front + side * 0.15, 0.09, 2.8, 0.15, dark);
        box(wx + 1.15, 1.5, front + side * 0.15, 0.09, 2.8, 0.15, dark);
        box(wx, 2.2, front + side * 0.15, 2.3, 0.065, 0.15, dark);
        if (side !== b.stairSide)
          box(wx, 2.87, front + side * 0.5, 2.5, 0.13, 1.05, accent);
        for (let y = 4.7; y < h - 1; y += 3.2) {
          box(wx, y, front + side * 0.035, 1.58, 1.86, 0.1, dark);
          box(wx, y, front + side * 0.1, 1.4, 1.7, 0.08, glass);
          box(wx, y, front + side * 0.17, 0.055, 1.74, 0.1, cream);
          box(wx, y - 0.95, front + side * 0.18, 1.9, 0.12, 0.38, cream);
          if (v === 1 && k % 2 === 0 && side !== b.stairSide) {
            // Deep balcony slabs + open railings, not a solid decorative wall.
            box(wx, y - 0.98, front + side * 0.58, 2.25, 0.16, 1.2, cream);
            box(wx, y - 0.22, front + side * 1.13, 2.22, 0.065, 0.065, dark);
            for (let q = -1; q <= 1; q += 0.25)
              box(
                wx + q,
                y - 0.6,
                front + side * 1.13,
                0.035,
                0.76,
                0.035,
                dark,
              );
          }
          if (v === 2)
            box(wx, y + 1.0, front + side * 0.38, 2.1, 0.12, 0.85, accent);
        }
      }
      if (side === 1)
        sign(
          x,
          2.45,
          front + 0.72,
          names[index % names.length],
          v === 1 ? "#733f36" : "#164b50",
          1,
          Math.min(w - 1, 6),
          0.68,
        );
    }
    if (v === 0) {
      for (let k = 0; k < 3; k++)
        box(
          x,
          h + 0.2 + k * 0.27,
          z + d / 2 - 0.15,
          3.2 - k * 0.7,
          0.28,
          0.42,
          cream,
        );
      for (const side of [-1, 1])
        add(
          new THREE.CylinderGeometry(0.28, 0.28, h, 12),
          cream,
          x + side * (w / 2 - 0.15),
          h / 2,
          z + d / 2 - 0.1,
        );
    }
    // Narrow side elevations: independent bays, deep reveals and horizontal coping.
    for (const side of [-1, 1]) {
      const sideX = x + side * (w / 2 + 0.04);
      box(sideX, h - 0.12, z, 0.25, 0.22, d, cream);
      for (let wz = z - d / 2 + 1.5; wz < z + d / 2 - 1; wz += 2.8)
        for (let y = 1.5; y < h - 1; y += 3.2) {
          box(sideX, y, wz, 0.1, 1.95, 1.65, dark);
          box(sideX + side * 0.065, y, wz, 0.055, 1.78, 1.48, glass);
          box(sideX + side * 0.1, y, wz, 0.08, 1.8, 0.055, cream);
          box(sideX + side * 0.15, y - 1, wz, 0.4, 0.1, 1.9, cream);
        }
    }
    // Roof gravel panels, service ducting, solar arrays; keep central running corridor clear.
    for (const side of [-1, 1]) {
      box(x + side * (w / 2 - 0.12), h - 0.1, z, 0.24, 0.2, d, cream);
      box(
        x + side * (w / 2 - 1.2),
        h + 0.012,
        z,
        1.65,
        0.022,
        d - 1.0,
        material("#8e9996"),
      );
    }
    if (index % 3 === 0) {
      const px = x - w * 0.27,
        pz = z - d * 0.3;
      box(px, h + 0.12, pz, 2.8, 0.24, 1.5, dark);
      box(px, h + 0.25, pz, 2.65, 0.03, 1.4, material("#233f58", 0.5, 0.23));
      for (let k = -2; k <= 2; k++)
        box(px + k * 0.48, h + 0.275, pz, 0.02, 0.025, 1.4, chrome);
      box(px, h + 0.275, pz, 2.65, 0.025, 0.02, chrome);
    }
    if (
      [
        [0, 1],
        [0, 4],
        [1, 2],
        [1, 3],
        [1, 5],
        [2, 1],
        [2, 3],
        [3, 2],
        [3, 4],
        [3, 6],
      ].some(([r, i]) => r * 8 + i === index)
    ) {
      for (let k = 0; k < 9; k++)
        box(x, h + 0.16 + k * 0.072, z + 2.31, 2.15, 0.035, 0.025, dark);
      for (const dx of [-0.7, 0.7]) {
        add(
          new THREE.CylinderGeometry(0.25, 0.25, 0.035, 16),
          dark,
          x + dx,
          h + 0.918,
          z + 2,
        );
        for (let k = -2; k <= 2; k++)
          box(x + dx + k * 0.08, h + 0.94, z + 2, 0.016, 0.015, 0.4, chrome);
      }
    }
    // Exterior rainwater stacks articulate side elevations without affecting roof jumps.
    for (const side of [-1, 1])
      rod(
        new THREE.Vector3(x + side * (w / 2 + 0.09), 0.3, z + d * 0.3),
        new THREE.Vector3(x + side * (w / 2 + 0.09), h - 0.2, z + d * 0.3),
        0.045,
        trim,
      );
  });
  // Support every parkour rail at its endpoints with a steel post.
  for (const rail of rails)
    for (const point of [rail.points[0], rail.points[rail.points.length - 1]]) {
      const [x, y, z] = point;
      let ground = 0;
      for (const b of boxes) {
        if (b.solid === false || b.rotY) continue;
        const top = b.pos[1] + b.size[1] / 2;
        if (
          top < y - 0.12 &&
          Math.abs(x - b.pos[0]) <= b.size[0] / 2 &&
          Math.abs(z - b.pos[2]) <= b.size[2] / 2
        )
          ground = Math.max(ground, top);
      }
      if (y - ground > 0.2) {
        rod(
          new THREE.Vector3(x, ground, z),
          new THREE.Vector3(x, y, z),
          0.045,
          dark,
        );
        box(x, ground + 0.025, z, 0.25, 0.05, 0.25, dark);
      }
    }
  data.cars.forEach(({ x, z, color }, index) => {
    const paint = material(color, 0.45, 0.38);
    box(x, 0.71, z, 4.4, 0.76, 1.9, paint, 0.1);
    const cabin = new THREE.Shape();
    cabin.moveTo(-1.4, 1.04);
    cabin.lineTo(-0.9, 1.6);
    cabin.lineTo(0.5, 1.6);
    cabin.lineTo(1.05, 1.04);
    cabin.closePath();
    const cabinGeometry = new THREE.ExtrudeGeometry(cabin, {
      depth: 1.56,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.035,
      bevelThickness: 0.035,
    });
    cabinGeometry.translate(0, 0, -0.78);
    add(cabinGeometry, glass, x, 0, z);
    box(x - 0.2, 1.63, z, 1.5, 0.08, 1.65, paint, 0.04);
    // Pillars and door sills preserve glass reflections.
    for (const side of [-1, 1]) {
      box(x - 0.1, 1.24, z + side * 0.84, 0.1, 0.64, 0.09, paint);
      box(x, 0.88, z + side * 0.96, 3.5, 0.04, 0.035, chrome);
      for (const dx of [-0.65, 0.75])
        box(x + dx, 0.99, z + side * 0.96, 0.22, 0.045, 0.035, chrome, 0.02);
      box(x + 0.8, 1.17, z + side * 1.0, 0.3, 0.14, 0.22, paint, 0.05);
      for (const dx of [-1.42, 1.4]) {
        add(
          new THREE.CylinderGeometry(0.36, 0.36, 0.2, 20),
          rubber,
          x + dx,
          0.38,
          z + side * 0.94,
          Math.PI / 2,
        );
        add(
          new THREE.CylinderGeometry(0.23, 0.23, 0.215, 12),
          chrome,
          x + dx,
          0.38,
          z + side * 0.95,
          Math.PI / 2,
        );
        add(
          new THREE.CylinderGeometry(0.11, 0.11, 0.22, 12),
          dark,
          x + dx,
          0.38,
          z + side * 0.96,
          Math.PI / 2,
        );
      }
      box(
        x + 2.18,
        0.82,
        z + side * 0.58,
        0.06,
        0.18,
        0.48,
        material("#f2ead0", 0.3, 0.2),
        0.02,
      );
      box(
        x - 2.18,
        0.82,
        z + side * 0.6,
        0.06,
        0.15,
        0.46,
        material("#a13628", 0.3, 0.25),
        0.02,
      );
    }
    box(x + 2.21, 0.57, z, 0.03, 0.22, 0.84, dark);
    box(x - 2.21, 0.6, z, 0.035, 0.16, 0.42, cream);
    if (index % 4 === 0) box(x - 0.25, 1.72, z, 1.3, 0.09, 1.3, chrome, 0.04);
  });
  data.lamps.forEach(({ x, z, side }) => {
    rod(
      new THREE.Vector3(x, 0.05, z),
      new THREE.Vector3(x, 5.4, z),
      0.075,
      dark,
      0.045,
    );
    add(new THREE.CylinderGeometry(0.13, 0.2, 0.3, 12), dark, x, 0.15, z);
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, 5.15, z),
      new THREE.Vector3(x, 5.55, z - side * 0.4),
      new THREE.Vector3(x, 5.55, z - side * 1.5),
    ]);
    add(new THREE.TubeGeometry(path, 10, 0.045, 6, false), dark, 0, 0, 0);
    box(x, 5.5, z - side * 1.5, 0.36, 0.15, 0.75, dark, 0.07);
    const light = material("#ffdf9e", 0.1, 0.4);
    light.emissive.set("#ffcb7b");
    light.emissiveIntensity = 0.65;
    box(x, 5.42, z - side * 1.5, 0.28, 0.025, 0.58, light);
  });
  data.trees.forEach(({ x, z, scale: s, palm }, i) => {
    if (palm) {
      const height = (6 + (i % 3) * 0.45) * s;
      const trunk = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x, 0, z),
        new THREE.Vector3(x + 0.15 * s, height * 0.5, z),
        new THREE.Vector3(x + 0.65 * s, height, z + 0.2 * s),
      ]);
      add(new THREE.TubeGeometry(trunk, 12, 0.16 * s, 9, false), wood, 0, 0, 0);
      for (let k = 0; k < 16; k++)
        add(
          new THREE.TorusGeometry(0.16 * s, 0.014 * s, 4, 9),
          material("#625945"),
          x + (0.65 * s * k) / 16,
          (height * k) / 16,
          z + (0.2 * s * k) / 16,
          Math.PI / 2,
        );
      const top = new THREE.Vector3(x + 0.65 * s, height, z + 0.2 * s);
      for (let f = 0; f < 10; f++) {
        const angle = f * Math.PI * 0.2 + i,
          len = (2.8 + (f % 3) * 0.28) * s;
        const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
        const pts = [
          top.clone(),
          top
            .clone()
            .addScaledVector(dir, len * 0.3)
            .add(new THREE.Vector3(0, 0.75 * s, 0)),
          top
            .clone()
            .addScaledVector(dir, len * 0.7)
            .add(new THREE.Vector3(0, 0.25 * s, 0)),
          top
            .clone()
            .addScaledVector(dir, len)
            .add(new THREE.Vector3(0, -0.75 * s, 0)),
        ];
        const curve = new THREE.CatmullRomCurve3(pts);
        add(
          new THREE.TubeGeometry(curve, 9, 0.027 * s, 4, false),
          trim,
          0,
          0,
          0,
        );
        const positions: number[] = [];
        const perp = new THREE.Vector3(-dir.z, 0, dir.x);
        for (let k = 1; k < 22; k++) {
          const t = k / 23,
            p = curve.getPoint(t),
            width = Math.sin(t * Math.PI) * 0.6 * s;
          for (const side of [-1, 1]) {
            const end = p
              .clone()
              .addScaledVector(perp, side * width)
              .addScaledVector(dir, 0.28 * s)
              .add(new THREE.Vector3(0, -0.16 * s, 0));
            const next = curve.getPoint(Math.min(1, t + 0.06));
            positions.push(...p.toArray(), ...end.toArray(), ...next.toArray());
            const end2 = end.clone().addScaledVector(dir, 0.18 * s);
            positions.push(
              ...end.toArray(),
              ...end2.toArray(),
              ...next.toArray(),
            );
          }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(positions, 3),
        );
        g.computeVertexNormals();
        const leaf = material(["#42725a", "#557a48", "#68864d"][f % 3]);
        leaf.side = THREE.DoubleSide;
        // Standardize indexed layout for merge.
        g.setIndex(Array.from({ length: positions.length / 3 }, (_, j) => j));
        add(g, leaf, 0, 0, 0);
      }
    } else {
      rod(
        new THREE.Vector3(x, 0.8, z),
        new THREE.Vector3(x, 3.7 * s, z),
        0.16,
        wood,
        0.08,
      );
      for (let k = 0; k < 7; k++) {
        const a = k * 2.4;
        const xx = x + Math.cos(a) * s,
          zz = z + Math.sin(a) * s,
          yy = 3.7 * s + (k % 3) * 0.4;
        rod(
          new THREE.Vector3(x, 2 * s, z),
          new THREE.Vector3(xx, yy, zz),
          0.08,
          wood,
          0.025,
        );
        const g = new THREE.IcosahedronGeometry(1.1 * s, 2);
        g.scale(1, 0.85, 1);
        add(g, material(["#42654e", "#5b7b50", "#698454"][k % 3]), xx, yy, zz);
      }
    }
  });
  for (const s of data.signs) sign(s.x, s.y, s.z, s.text, s.color, -1, 6, 1);
  // One texture atlas and draw call for all shopfront / route signs.
  const labels = [...new Set(signs.map((s) => s.text + "|" + s.color))];
  const c = document.createElement("canvas");
  c.width = 2048;
  c.height = 2048;
  const ctx = c.getContext("2d")!;
  labels.forEach((label, i) => {
    const [text, color] = label.split("|"),
      x = (i % 2) * 1024,
      y = Math.floor(i / 2) * 192;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 1024, 192);
    ctx.strokeStyle = "#c8bb92";
    ctx.lineWidth = 5;
    ctx.strokeRect(x + 12, y + 12, 1000, 168);
    ctx.fillStyle = "#f4edda";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "600 64px sans-serif";
    ctx.fillText(text, x + 512, y + 100, 940);
  });
  const signParts = signs.map((s) => {
    const i = labels.indexOf(s.text + "|" + s.color),
      u = (i % 2) * 0.5,
      v = (Math.floor(i / 2) * 192) / 2048;
    const g = new THREE.PlaneGeometry(s.w, s.h),
      uv = g.getAttribute("uv");
    for (let j = 0; j < uv.count; j++)
      uv.setXY(
        j,
        u + uv.getX(j) * 0.5,
        1 - v - ((1 - uv.getY(j)) * 192) / 2048,
      );
    g.rotateY(s.side < 0 ? Math.PI : 0);
    g.translate(s.x, s.y, s.z);
    return g;
  });
  const atlas = new THREE.CanvasTexture(c);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;
  const signMesh = new THREE.Mesh(
    mergeGeometries(signParts, false)!,
    new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.7 }),
  );
  signMesh.receiveShadow = true;
  root.add(signMesh);
  for (const g of signParts) g.dispose();
  // Coastal water and beach beyond the playable boardwalk.
  box(8, -0.22, 142, 420, 0.16, 44, material("#cbbb95"));
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(1800, 1300),
    new THREE.MeshStandardMaterial({
      color: "#327f89",
      roughness: 0.24,
      metalness: 0.45,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(8, -0.32, 804);
  root.add(water);
  for (let k = 0; k < 13; k++)
    box(8, -0.2, 165 + k * 5, 390, 0.012, 0.12, material("#86b7ad", 0.3, 0.4));
  for (const { material: mat, parts } of batches.values()) {
    const merged = mergeGeometries(parts, false);
    for (const g of parts) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  return root;
}
