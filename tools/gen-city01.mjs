#!/usr/bin/env node
/**
 * Generator für public/levels/city01.json — „Rooftops District" (Task 17).
 *
 * Aufbau: 4 Häuserzeilen (A–D, je 8–9 Gebäude, Grundfläche 14×14 m) im
 * Raster: Pitch 17.5 m in x (3.5-m-Sprunglücken innerhalb der Zeile),
 * 25 m in z (11-m-Straßen zwischen den Zeilen). Straßen werden über
 * geneigte Balance-Rails, Schwungstangen-Reihen und Hangel-Slabs
 * überquert; Kletterhäuschen, Vault-Kästen, Wallrun-Wände und Marker
 * liegen auf den Dächern. Treppen führen an 4 Stellen zurück nach oben.
 *
 * Aufruf: node tools/gen-city01.mjs   (schreibt die JSON-Datei direkt)
 */
import { writeFileSync } from 'node:fs';

const W = 14; // Gebäude-Grundfläche
const PITCH = 17.5; // Abstand der Gebäudezentren in x
const X0 = -70;
const GRAYS = ['#8f959e', '#a5adb8', '#7c828c'];
const TERRA = '#c96f4a';
const YELLOW = '#e8c547';

// Zeilen: z-Zentrum + Dachhöhen pro Spalte (Sprünge aufwärts max +1 m)
const rows = [
  { name: 'A', z: -45, heights: [10, 11, 9, 8, 9, 7, 8, 6] },
  { name: 'B', z: -20, heights: [14, 13, 14, 12, 11, 12, 10, 9] },
  { name: 'C', z: 5, heights: [8, 9, 7, 8, 6, 7, 5, 6] },
  { name: 'D', z: 30, heights: [12, 11, 12, 10, 9, 8, 9, 6] },
];
const bx = (i) => X0 + PITCH * i; // Spaltenzentrum
const h = (r, i) => rows[r].heights[i];
const rz = (r) => rows[r].z;

const boxes = [];
const rails = [];
const markers = [];

// --- Straßenniveau (Riesenfläche -> bewusst kein Precision-/Ledge-Ziel)
boxes.push({ pos: [5, -0.5, -7.5], size: [220, 1, 135], color: '#6b6f75' });

// --- Gebäude
for (let r = 0; r < rows.length; r++) {
  rows[r].heights.forEach((height, i) => {
    boxes.push({
      pos: [bx(i), height / 2, rz(r)],
      size: [W, height, W],
      color: GRAYS[(r + i) % 3],
      instanced: true,
    });
  });
}
// Landmarken-Türme östlich (Spalte x=70)
boxes.push({ pos: [70, 10, -20], size: [14, 20, 14], color: TERRA });
boxes.push({ pos: [70, 9, 30], size: [14, 18, 14], color: GRAYS[1] });
boxes.push({ pos: [70, 3.5, -45], size: [14, 7, 14], color: GRAYS[0], instanced: true });
boxes.push({ pos: [70, 3, 5], size: [14, 6, 14], color: GRAYS[2], instanced: true });

// --- Vault-Kästen (Lüftung) auf den Lauflinien
for (const [r, i] of [[0, 1], [0, 4], [1, 2], [1, 3], [1, 5], [2, 1], [2, 3], [3, 2], [3, 4], [3, 6]]) {
  boxes.push({
    pos: [bx(i), h(r, i) + 0.45, rz(r) + 2],
    size: [2.4, 0.9, 0.6],
    color: YELLOW,
    instanced: true,
  });
}

// --- Kletterhäuschen (3 m — nur per Wandlauf + Mantle erreichbar)
for (const [r, i] of [[0, 2], [1, 0], [1, 6], [2, 4], [3, 0]]) {
  boxes.push({
    pos: [bx(i) - 3, h(r, i) + 1.5, rz(r) - 3],
    size: [3, 3, 3],
    color: '#5d646e',
    instanced: true,
  });
}

// --- Wallrun-Wände (Reklamewände) über Zeilenlücken
const wallGaps = [[0, 1], [0, 4], [1, 5], [2, 2], [3, 3], [3, 6]]; // [Zeile, linke Spalte]
for (const [r, i] of wallGaps) {
  const top = Math.max(h(r, i), h(r, i + 1));
  boxes.push({
    pos: [bx(i) + PITCH / 2, top + 2, rz(r)],
    size: [5.5, 4, 0.5],
    color: TERRA,
    instanced: true,
  });
}

// --- Geneigte Balance-Rails über die Straßen (hoch -> runter)
const slopedRails = [
  { x: bx(1), from: [1, -27], to: [0, -38] }, // B1(13) -> A1(11)
  { x: bx(4), from: [1, -13], to: [2, -2] },  // B4(11) -> C4(6)
  { x: bx(2), from: [3, 23], to: [2, 12] },   // D2(12) -> C2(7)
  { x: bx(6), from: [3, 23], to: [2, 12] },   // D6(9)  -> C6(5)
];
for (const rail of slopedRails) {
  const [rHi, zHi] = rail.from;
  const [rLo, zLo] = rail.to;
  const iHi = Math.round((rail.x - X0) / PITCH);
  rails.push({
    points: [
      [rail.x, h(rHi, iHi) + 0.4, zHi],
      [rail.x, h(rLo, iHi) + 0.4, zLo],
    ],
  });
}
// Balance-Rails entlang von Dachkanten
rails.push({ points: [[bx(2) + 7, h(0, 2) + 0.4, -52], [bx(2) + 7, h(0, 2) + 0.4, -38]] });
rails.push({ points: [[bx(4) - 7, h(1, 4) + 0.4, -27], [bx(4) + 7, h(1, 4) + 0.4, -27]] });
rails.push({ points: [[bx(1) - 7, h(2, 1) + 0.4, -2], [bx(1) + 7, h(2, 1) + 0.4, -2]] });
rails.push({ points: [[bx(4) + 7, h(3, 4) + 0.4, 23], [bx(4) + 7, h(3, 4) + 0.4, 37]] });

// --- Schwungstangen-Reihen (Rails mit Freiraum darunter, von hoch nach tief)
const barRows = [
  { x: bx(3), y: h(1, 3) + 1, zs: [-28.5, -32, -35.5] }, // B3(12) -> A3(8)
  { x: bx(5), y: h(1, 5) + 1, zs: [-11.5, -8, -4.5] },   // B5(12) -> C5(7)
  { x: bx(0), y: h(3, 0) + 1, zs: [21.5, 18, 14.5] },    // D0(12) -> C0(8)
  { x: bx(5), y: h(3, 5) + 1, zs: [21.5, 18, 14.5] },    // D5(8)  -> C5(7)
];
for (const row of barRows) {
  for (const z of row.zs) {
    rails.push({ points: [[row.x - 2, row.y, z], [row.x + 2, row.y, z]] });
  }
}

// --- Hangel-Slabs über die Straßen (per Sprung greifen, rüberhangeln)
const slabs = [
  { x: bx(3), zc: 17.5, top: h(2, 3) + 3.1 },  // C3(8) -> D3(10)
  { x: bx(6), zc: -32.5, top: h(0, 6) + 3.1 }, // A6(8) -> B6(10)
  { x: bx(1), zc: 17.5, top: h(2, 1) + 3.1 },  // C1(9) -> D1(11)
];
for (const s of slabs) {
  boxes.push({
    pos: [s.x, s.top - 0.15, s.zc],
    size: [1.2, 0.3, 12],
    color: '#4a4f57',
    instanced: true,
  });
}

// --- Treppen zurück nach oben (4 Stellen, identische Stufen -> 1 Instanz-Gruppe)
// Stufen [3 x 0.4 x 0.9], Steigung 0.38 (Autostep schafft 0.4)
const stairs = [
  { r: 0, i: 7, side: 1 },  // A7 (h6), Nordseite
  { r: 2, i: 4, side: 1 },  // C4 (h6)
  { r: 2, i: 6, side: -1 }, // C6 (h5), Südseite
  { r: 3, i: 7, side: -1 }, // D7 (h6)
];
for (const st of stairs) {
  const height = h(st.r, st.i);
  const n = height <= 5 ? 13 : 16;
  const zEdge = rz(st.r) + st.side * (W / 2 + 0.7);
  for (let k = 0; k < n; k++) {
    boxes.push({
      pos: [bx(st.i) + 6 - 0.9 * (n - 1 - k), 0.2 + 0.38 * k, zEdge],
      size: [3, 0.4, 0.9],
      color: '#787d84',
      instanced: true,
    });
  }
}

// --- Gap-Marker: 8 Zeilenlücken + 4 Straßenquerungen
const gapRowSpots = [...wallGaps, [1, 1], [2, 5]];
gapRowSpots.forEach(([r, i], n) => {
  markers.push({
    type: 'gap',
    id: `gap-row-${rows[r].name}${i}`,
    pos: [bx(i) + PITCH / 2, Math.max(h(r, i), h(r, i + 1)) + 1.2, rz(r)],
    size: [3.4, 2.5, 6],
  });
});
const streetGaps = [
  { x: bx(1), y: 13, z: -32.5 }, // über Rail B1->A1
  { x: bx(3), y: 12.5, z: -32 }, // über Stangenreihe B3->A3
  { x: bx(4), y: 11.5, z: -7.5 },
  { x: bx(0), y: 12.5, z: 17.5 },
];
streetGaps.forEach((g, n) => {
  markers.push({
    type: 'gap',
    id: `gap-street-${n}`,
    pos: [g.x, g.y, g.z],
    size: [4, 2.5, 10.5],
  });
});

// --- Precision-Pads (zusätzlich zur überall aktiven Kanten-Precision)
for (const [r, i] of [[0, 6], [1, 4], [2, 0], [2, 5], [3, 5], [3, 6]]) {
  markers.push({
    type: 'precision',
    id: `prec-${rows[r].name}${i}`,
    pos: [bx(i) + 4, h(r, i), rz(r) + 4],
  });
}

// --- Sammelobjekte (Task 18): 20 Collectibles auf interessanten Routen
let colN = 0;
const pushCol = (pos) => {
  colN++;
  markers.push({ type: 'collectible', id: `col-${String(colN).padStart(2, '0')}`, pos });
};

// Über den 4 geneigten Balance-Rails (Mitte, 0.8 m über der Rail)
for (const rail of slopedRails) {
  const [rHi, zHi] = rail.from;
  const [rLo, zLo] = rail.to;
  const iHi = Math.round((rail.x - X0) / PITCH);
  const yHi = h(rHi, iHi) + 0.4;
  const yLo = h(rLo, iHi) + 0.4;
  pushCol([rail.x, (yHi + yLo) / 2 + 0.8, (zHi + zLo) / 2]);
}

// Über den Schwungstangen-Reihen (zwischen Stange 1 und 2, auf Stangenhöhe)
for (const row of barRows) {
  pushCol([row.x, row.y, (row.zs[0] + row.zs[1]) / 2]);
}

// Über 5 Dachlücken (1 m über Dachniveau)
for (const [r, i] of gapRowSpots.slice(0, 5)) {
  pushCol([bx(i) + PITCH / 2, Math.max(h(r, i), h(r, i + 1)) + 1, rz(r)]);
}

// Auf 3 Kletterhäuschen-Dächern (+0.8 über deren Top)
for (const [r, i] of [[0, 2], [1, 6], [3, 0]]) {
  pushCol([bx(i) - 3, h(r, i) + 3 + 0.8, rz(r) - 3]);
}

// Rest auf Dachkanten
for (const [r, i, dx, dz] of [[0, 7, 5, -5], [1, 7, -5, 5], [2, 7, 5, -5], [3, 1, -5, 5]]) {
  pushCol([bx(i) + dx, h(r, i) + 1, rz(r) + dz]);
}

// --- Zeitrennen (Task 19): Start auf B3, über die B-Zeile westwärts,
//     Rail runter zur A-Zeile, ostwärts über die Dachlücken zum Finish
markers.push({ type: 'trialStart', id: 'trial-1', pos: [bx(3), h(1, 3) + 1.3, -25] });
const cps = [
  [bx(2), h(1, 2) + 1.4, -20], // cp1 B2
  [bx(1), h(1, 1) + 1.4, -20], // cp2 B1
  [bx(1), 12.4, -32.5],        // cp3 auf der geneigten Rail B1->A1
  [bx(1), h(0, 1) + 1.4, -45], // cp4 A1
  [bx(2), h(0, 2) + 1.4, -45], // cp5 A2
  [bx(3), h(0, 3) + 1.4, -45], // cp6 A3
  [bx(4), h(0, 4) + 1.4, -45], // cp7 A4
  [bx(5), h(0, 5) + 1.4, -45], // cp8 A5
];
cps.forEach((pos, i) => markers.push({ type: 'checkpoint', id: `cp${i + 1}`, pos }));
markers.push({ type: 'finish', id: 'finish-1', pos: [bx(6), h(0, 6) + 1.4, -45] });

const level = {
  name: 'Rooftops District',
  spawn: [bx(3), h(1, 3) + 0.1, -20], // B3, mittelhohes Dach
  boxes,
  ramps: [],
  rails,
  markers,
  trialTimes: { gold: 60000, silver: 80000, bronze: 100000 },
};

writeFileSync(
  new URL('../public/levels/city01.json', import.meta.url),
  JSON.stringify(level, null, 1) + '\n',
);
console.log(
  `city01.json: ${boxes.length} Boxen, ${rails.length} Rails, ${markers.length} Marker`,
);
