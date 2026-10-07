/**
 * Enterable city houses: a hollow shell with real storeys, a switchback stair
 * core and only a few ways in — open upper windows, a roof hatch over the
 * stairwell and, very rarely, an unlocked front door. Window rows, bays and
 * sills mirror CityScenery so every opening sits behind a drawn window.
 */
export const WALL = 0.3;
const SLAB = 0.25;
const LANE = 1.3; // one flight's width
const LANDING = 1.3;
const FLIGHT = 4; // horizontal run of one flight
// Roof between facade and hatch: a climber topping out at that wall must land
// on roof, not drop straight into the stairwell.
const CORE_INSET = 1;
const RISE_MAX = 0.27; // autostep limit is 0.4; outdoor stairs proved 0.3
const STEP_T = 0.2; // thin slabs: the flight above keeps 2.3 m of headroom
// Openings start at the drawn sill and stand tall enough to walk through.
const OPEN_W = 1.5;
const SILL = 0.5;
const OPEN_H = 2.05;
const DOOR_W = 1.4;
const DOOR_H = 2.45;

/** Storey floor levels; the upper ones line up with the drawn window rows. */
export function storeyFloors(H) {
  const f = [0.02];
  for (let y = 3.3; y + 2.4 < H; y += 3.2) f.push(+y.toFixed(3));
  return f;
}

/** Window grid exactly as CityScenery draws it (face, side, along-face coordinate, floor). */
export function windowGrid(b) {
  const { x, z, width: w, depth: d, height: h } = b;
  const out = [];
  const bays = Math.floor((w - 1) / 2.8);
  for (const side of [-1, 1]) {
    for (let k = 0; k < bays; k++) {
      const u = x + (k - (bays - 1) / 2) * 2.8;
      for (let y = 4.7; y < h - 1; y += 3.2) out.push({ face: 'z', side, u, row: +y.toFixed(3), floor: +(y - 1.4).toFixed(3) });
      out.push({ face: 'z', side, u, row: 1.53, floor: 0.02, ground: true });
    }
    for (let u = z - d / 2 + 1.5; u < z + d / 2 - 1; u += 2.8)
      for (let y = 4.7; y < h - 1; y += 3.2) out.push({ face: 'x', side, u: +u.toFixed(4), row: +y.toFixed(3), floor: +(y - 1.4).toFixed(3) });
  }
  return out;
}

/** Stair core rectangle for a corner choice (sx: side wall, sz: landing wall). */
export function coreLayout(b, sx, sz) {
  const xi = b.x + sx * (b.width / 2 - WALL - CORE_INSET);
  const zi = b.z + sz * (b.depth / 2 - WALL);
  const zl = zi - sz * LANDING; // flights start here
  const zh = zl - sz * FLIGHT; // half landing starts here
  const ze = zh - sz * LANDING;
  const laneA = [xi - sx * LANE, xi];
  const laneB = [xi - sx * 2 * LANE, xi - sx * LANE];
  const hole = { x0: Math.min(xi, xi - sx * 2 * LANE), x1: Math.max(xi, xi - sx * 2 * LANE), z0: Math.min(zl, ze), z1: Math.max(zl, ze) };
  const core = { x0: hole.x0, x1: hole.x1, z0: Math.min(zi, ze), z1: Math.max(zi, ze) };
  return { sx, sz, xi, zi, zl, zh, ze, laneA, laneB, hole, core };
}

const overlaps = (a, b, pad = 0) => a.x0 < b.x1 + pad && a.x1 > b.x0 - pad && a.z0 < b.z1 + pad && a.z1 > b.z0 - pad;

/** Rectangle minus a hole, as up to four rectangles. */
function cut(r, hole) {
  if (!hole || !overlaps(r, hole)) return [r];
  const h = { x0: Math.max(r.x0, hole.x0), x1: Math.min(r.x1, hole.x1), z0: Math.max(r.z0, hole.z0), z1: Math.min(r.z1, hole.z1) };
  return [
    { x0: r.x0, x1: r.x1, z0: r.z0, z1: h.z0 },
    { x0: r.x0, x1: r.x1, z0: h.z1, z1: r.z1 },
    { x0: r.x0, x1: h.x0, z0: h.z0, z1: h.z1 },
    { x0: h.x1, x1: r.x1, z0: h.z0, z1: h.z1 },
  ].filter((q) => q.x1 - q.x0 > 0.02 && q.z1 - q.z0 > 0.02);
}

/**
 * A wall plane with rectangular holes, split into solid pieces.
 * u runs along the wall, v is height; holes are {u0,u1,v0,v1}.
 */
function wallPieces(u0, u1, v0, v1, holes) {
  const cuts = [...new Set([u0, u1, ...holes.flatMap((h) => [h.u0, h.u1])])].filter((u) => u >= u0 && u <= u1).sort((a, b) => a - b);
  const pieces = [];
  for (let k = 0; k + 1 < cuts.length; k++) {
    const a = cuts[k], c = cuts[k + 1];
    if (c - a < 0.005) continue;
    const mid = (a + c) / 2;
    const spans = holes.filter((h) => h.u0 < mid && h.u1 > mid).sort((p, q) => p.v0 - q.v0);
    let v = v0;
    for (const h of spans) {
      if (h.v0 > v + 0.005) pieces.push({ u0: a, u1: c, v0: v, v1: h.v0 });
      v = Math.max(v, h.v1);
    }
    if (v1 > v + 0.005) pieces.push({ u0: a, u1: c, v0: v, v1 });
  }
  // Merge vertically aligned neighbours to keep the collider count low.
  pieces.sort((p, q) => p.v0 - q.v0 || p.v1 - q.v1 || p.u0 - q.u0);
  const merged = [];
  for (const p of pieces) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(last.v0 - p.v0) < 1e-6 && Math.abs(last.v1 - p.v1) < 1e-6 && Math.abs(last.u1 - p.u0) < 1e-6) last.u1 = p.u1;
    else merged.push({ ...p });
  }
  return merged;
}

/** One flight of slab steps (never solid wedges: the flight above needs headroom beneath). */
function flight(box, x0, x1, zStart, dir, yBase, rise, color) {
  const n = Math.max(1, Math.ceil(rise / RISE_MAX));
  const tread = FLIGHT / n;
  for (let k = 1; k <= n; k++) {
    const top = yBase + (rise * k) / n;
    const za = zStart + dir * (k - 1) * tread, zb = zStart + dir * k * tread;
    box([(x0 + x1) / 2, top - STEP_T / 2, (za + zb) / 2], [Math.abs(x1 - x0), STEP_T, tread + 0.02], color, 'house-stair');
  }
}

/**
 * Build one house. `plan` carries the chosen core and openings; `box` pushes a
 * physical box (pos, size, color, tag).
 */
export function buildHouse(b, plan, box, { style, sideWalls = true, ringFaces = ['x', 'z'], plinth = true, covered = [] } = {}) {
  const { x, z, width: W, depth: D, height: H } = b;
  const floors = storeyFloors(H);
  const wallColor = b.color;
  const inner = { x0: x - W / 2 + WALL, x1: x + W / 2 - WALL, z0: z - D / 2 + WALL, z1: z + D / 2 - WALL };

  // --- Shell with real holes only where a window or door stands open.
  const holesFor = (face, side) =>
    plan.openings.filter((o) => o.face === face && o.side === side).map((o) => {
      const w = o.door ? DOOR_W : OPEN_W;
      return { u0: o.u - w / 2, u1: o.u + w / 2, v0: o.door ? 0 : o.floor + SILL, v1: o.door ? DOOR_H : o.top };
    });
  for (const side of [-1, 1]) {
    const zc = z + side * (D / 2 - WALL / 2);
    for (const p of wallPieces(x - W / 2, x + W / 2, 0, H, holesFor('z', side)))
      box([(p.u0 + p.u1) / 2, (p.v0 + p.v1) / 2, zc], [p.u1 - p.u0, p.v1 - p.v0, WALL], wallColor, 'house-wall', style);
    // An infill's side walls are its neighbours' walls.
    if (!sideWalls) continue;
    const xc = x + side * (W / 2 - WALL / 2);
    for (const p of wallPieces(z - D / 2 + WALL, z + D / 2 - WALL, 0, H, holesFor('x', side)))
      box([xc, (p.v0 + p.v1) / 2, (p.u0 + p.u1) / 2], [WALL, p.v1 - p.v0, p.u1 - p.u0], wallColor, 'house-wall', style);
  }
  // Plinth ring (was a solid block over the whole plot): the 1.4 m street step
  // stays, cut open only at an unlocked door.
  for (const side of plinth ? [-1, 1] : []) {
    const doors = holesFor('z', side).filter((h) => h.v0 < 0.1).map((h) => ({ ...h, v1: 2 }));
    for (const p of wallPieces(x - W / 2 - 0.06, x + W / 2 + 0.06, 0, 1.4, doors))
      box([(p.u0 + p.u1) / 2, 0.7, z + side * (D / 2 - 0.12)], [p.u1 - p.u0, 1.4, 0.36], '#9eaaab', 'house-plinth');
    box([x + side * (W / 2 - 0.12), 0.7, z], [0.36, 1.4, D - 0.6], '#9eaaab', 'house-plinth');
  }

  // --- Floors, roof and the stairwell holes.
  const L = plan.layout;
  floors.forEach((f, k) => {
    const parts = k === 0 ? [inner] : cut(inner, L.hole);
    for (const q of parts)
      box([(q.x0 + q.x1) / 2, f - SLAB / 2, (q.z0 + q.z1) / 2], [q.x1 - q.x0, SLAB, q.z1 - q.z0], k === 0 ? '#8d8a80' : '#a59d8c', 'house-floor');
  });
  for (const q of plan.roofAccess ? cut(inner, L.hole) : [inner])
    box([(q.x0 + q.x1) / 2, H - SLAB / 2, (q.z0 + q.z1) / 2], [q.x1 - q.x0, SLAB, q.z1 - q.z0], '#7d817c', 'house-roof');

  // --- Switchback stair core, up to the roof only where the hatch is open.
  const levels = plan.roofAccess ? [...floors, H] : floors;
  for (let k = 0; k + 1 < levels.length; k++) {
    const y0 = levels[k], R = levels[k + 1] - y0, half = +(R / 2).toFixed(4);
    flight(box, L.laneA[0], L.laneA[1], L.zl, -L.sz, y0, half, '#8f8778');
    box([(L.hole.x0 + L.hole.x1) / 2, y0 + half - STEP_T / 2, (L.zh + L.ze) / 2], [L.hole.x1 - L.hole.x0, STEP_T, LANDING], '#8f8778', 'house-stair-landing');
    flight(box, L.laneB[0], L.laneB[1], L.zh, L.sz, y0 + half, R - half, '#8f8778');
  }
  if (plan.roofAccess) {
    // Low coaming on three sides; the stair comes out over the fourth.
    const h = L.hole, cy = H + 0.2;
    const far = L.sz > 0 ? h.z0 : h.z1;
    box([(h.x0 + h.x1) / 2, cy, far - L.sz * 0.1], [h.x1 - h.x0 + 0.4, 0.4, 0.2], '#6d7570', 'house-hatch-coaming');
    for (const edge of [h.x0 - 0.1, h.x1 + 0.1])
      box([edge, cy, (h.z0 + h.z1) / 2], [0.2, 0.4, h.z1 - h.z0], '#6d7570', 'house-hatch-coaming');
  }

  // --- Inside step under each open window, so it can be left on foot as well.
  for (const o of plan.openings) {
    if (o.door) continue;
    const wallIn = o.face === 'z' ? z + o.side * (D / 2 - WALL) : x + o.side * (W / 2 - WALL);
    const c = wallIn - o.side * 0.2;
    const pos = o.face === 'z' ? [o.u, o.floor + 0.125, c] : [c, o.floor + 0.125, o.u];
    const size = o.face === 'z' ? [1.3, 0.25, 0.4] : [0.4, 0.25, 1.3];
    box(pos, size, '#6f5b48', 'house-window-step');
  }

  // --- Sparse furnishing: obstacles to vault, never in the stair core or in
  // front of an opening, and spaced so a way round always stays free.
  let seed = (Math.abs(Math.round(x * 31 + z * 17)) % 9973) + 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  floors.forEach((f, k) => {
    const keepClear = [{ ...L.core, x0: L.core.x0 - 0.9, x1: L.core.x1 + 0.9, z0: L.core.z0 - 0.9, z1: L.core.z1 + 0.9 }];
    for (const o of plan.openings) {
      if (Math.abs(o.floor - f) > 0.05) continue;
      const wallIn = o.face === 'z' ? z + o.side * (D / 2 - WALL) : x + o.side * (W / 2 - WALL);
      const a = wallIn - o.side * 3, c = wallIn;
      keepClear.push(o.face === 'z'
        ? { x0: o.u - 1.6, x1: o.u + 1.6, z0: Math.min(a, c), z1: Math.max(a, c) }
        : { x0: Math.min(a, c), x1: Math.max(a, c), z0: o.u - 1.6, z1: o.u + 1.6 });
    }
    const placed = [];
    const kinds = [
      { w: 1.8, d: 0.45, h: 2.0, color: '#7b5e45', wall: true },
      { w: 1.6, d: 0.85, h: 0.75, color: '#8a6b4c' },
      k % 2 ? { w: 2.0, d: 0.9, h: 0.5, color: '#5d6f7a' } : { w: 1.1, d: 1.1, h: 1.1, color: '#9b7a52' },
    ];
    for (const kind of kinds) {
      for (let tries = 0; tries < 24; tries++) {
        const alongX = rand() < 0.5;
        const w = alongX ? kind.w : kind.d, d = alongX ? kind.d : kind.w;
        let cx = inner.x0 + w / 2 + 0.05 + rand() * (inner.x1 - inner.x0 - w - 0.1);
        let cz = inner.z0 + d / 2 + 0.05 + rand() * (inner.z1 - inner.z0 - d - 0.1);
        if (kind.wall) {
          // Shelves stand against a wall.
          if (alongX) cz = rand() < 0.5 ? inner.z0 + d / 2 : inner.z1 - d / 2;
          else cx = rand() < 0.5 ? inner.x0 + w / 2 : inner.x1 - w / 2;
        }
        const r = { x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 };
        if (keepClear.some((q) => overlaps(r, q)) || placed.some((q) => overlaps(r, q, 1.4))) continue;
        placed.push(r);
        box([cx, f + kind.h / 2, cz], [w, kind.h, d], kind.color, 'house-furniture');
        break;
      }
    }
  });

  // --- Climb courses as a ring around the shell, opened at every doorway.
  for (let y = 1.8; y < H - 0.3; y += 1.6) {
    const v0 = y - 0.11, v1 = y;
    for (const side of [-1, 1]) {
      const zc = z + side * (D / 2 - 0.025);
      const zHoles = holesFor('z', side).filter((h) => h.v0 < v1 + 0.05 && h.v1 > v0 - 0.05).map((h) => ({ u0: h.u0 - 0.05, u1: h.u1 + 0.05, v0: v0 - 1, v1: v1 + 1 }));
      for (const p of ringFaces.includes('z') ? wallPieces(x - W / 2 - 0.25, x + W / 2 + 0.25, v0, v1, zHoles) : [])
        box([(p.u0 + p.u1) / 2, (v0 + v1) / 2, zc], [p.u1 - p.u0, 0.11, 0.55], wallColor, 'climb-facade-course');
      const xc = x + side * (W / 2 - 0.025);
      const xHoles = holesFor('x', side).filter((h) => h.v0 < v1 + 0.05 && h.v1 > v0 - 0.05).map((h) => ({ u0: h.u0 - 0.05, u1: h.u1 + 0.05, v0: v0 - 1, v1: v1 + 1 }));
      for (const p of ringFaces.includes('x') && !covered.some((c) => c.side === side && y < c.top + 0.1) ? wallPieces(z - D / 2 - 0.25, z + D / 2 + 0.25, v0, v1, xHoles) : [])
        box([xc, (v0 + v1) / 2, (p.u0 + p.u1) / 2], [0.55, 0.11, p.u1 - p.u0], wallColor, 'climb-facade-course');
    }
  }
  return { floors };
}

/** Choose a conflict-free stair corner and the house's few openings. */
export function planHouse(b, index, { hash, obstacles, doorOpen, roofAccess, blockedSides = [], windows = true }) {
  const floors = storeyFloors(b.height);
  let layout = null, hatchFree = true;
  // Prefer the corner without anything standing over the hatch.
  for (const [sx, sz] of [[1, -1], [-1, -1], [1, 1], [-1, 1]]) {
    const L = coreLayout(b, sx, sz);
    if (obstacles.some((o) => overlaps(L.hole, o, 0.35))) continue;
    layout = L;
    break;
  }
  if (!layout) {
    layout = coreLayout(b, 1, -1);
    hatchFree = false; // never cut a hatch under a roof structure
  }
  // Under a low top storey the roof flight would leave too little headroom.
  const topRoom = b.height - floors[floors.length - 1];
  if (topRoom < 2.5) hatchFree = false;
  roofAccess = roofAccess && hatchFree;
  const grid = (windows ? windowGrid(b) : []).filter((w) => {
    if (w.ground) return false;
    if (w.face === 'z' && w.side === b.stairSide) return false;
    if (blockedSides.some((s) => s.face === w.face && s.side === w.side && w.row < s.top + 0.6)) return false;
    // Not behind the stair core.
    const c = layout.core;
    if (w.face === 'x' && w.side === layout.sx && w.u > c.z0 - 1 && w.u < c.z1 + 1) return false;
    if (w.face === 'z' && w.side === layout.sz && w.u > c.x0 - 1 && w.u < c.x1 + 1) return false;
    // Art Deco blades cover the central top-row bays.
    if ((b.variant === 0 || b.variant === 3) && w.face === 'z' && Math.abs(w.u - b.x) < 1.6 && w.row > b.height - 4.3) return false;
    const top = Math.min(w.floor + SILL + OPEN_H, b.height - SLAB - 0.2);
    return top - (w.floor + SILL) >= 1.9 && floors.some((f) => Math.abs(f - w.floor) < 0.01);
  });
  // Every house needs a way in: without a usable window the hatch is it.
  if (!grid.length && hatchFree) roofAccess = true;
  const want = roofAccess ? (hash(index, 7) < 0.4 ? 1 : 0) : 1 + (hash(index, 11) < 0.45 ? 1 : 0);
  const openings = [];
  const pool = [...grid];
  for (let n = 0; n < want && pool.length; n++) {
    const pick = pool.splice(Math.floor(hash(index * 13 + n, 3) * pool.length), 1)[0];
    openings.push({ ...pick, top: Math.min(pick.floor + SILL + OPEN_H, b.height - SLAB - 0.2) });
    // Spread them out: never two on the same face.
    for (let k = pool.length - 1; k >= 0; k--) if (pool[k].face === pick.face && pool[k].side === pick.side) pool.splice(k, 1);
  }
  if (doorOpen) {
    const doorSide = b.stairSide === 1 ? -1 : 1;
    const bays = Math.floor((b.width - 1) / 2.8);
    const k = Math.floor(bays / 2);
    const u = b.x + (k - (bays - 1) / 2) * 2.8;
    openings.push({ face: 'z', side: doorSide, u, row: 1.53, floor: 0.02, door: true });
  }
  return { layout, roofAccess, openings, floors };
}

/**
 * A single hollow room standing on a roof (roof annex, stair shed): walls,
 * ceiling, one open doorway and climb courses outside. `door` = {face, side, u}.
 */
export function buildRoom(box, { x, z, width: W, depth: D, base, height: Hr, color, style, door, doorW = 1.1, doorH = 2.1 }) {
  const top = base + Hr;
  const hole = (face, side) => (door.face === face && door.side === side ? [{ u0: door.u - doorW / 2, u1: door.u + doorW / 2, v0: base, v1: base + doorH }] : []);
  for (const side of [-1, 1]) {
    for (const p of wallPieces(x - W / 2, x + W / 2, base, top, hole('z', side)))
      box([(p.u0 + p.u1) / 2, (p.v0 + p.v1) / 2, z + side * (D / 2 - WALL / 2)], [p.u1 - p.u0, p.v1 - p.v0, WALL], color, 'room-wall', style);
    for (const p of wallPieces(z - D / 2 + WALL, z + D / 2 - WALL, base, top, hole('x', side)))
      box([x + side * (W / 2 - WALL / 2), (p.v0 + p.v1) / 2, (p.u0 + p.u1) / 2], [WALL, p.v1 - p.v0, p.u1 - p.u0], color, 'room-wall', style);
  }
  box([x, top - SLAB / 2, z], [W - 2 * WALL, SLAB, D - 2 * WALL], color, 'room-ceiling', style);
  // Courses as on the houses, cut at the doorway. The first one sits above
  // head height: at 1.8 m runners on the roof struck it before any wall run.
  for (let y = base + 2.2; y < top - 0.3; y += 1.6) {
    const v0 = y - 0.11, v1 = y;
    for (const side of [-1, 1]) {
      const cutAt = (face) => hole(face, side).filter((h) => h.v0 < v1 + 0.05 && h.v1 > v0 - 0.05).map((h) => ({ u0: h.u0 - 0.05, u1: h.u1 + 0.05, v0: v0 - 1, v1: v1 + 1 }));
      for (const p of wallPieces(x - W / 2 - 0.25, x + W / 2 + 0.25, v0, v1, cutAt('z')))
        box([(p.u0 + p.u1) / 2, (v0 + v1) / 2, z + side * (D / 2 - 0.025)], [p.u1 - p.u0, 0.11, 0.55], color, 'climb-facade-course');
      for (const p of wallPieces(z - D / 2 - 0.25, z + D / 2 + 0.25, v0, v1, cutAt('x')))
        box([x + side * (W / 2 - 0.025), (v0 + v1) / 2, (p.u0 + p.u1) / 2], [0.55, 0.11, p.u1 - p.u0], color, 'climb-facade-course');
    }
  }
}
