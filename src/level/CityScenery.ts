import * as THREE from "three";
import { surfaceFinish } from "./SurfaceFinish";
import { cityPBRReady, type CitySurface } from "./CityPBR";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { LevelData, BoxData, RailData } from "./levelTypes";

type Scenery = NonNullable<LevelData["scenery"]>;
/** Static dressing is merged by material; gameplay surfaces remain in the level schema. */
export function buildCityScenery(
  data: Scenery,
  rails: RailData[],
  boxes: BoxData[],
  physics?: {
    box: (pos: [number, number, number], size: [number, number, number], rotation?: THREE.Quaternion) => void;
    rail: (points: THREE.Vector3[]) => void;
  },
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
      if (cityPBRReady()) {
        const foliage=['#42725a','#557a48','#68864d','#42654e','#5b7b50','#698454'].includes(color);
        const kind: CitySurface=foliage?'foliage':color==='#896f50'||color==='#625945'?'wood':color==='#cbbb95'?'sand':metal>=.2?'metal':'plaster';
        // Glazing and polished car paint keep their clean reflection response.
        if (rough >= .4 || metal < .2) surfaceFinish(m,kind);
      } else if (metal < 0.2) surfaceFinish(m, "plaster");
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
    if (!g.getAttribute('uv')) g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count*2),2));
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
    physics?.box([x, y, z], [w, h, d]);
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
    if (r >= 0.04) physics?.box(mid.toArray(), [r*2, dir.length(), r*2],
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),dir.clone().normalize()));
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
    // West bank houses (tools/west-bank.mjs): homes get house windows and a
    // front door instead of a shopfront, and none of the old grid's roof kit.
    const grid = !b.kind;
    const home = b.kind === "villa" || b.kind === "townhouse" || b.kind === "lone";
    const entranceSide = b.stairSide === 1 ? -1 : 1;
    // Enterable houses: the few open windows and doors have no glass, and the
    // roof dressing leaves the stair hatch free (see tools/city-interiors.mjs).
    const interior = b.interior;
    const opening = (face: "x" | "z", side: number, u: number, row: number) =>
      interior?.openings.find((o) => !o.door && o.face === face && o.side === side && Math.abs(o.u - u) < 0.05 && Math.abs(o.row - row) < 0.05);
    const door = (side: number, u: number) =>
      interior?.openings.find((o) => o.door && o.side === side && Math.abs(o.u - u) < 0.05);
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
      // Not where a sloped street rail lands: the 48 cm slots wedged its riders.
      const railLanding = rails.some((r) =>
        r.points.some(([px, py, pz]) => Math.abs(px - x) < 2 && Math.abs(pz - front) < 1.5 && py > h - 1));
      if ((v === 0 || v === 3) && !railLanding)
        for (const dx of [-0.7, 0, 0.7])
          box(x + dx, h - 1.2, front, 0.22, 3.2, 0.3, accent);
      const bays = Math.floor((w - 1) / 2.8);
      for (let k = 0; k < bays; k++) {
        const wx = x + (k - (bays - 1) / 2) * 2.8;
        // Ground floor glazing with real mullions, entrance and canopy.
        const unlocked = door(side, wx);
        const entrance = home && side === entranceSide && k === Math.floor(bays / 2);
        if (home && !unlocked) {
          if (entrance) {
            // Closed front door with a canopy over it.
            box(wx, 1.25, front + side * 0.04, 1.3, 2.5, 0.1, wood);
            box(wx, 2.6, front + side * 0.06, 1.6, 0.12, 0.16, dark);
            box(wx, 2.87, front + side * 0.5, 2.2, 0.13, 1.05, accent);
          } else {
            box(wx, 1.6, front + side * 0.035, 1.58, 1.86, 0.1, dark);
            box(wx, 1.6, front + side * 0.1, 1.4, 1.7, 0.08, glass);
            box(wx, 1.6, front + side * 0.17, 0.055, 1.74, 0.1, cream);
          }
        }
        if (!home && !unlocked) box(wx, 1.53, front + side * 0.06, 2.25, 2.55, 0.13, glass);
        if (!home) {
          box(wx - 1.15, 1.5, front + side * 0.15, 0.09, 2.8, 0.15, dark);
          box(wx + 1.15, 1.5, front + side * 0.15, 0.09, 2.8, 0.15, dark);
        }
        if (!home && !unlocked) box(wx, 2.2, front + side * 0.15, 2.3, 0.065, 0.15, dark);
        else if (unlocked) {
          // The rare unlocked door: lintel and a leaf swung into the shop.
          box(wx, 2.52, front + side * 0.1, 1.6, 0.1, 0.2, dark);
          box(wx - 0.74, 1.25, z + side * (d / 2 - 0.8), 0.05, 2.3, 0.95, wood);
        }
        if (side !== b.stairSide && !home)
          box(wx, 2.87, front + side * 0.5, 2.5, 0.13, 1.05, accent);
        for (let y = 4.7; y < h - 1; y += 3.2) {
          const open = opening("z", side, wx, y);
          if (open) {
            const v0 = open.floor + 0.5, v1 = open.top ?? open.floor + 2.55, mid = (v0 + v1) / 2;
            for (const dx of [-0.8, 0.8]) box(wx + dx, mid, front + side * 0.035, 0.09, v1 - v0 + 0.1, 0.1, dark);
            box(wx, v1 + 0.05, front + side * 0.035, 1.69, 0.1, 0.1, dark);
            box(wx - 0.82, mid, z + side * (d / 2 - 0.63), 0.04, v1 - v0 - 0.1, 0.66, glass);
          } else if (b.look === "glass") {
            // Floor-to-floor glazing: the glass house reads as one curtain wall.
            box(wx, y + 0.1, front + side * 0.035, 2.62, 2.75, 0.1, dark);
            box(wx, y + 0.1, front + side * 0.1, 2.5, 2.62, 0.08, glass);
          } else {
            box(wx, y, front + side * 0.035, 1.58, 1.86, 0.1, dark);
            box(wx, y, front + side * 0.1, 1.4, 1.7, 0.08, glass);
            box(wx, y, front + side * 0.17, 0.055, 1.74, 0.1, cream);
          }
          if (side !== b.stairSide) box(wx, y - 0.95, front + side * 0.56, 1.9, 0.12, 1.15, cream);
          if (v === 1 && k % 2 === 0 && side !== b.stairSide) {
            // Deep balcony slabs + open railings, not a solid decorative wall.
            box(wx, y - 0.98, front + side * 0.58, 2.25, 0.16, 1.2, cream);
            box(wx, y - 0.22, front + side * 1.13, 2.22, 0.065, 0.065, dark);
            // Balcony coping is a handhold, never an automatic balance capture.
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
          // Over an open window the hood sits higher: headroom on the sill.
          if (v === 2 && side !== b.stairSide)
            box(wx, y + (open ? 1.25 : 1.0), front + side * 0.38, 2.1, 0.12, 0.85, accent);
        }
      }
      if (side === 1 && (grid || b.sign))
        sign(
          x,
          2.45,
          front + 0.72,
          b.sign ?? names[index % names.length],
          v === 1 ? "#733f36" : "#164b50",
          1,
          Math.min(w - 1, 6),
          0.68,
        );
    }
    // Stepped gable over the townhouse front: three more steps to climb.
    if (b.kind === "townhouse")
      for (let k = 0; k < 3; k++)
        box(x, h + 0.35 + k * 0.7, z + d / 2 - 0.2, w * (0.78 - k * 0.24), 0.7, 0.4, cream);
    if (grid && index % 8 === 2) {
      const rz=z+d/2+2.1;
      const a=new THREE.Vector3(x-3,1.25,rz), b=new THREE.Vector3(x+3,1.25,rz);
      rod(a,b,.05,dark);
      for(const xx of [x-3,x,x+3]) rod(new THREE.Vector3(xx,.05,rz),new THREE.Vector3(xx,1.25,rz),.045,dark);
      physics?.rail([a,b]);
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
          // Centred on the outer wall face: houses are hollow, keep the room clear.
          x + side * (w / 2 - 0.02),
          h / 2,
          z + d / 2 + 0.02,
        );
    }
    // Narrow side elevations: independent bays, deep reveals and horizontal coping.
    for (const side of [-1, 1]) {
      const sideX = x + side * (w / 2 + 0.04);
      // Keep fire-escape alleys clear: deep opposing sills used to form low ceilings.
      const narrowAlley=data.buildings.some(other=>other!==b&&Math.abs(other.z-z)<(other.depth+d)/2&&
        (other.x-side*other.width/2-sideX)*side>0&&(other.x-side*other.width/2-sideX)*side<3);
      const sillDepth=narrowAlley?.32:.9;
      // An infill against this side hides its lower windows (and would trap their sills inside).
      const cover=data.infills?.find(f=>Math.abs(f.z-z)<1&&sideX>f.x-f.width/2-.1&&sideX<f.x+f.width/2+.1);
      box(sideX, h - 0.12, z, 0.25, 0.22, d, cream);
      for (let wz = z - d / 2 + 1.5; wz < z + d / 2 - 1; wz += 2.8)
        for (let y = 1.5; y < h - 1; y += 3.2) {
          if (cover && y - 1 < cover.height) continue;
          const open = y > 3 ? opening("x", side, +wz.toFixed(4), y) : undefined;
          if (open) {
            const v0 = open.floor + 0.5, v1 = open.top ?? open.floor + 2.55, mid = (v0 + v1) / 2;
            for (const dz of [-0.8, 0.8]) box(sideX, mid, wz + dz, 0.1, v1 - v0 + 0.1, 0.09, dark);
            box(sideX, v1 + 0.05, wz, 0.1, 0.1, 1.69, dark);
            box(x + side * (w / 2 - 0.63), mid, wz - 0.82, 0.66, v1 - v0 - 0.1, 0.04, glass);
          } else {
            box(sideX, y, wz, 0.1, 1.95, 1.65, dark);
            box(sideX + side * 0.065, y, wz, 0.055, 1.78, 1.48, glass);
            box(sideX + side * 0.1, y, wz, 0.08, 1.8, 0.055, cream);
          }
          box(sideX + side * (sillDepth/2-.01), y - 1, wz, sillDepth, 0.1, 1.9, cream);
        }
    }
    // Roof gravel panels, service ducting, solar arrays; keep central running corridor clear.
    for (const side of [-1, 1]) {
      box(x + side * (w / 2 - 0.12), h - 0.1, z, 0.24, 0.2, d, cream);
      const px = x + side * (w / 2 - 1.2), hole = interior?.roofAccess ? interior.core.hole : null;
      const runs: [number, number][] = hole && px + 0.83 > hole.x0 && px - 0.83 < hole.x1
        ? [[z - (d - 1) / 2, hole.z0 - 0.45], [hole.z1 + 0.45, z + (d - 1) / 2]]
        : [[z - (d - 1) / 2, z + (d - 1) / 2]];
      for (const [a, c] of runs)
        if (c - a > 0.2) box(px, h + 0.012, (a + c) / 2, 1.65, 0.022, c - a, material("#8e9996"));
    }
    if (grid && !b.look && index % 3 === 0) {
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
      ].some(([r, i]) => r * 8 + i === index) &&
      // A hollow roof annex stands there on the tall houses.
      !data.rooms?.some((o) => Math.abs(o.x - x) < o.width / 2 + 1.2 && Math.abs(o.z - z - 2) < o.depth / 2 + 0.5)
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
        new THREE.Vector3(x + side * (w / 2 + 0.09), Math.max(0.3, data.infills?.find(f=>Math.abs(f.z-z)<1&&Math.abs(f.x-(x+side*w/2))<f.width/2+.1)?.height ?? 0), z + d * 0.3),
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
  for (const prop of data.industrial ?? []) {
    const [x,y,z]=prop.pos;
    const rust=material("#725240",0.25,0.86);
    if (prop.kind === "barrel") {
      add(new THREE.CylinderGeometry(.42,.43,1.1,16),rust,x,y+.55,z);
      for (const h of [.08,.32,.78,1.03]) add(new THREE.TorusGeometry(.423,.025,5,16),dark,x,y+h,z,Math.PI/2);
      add(new THREE.CylinderGeometry(.38,.38,.025,16),dark,x,y+1.11,z);
      physics?.box([x,y+.55,z],[.84,1.1,.84]);
    } else if (prop.kind === "sewer-light") {
      const glow=material("#d3ddac",.05,.45);
      glow.emissive.set("#bfd8a1");glow.emissiveIntensity=.9;
      box(x,y,z,1.2,.16,.5,dark,.04);
      box(x,y-.1,z,1,.08,.3,glow,.025);
      for(const dx of [-.4,0,.4])box(x+dx,y-.15,z,.035,.04,.38,dark);
    } else if (prop.kind === "compressor") {
      const enamel=material("#536963",.35,.68);
      const gauge=material("#d1cbb3",.15,.55);
      box(x,y+.16,z,3.8,.32,2.2,dark,.08);
      add(new THREE.CylinderGeometry(.68,.68,2.6,20),enamel,x,y+1.35,z,0,0,Math.PI/2);
      for(const dx of [-1.3,1.3]){
        add(new THREE.SphereGeometry(.68,16,10),enamel,x+dx,y+1.35,z,0,0,0);
        box(x+dx,y+.6,z,.3,.9,1.2,rust,.05);
      }
      add(new THREE.TorusGeometry(.24,.035,8,20),rust,x+.7,y+2.15,z+.35,Math.PI/2);
      rod(new THREE.Vector3(x+.7,y+1.8,z+.35),new THREE.Vector3(x+.7,y+2.15,z+.35),.045,chrome);
      add(new THREE.CylinderGeometry(.18,.18,.1,16),gauge,x-.65,y+2.03,z+.55,Math.PI/2);
      box(x-.65,y+2.07,z+.615,.025,.17,.015,dark);
      box(x,y+.55,z+.85,1.2,.45,.6,enamel,.04);
      for(let k=0;k<7;k++)box(x-.5+k*.16,y+.55,z+1.17,.045,.4,.07,dark);
      physics?.box([x,y+1.1,z],[4,2.2,2.3]);
    } else {
      const length=prop.length??5;
      add(new THREE.CylinderGeometry(.34,.34,length,16,1,true),rust,x,y,z,0,0,Math.PI/2);
      for (const dx of [-length/2,0,length/2]) add(new THREE.TorusGeometry(.345,.035,6,16),dark,x+dx,y,z,0,Math.PI/2);
      physics?.box([x,y,z],[length,.68,.68]);
    }
  }
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
      for(let k=0;k<6;k++) {
        const a=trunk.getPoint(k/6), b=trunk.getPoint((k+1)/6), d=b.clone().sub(a);
        physics?.box(a.clone().add(b).multiplyScalar(.5).toArray(), [.32*s,d.length(),.32*s],
          new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));
      }
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
  for (const s of data.signs) sign(s.x, s.y, s.z, s.text, s.color, s.side ?? -1, 6, 1);
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
  // The beach stops at the river mouth (tools/west-bank.mjs).
  box(61, -0.22, 142, 314, 0.16, 44, material("#cbbb95"));
  box(-190, -0.22, 142, 144, 0.16, 44, material("#cbbb95"));
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(1800, 1300),
    new THREE.MeshStandardMaterial({
      color: "#327f89",
      roughness: 0.24,
      metalness: 0.45,
    }),
  );
  if (cityPBRReady()) {
    surfaceFinish(water.material,'water');
    water.material.normalScale.set(.65,.65);
  }
  water.rotation.x = -Math.PI / 2;
  water.position.set(8, -0.32, 804);
  root.add(water);
  for (let k = 0; k < 13; k++)
    box(8, -0.2, 165 + k * 5, 390, 0.012, 0.12, material("#86b7ad", 0.3, 0.4));
  for (const w of data.water ?? []) {
    const river = new THREE.Mesh(
      new THREE.PlaneGeometry(w.x1 - w.x0, w.z1 - w.z0),
      new THREE.MeshStandardMaterial({ color: "#2f6f74", roughness: 0.2, metalness: 0.45 }),
    );
    if (cityPBRReady()) {
      surfaceFinish(river.material, "water");
      river.material.normalScale.set(0.5, 0.5);
    }
    river.rotation.x = -Math.PI / 2;
    river.position.set((w.x0 + w.x1) / 2, w.y, (w.z0 + w.z1) / 2);
    river.receiveShadow = true;
    root.add(river);
  }
  for (const { a, b, r, color } of data.struts ?? [])
    rod(new THREE.Vector3(...a), new THREE.Vector3(...b), r, material(color ?? "#4f6470", 0.5, 0.4));
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
