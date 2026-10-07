/**
 * West bank (2026-10): a river splits the city. East of it lies the old grid;
 * west of it a new district built for variety rather than rhythm:
 *
 *  - the Westturm, a 58 m high-rise you can climb from the outside (courses
 *    every 1.6 m, balconies on every other bay, a crown room on top),
 *  - an office slab and a plaza with planters and a fountain,
 *  - a row of narrow townhouses whose heights jump between 8 and 19 m,
 *  - detached villas in walled gardens (pools, pergolas, garages),
 *  - one lone house at the end of the row.
 *
 * Ways across: a truss road bridge with swing bars under its portals, an
 * arched footbridge whose arch ribs are a climbing line of their own, the
 * harbour bridge on the boardwalk, and two moored barges with mooring piles
 * between them to hop across. Falling into the water puts the runner back on
 * the bank they came from (scenery.water, PlayerController).
 *
 * All buildings go into scenery.buildings with a `kind`, so they become hollow
 * and enterable together with the old houses (city-interiors.mjs) and are
 * dressed by kind in CityScenery.
 */
import { buildRoom } from './city-interiors.mjs';

export const RIVER = { x0: -118, x1: -96, z0: -250, z1: 160, surface: -1, bed: -3.4 };
const WALL_T = 0.5;
const WEST = { x0: -262, x1: RIVER.x0, z0: -100, z1: 70 };
const ASPHALT = '#343b40';
const CURB = '#a9aeb3';
const STONE = '#8c8778';
const STEEL = '#4f6470';
const LAWN = '#5c7a48';
const HEDGE = '#4d6b3f';

export function addWestBank({ box, deco, rail, ramps, scenery, hash }) {
  const struts = (scenery.struts ??= []);
  const strut = (a, b, r = 0.09, color = STEEL) => struts.push({ a, b, r, color });
  const room = (spec) => {
    buildRoom((pos, size, color, tag, style) => box(pos, size, color, { tag, ...(style ? { style } : {}) }), spec);
    scenery.rooms.push(spec);
  };
  const house = (spec) => {
    scenery.buildings.push({ stairSide: 0, variant: 0, ...spec });
    return spec;
  };

  // ============================================================ Ground
  box([(WEST.x0 + WEST.x1) / 2, -0.5, (WEST.z0 + WEST.z1) / 2], [WEST.x1 - WEST.x0, 1, WEST.z1 - WEST.z0], ASPHALT);
  // Boardwalk continues on the west bank.
  box([(WEST.x0 + WEST.x1) / 2, -0.5, 94], [WEST.x1 - WEST.x0, 1, 50], '#8a968b');
  box([(WEST.x0 + WEST.x1) / 2 - 1, 0.08, 96], [WEST.x1 - WEST.x0 - 2, 0.16, 30], '#b8b6a4');
  for (let x = -126; x >= -250; x -= 12) {
    scenery.trees.push({ x, z: 108, scale: 1.15 + hash(x, 9) * 0.3, palm: true });
    scenery.lamps.push({ x: x - 4, z: 85, side: -1 });
    box([x, 0.48, 104], [3.6, 0.96, 0.65], '#bdaf95');
  }

  // ============================================================ River
  const RL = RIVER.z1 - RIVER.z0, RZ = (RIVER.z0 + RIVER.z1) / 2, RX = (RIVER.x0 + RIVER.x1) / 2;
  box([RX, RIVER.bed - 0.5, RZ], [RIVER.x1 - RIVER.x0, 1, RL], '#3d4a44');
  scenery.water = [{ x0: RIVER.x0 + WALL_T, x1: RIVER.x1 - WALL_T, z0: RIVER.z0, z1: RIVER.z1, y: RIVER.surface }];
  // Quay walls; the coping overhangs the water and is a ledge to hang from.
  const bridges = [];
  const quay = () => {
    for (const [xw, side] of [[RIVER.x1 - WALL_T / 2, 1], [RIVER.x0 + WALL_T / 2, -1]]) {
      box([xw, (RIVER.bed) / 2, RZ], [WALL_T, -RIVER.bed, RL], STONE, { tag: 'quay-wall' });
      // Coping in pieces between the bridges.
      const cuts = bridges.map((b) => [b.z0 - 0.2, b.z1 + 0.2]).sort((p, q) => p[0] - q[0]);
      let z = WEST.z0;
      for (const [a, c] of [...cuts, [119, 119]]) {
        if (a - z > 0.5) box([xw - side * 0.2, 0.12, (z + a) / 2], [0.9, 0.24, a - z], '#b9b2a0', { tag: 'quay-coping' });
        z = c;
      }
      // Bollards: vault and precision line along the promenade.
      for (let bz = -92; bz < 118; bz += 9) {
        if (bridges.some((b) => bz > b.z0 - 2 && bz < b.z1 + 2)) continue;
        box([xw + side * 1.3, 0.35, bz], [0.5, 0.7, 0.5], '#3a4148');
      }
    }
  };

  // ------------------------------------------------ Truss road bridge (z -9)
  {
    const z0 = -15.5, z1 = -2.5, x0 = RIVER.x0 - 0.3, x1 = RIVER.x1 + 0.3, L = x1 - x0, cx = (x0 + x1) / 2;
    bridges.push({ z0, z1 });
    box([cx, -0.3, (z0 + z1) / 2], [L, 0.6, z1 - z0], '#6f7479');
    for (const zs of [z0 + 1.1, z1 - 1.1]) box([cx, 0.1, zs], [L, 0.2, 2.2], CURB);
    const panels = 5, step = (RIVER.x1 - RIVER.x0) / panels;
    for (const zg of [z0 - 0.25, z1 + 0.25]) {
      // Bottom chord doubles as a 1.1 m parapet, top chord as a walkable beam.
      box([cx, 0.55, zg], [L, 1.1, 0.5], STEEL, { tag: 'bridge-chord' });
      box([cx, 6.35, zg], [L - 2, 0.5, 0.6], STEEL, { tag: 'bridge-chord' });
      // Portal pillars stand on the river bed; masonry courses make them climbable.
      for (const xe of [RIVER.x0 + 1, RIVER.x1 - 1]) box([xe, (RIVER.bed + 7.4) / 2, zg + Math.sign(zg - (z0 + z1) / 2) * 0.75], [2, 7.4 - RIVER.bed, 2], STONE, { tag: 'bridge-pier' });
      for (let k = 1; k < panels; k++) box([RIVER.x0 + k * step, 3.7, zg], [0.3, 5.2, 0.3], STEEL, { tag: 'bridge-post' });
      for (let k = 0; k < panels; k++) {
        const xa = RIVER.x0 + k * step, xb = xa + step;
        strut(k % 2 ? [xa, 1.1, zg] : [xb, 1.1, zg], k % 2 ? [xb, 6.1, zg] : [xa, 6.1, zg], 0.1);
      }
    }
    // Overhead cross members: a swing chain across the river.
    for (let k = 0; k <= panels; k++) {
      const x = RIVER.x0 + k * step;
      rail([x, 3.4, z0 + 0.6], [x, 3.4, z1 - 0.6]);
      deco([x, 6.35, (z0 + z1) / 2], [0.35, 0.35, z1 - z0], STEEL);
    }
    scenery.lamps.push({ x: cx - 5, z: z0 + 0.4, side: -1 }, { x: cx + 5, z: z1 - 0.4, side: 1 });
  }

  // ------------------------------------------------ Arched footbridge (z 21)
  {
    const zc = 21, w = 4, span = RIVER.x1 - RIVER.x0 + 0.6, half = span / 2, rise = 2.4, cx = RX;
    bridges.push({ z0: zc - w / 2 - 0.6, z1: zc + w / 2 + 0.6 });
    const run = half - 1, len = Math.hypot(run, rise), tilt = Math.atan2(rise, run), t = 0.3;
    // Two ramps up to a level crown plate.
    for (const dir of [1, -1]) {
      const mx = cx + dir * (1 + run / 2);
      ramps.push({ pos: [mx, rise / 2 - t / 2 / Math.cos(tilt), zc], size: [w, t, len], rotY: Math.PI / 2, tiltX: dir * tilt, color: '#c9c2ae' });
    }
    box([cx, rise - t / 2, zc], [2.2, t, w], '#c9c2ae');
    // Arch ribs over both edges: narrow tilted beams, at most 37 degrees, so
    // the arch itself is a balance walk over the river to a 5.2 m crown.
    const arch = (u) => 0.3 + 4.9 * (1 - u * u);
    const ax = (u) => cx + u * (half - 0.4);
    for (const zr of [zc - w / 2 - 0.4, zc + w / 2 + 0.4]) {
      const n = 8;
      for (let k = 0; k < n; k++) {
        const ua = -1 + (2 * k) / n, ub = ua + 2 / n;
        const xa = ax(ua), xb = ax(ub), ya = arch(ua), yb = arch(ub);
        const ang = Math.atan2(yb - ya, xb - xa), th = 0.45;
        ramps.push({ pos: [(xa + xb) / 2, (ya + yb) / 2 - th / 2 / Math.cos(ang), zr], size: [0.55, th, Math.hypot(xb - xa, yb - ya) + 0.3], rotY: Math.PI / 2, tiltX: -ang, color: '#e2ddcf' });
      }
      // Hangers from rib to deck edge, visual only.
      for (let k = 1; k < 8; k++) {
        const u = -1 + k / 4, x = ax(u), deckY = Math.max(0.2, rise * (1 - Math.abs(x - cx) / half));
        strut([x, deckY, zr], [x, arch(u) - 0.45, zr], 0.03, '#cfd5d6');
      }
    }
  }

  // ------------------------------------------------ Harbour bridge (boardwalk)
  {
    const z0 = 89, z1 = 99, L = RIVER.x1 - RIVER.x0 + 0.6;
    bridges.push({ z0, z1 });
    box([RX, -0.3, (z0 + z1) / 2], [L, 0.6, z1 - z0], '#a99a7c');
    for (const zw of [z0 + 0.15, z1 - 0.15]) box([RX, 0.5, zw], [L, 1, 0.3], '#e2ddcf', { tag: 'bridge-parapet' });
    for (const x of [RIVER.x0 + 4, RIVER.x1 - 4]) scenery.lamps.push({ x, z: z0 + 0.6, side: -1 });
  }
  quay();

  // ------------------------------------------------ Barges and mooring piles
  {
    const deck = -0.25;
    const barge = (x, z, len, color) => {
      box([x, deck - 0.7, z], [6, 1.4, len], color, { tag: 'barge-hull' });
      box([x, deck + 0.25, z - len / 2 + 0.3], [6, 0.5, 0.6], color, { tag: 'barge-hull' });
      box([x, deck + 0.25, z + len / 2 - 0.3], [6, 0.5, 0.6], color, { tag: 'barge-hull' });
    };
    barge(RIVER.x1 - WALL_T - 3.6, 48, 18, '#3b4a5a');
    // Two stacked containers at the bow, the wheelhouse at the stern; the
    // open deck between is the run-up for the jump onto the piles.
    box([RIVER.x1 - WALL_T - 3.6, deck + 1.3, 43], [2.44, 2.6, 6.1], '#8a4a3c');
    box([RIVER.x1 - WALL_T - 3.6, deck + 3.9, 43.6], [2.44, 2.6, 6.1], '#3f6b7a');
    box([RIVER.x1 - WALL_T - 2.4, deck + 1.1, 55], [2.4, 2.2, 3], '#d8d3c4');
    barge(RIVER.x0 + WALL_T + 3.6, 54, 16, '#5a3b34');
    // Gravel cargo as a stepped heap.
    for (const [dz, hgt, len] of [[-4, 0.6, 5], [-1, 1.2, 3.5], [2, 0.7, 4]]) box([RIVER.x0 + WALL_T + 3.6, deck + hgt / 2, 54 + dz], [4.6, hgt, len], '#9a8d76');
    // Piles in mid-river: about 2.8 m from either barge.
    for (const z of [49, 52]) box([RX, (RIVER.bed + 0.05) / 2, z], [1.3, 0.05 - RIVER.bed, 1.3], '#5b4a3a', { tag: 'mooring-pile' });
  }

  // ============================================================ Streets
  // Promenade along the quay, the Uferstraße behind it, two cross streets.
  box([RIVER.x0 - 3, 0.05, (WEST.z0 + WEST.z1) / 2], [6, 0.1, WEST.z1 - WEST.z0], CURB);
  for (const z of [-17, -1, 13.5, 28.5]) box([(WEST.x0 + RIVER.x0 - 16) / 2, 0.05, z], [WEST.x1 - WEST.x0 - 16, 0.1, 3], CURB);
  for (let z = -90; z < 66; z += 14) scenery.lamps.push({ x: RIVER.x0 - 5.5, z, side: 1 });
  for (let z = -86; z < 66; z += 14) if (z < -20 || z > 30) scenery.trees.push({ x: RIVER.x0 - 2.5, z, scale: 1 + hash(z, 3) * 0.3, palm: false });

  // ============================================================ Westturm plaza
  {
    const px = -172, pz = -52;
    deco([px - 8, 0.03, pz], [70, 0.06, 60], '#b7b2a6');
    house({ kind: 'highrise', x: px, z: pz, width: 22, depth: 22, height: 57.6, color: '#a9b8c0', style: 'windows-strip', variant: 1, sign: 'WESTTURM' });
    // Crown: a hollow lantern room on the roof, the summit above it.
    room({ x: px, z: pz, width: 12, depth: 12, base: 57.6, height: 5, color: '#d7dde0', style: 'windows-strip', door: { face: 'z', side: -1, u: px } });
    strut([px, 62.6, pz], [px, 74, pz], 0.16, '#c9d1d4');
    // Planters, benches and a fountain: low vault and precision line.
    for (let k = 0; k < 5; k++) box([px - 26 + k * 6.5, 0.45, pz + 17], [3.2, 0.9, 1.4], '#6f7a6a');
    for (let k = 0; k < 4; k++) box([px + 16, 0.35, pz - 9 + k * 6], [1.2, 0.7, 3.6], '#bdaf95');
    box([px - 24, 0.4, pz - 14], [8, 0.8, 8], '#b3b8bc');
    box([px - 24, 1.05, pz - 14], [5, 0.5, 5], '#7fa3b5');
    box([px - 24, 1.9, pz - 14], [1, 1.8, 1], '#9aa0a3');
    for (const [x, z] of [[px - 30, pz - 26], [px + 16, pz + 20], [px - 36, pz + 6]]) scenery.trees.push({ x, z, scale: 1.2, palm: false });
    // Office slab beside it: 25 m of strip windows.
    house({ kind: 'office', x: -229, z: -58, width: 16, depth: 28, height: 25.4, color: '#c4c9c3', style: 'windows-grid', variant: 2, sign: 'KONTOR WEST' });
    // Bus shelter on the Brückenstraße.
    box([-150, 2.6, -18.6], [6, 0.15, 2], '#5d646e');
    for (const dx of [-2.8, 2.8]) box([-150 + dx, 1.3, -19.4], [0.12, 2.6, 0.12], '#5d646e');
    box([-150, 0.45, -19.2], [4, 0.2, 0.6], '#896f50');
  }

  // ============================================================ Townhouse row
  // Narrow houses with jump gaps, heights jumping on purpose: a rooftop run
  // that goes up and down rather than along one line.
  {
    const z = 6.5, depth = 11;
    const widths = [8.5, 7.5, 9, 8, 10, 7.5, 9, 8.5];
    const gaps = [3.4, 3.0, 4.2, 3.6, 3.2, 3.8, 3.0];
    const heights = [9.2, 15.6, 11.8, 19.2, 8.6, 13.4, 17.2, 10.4];
    const colors = ['#d9a48f', '#e8d6a8', '#9fbeb9', '#c97f6a', '#e1c7a5', '#b6c7d6', '#d8c3d9', '#c5d4cb'];
    let x = RIVER.x0 - 16;
    widths.forEach((w, k) => {
      const cx = x - w / 2;
      house({ kind: 'townhouse', x: cx, z, width: w, depth, height: heights[k], color: colors[k], variant: k % 4 });
      x -= w + (gaps[k] ?? 0);
    });
    // The lone house: set back in its own garden at the end of the street.
    const lx = x - 10;
    deco([lx, 0.03, z], [16, 0.06, 13], LAWN);
    house({ kind: 'lone', x: lx, z, width: 9, depth: 9.5, height: 7, color: '#ece4d2', variant: 2, doorOpen: true });
    // Garden walls with a gate in line with the (unlocked) front door bay.
    const gate = lx + 1.4;
    for (const dz of [-6.2, 6.2])
      for (const [a, c] of [[lx - 8, gate - 1.5], [gate + 1.5, lx + 8]]) box([(a + c) / 2, 0.5, z + dz], [c - a, 1, 0.3], '#d9d2c0', { tag: 'garden-wall' });
    scenery.trees.push({ x: lx - 6, z: z - 3.5, scale: 1.3, palm: false });
  }

  // ============================================================ Villas
  const villa = ({ x, z, width, depth, height, color, variant, garden, pool, pergola, garage, tower }) => {
    const [gw, gd] = garden;
    deco([x, 0.03, z + 1], [gw, 0.06, gd], LAWN);
    // Garden wall with a gate gap on the street side (north), hedges behind.
    const gz0 = z + 1 - gd / 2, gz1 = z + 1 + gd / 2;
    for (const [a, c] of [[x - gw / 2, x - 1.6], [x + 1.6, x + gw / 2]]) box([(a + c) / 2, 0.6, gz0], [c - a, 1.2, 0.4], '#e6dfcf', { tag: 'garden-wall' });
    box([x - gw / 2, 0.6, (gz0 + gz1) / 2], [0.4, 1.2, gd], '#e6dfcf', { tag: 'garden-wall' });
    box([x + gw / 2, 0.6, (gz0 + gz1) / 2], [0.4, 1.2, gd], '#e6dfcf', { tag: 'garden-wall' });
    box([x, 0.8, gz1 - 0.6], [gw - 1.6, 1.6, 1.0], HEDGE, { tag: 'hedge' });
    const b = house({ kind: 'villa', x, z, width, depth, height, color, variant });
    if (pool) {
      const [px, pz, pw, pd] = pool;
      for (const [dx, dz, sw, sd] of [[0, -pd / 2, pw, 0.4], [0, pd / 2, pw, 0.4], [-pw / 2, 0, 0.4, pd], [pw / 2, 0, 0.4, pd]])
        box([px + dx, 0.3, pz + dz], [sw, 0.6, sd], '#ece8de', { tag: 'pool-rim' });
      deco([px, 0.45, pz], [pw - 0.4, 0.04, pd - 0.4], '#4fa3b8');
      box([px, 0.05, pz], [pw - 0.4, 0.1, pd - 0.4], '#3b7f92');
      box([px - pw / 2 - 1.6, 1.4, pz], [0.4, 2.8, 0.4], '#ece8de');
      box([px - pw / 2 - 1.2, 2.7, pz], [1.2, 0.15, 0.6], '#ece8de'); // diving board
    }
    if (pergola) {
      const [qx, qz, qw, qd] = pergola;
      for (const dx of [-qw / 2, qw / 2]) for (const dz of [-qd / 2, qd / 2]) box([qx + dx, 1.35, qz + dz], [0.25, 2.7, 0.25], '#896f50', { tag: 'pergola-post' });
      // Slats over head height are swing bars.
      for (let k = 0; k <= 3; k++) rail([qx - qw / 2, 2.8, qz - qd / 2 + (k * qd) / 3], [qx + qw / 2, 2.8, qz - qd / 2 + (k * qd) / 3]);
      deco([qx, 2.95, qz], [qw + 0.4, 0.12, qd + 0.4], '#896f50');
    }
    if (garage) {
      const [gx, gz] = garage;
      box([gx, 1.5, gz], [5, 3, 6.5], color, { tag: 'garage' });
      deco([gx, 1.1, gz - 3.27], [4, 2.2, 0.06], '#9ba3a6');
    }
    // Inset 1.7 m from the facades: a climber topping out there needs a landing.
    if (tower) room({ x: tower[0], z: tower[1], width: 4.6, depth: 4.6, base: height, height: 3.2, color, style: 'windows-mixed', door: { face: 'z', side: -1, u: tower[0] } });
    scenery.trees.push({ x: x - gw / 2 + 2.5, z: gz1 - 2.5, scale: 1.1 + hash(x, z) * 0.3, palm: false });
    return b;
  };
  villa({ x: -146, z: 44, width: 16, depth: 12, height: 7, color: '#f1ede4', variant: 2, garden: [28, 26], pool: [-146, 54.5, 9, 3.6], garage: [-157, 36.5] });
  villa({ x: -183, z: 46, width: 18, depth: 13.5, height: 10.4, color: '#e9c9bd', variant: 1, garden: [30, 30], pergola: [-188, 58, 6, 4] });
  villa({ x: -219, z: 43, width: 14, depth: 13, height: 7, color: '#e8dcbc', variant: 3, garden: [24, 26], pool: [-219, 54, 8, 3.4], tower: [-222, 45.5] });
  villa({ x: -249, z: 47, width: 12, depth: 12, height: 6.6, color: '#d6e0d8', variant: 0, garden: [20, 28], pergola: [-249, 58, 5, 3.6] });

  return { bridges: bridges.length };
}
