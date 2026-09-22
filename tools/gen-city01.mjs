#!/usr/bin/env node
/**
 * Generator für public/levels/city01.json — „Rooftops District"
 * (Task 17, Stadtbild-Pass 17b, Aufweitung 2026-08-24).
 *
 * STADTRASTER: 4 Häuserzeilen A–D mit je 8 Gebäuden. Alle Maße hängen an den
 * drei Konstanten PITCH (Spaltenabstand), ROW_GAP (Zeilenabstand) und den
 * Dachhöhen — im Level steht keine Straßenkoordinate mehr absolut, sondern
 * alles relativ zu `bx(i)`, `rz(r)` und `streetZ(r)`. Damit lässt sich das
 * Viertel an einer Stelle weiten, ohne dass die Spots verrutschen.
 *
 * Aufweitung 2026-08-24: PITCH 17.5 → 20.5, ROW_GAP 25 → 30. Die Häuser
 * wachsen mit (Dächer ~17 × 16 m statt 14 × 14), die Straßen werden von 11 auf
 * ~14 m breit, die Sprunglücken bleiben bei 3.2–4.8 m. Gleichzeitig ist die
 * Dachtechnik ausgedünnt: vorher stand auf jedem Dach ein Aufbau, jetzt auf
 * gut der Hälfte. Ziel war nicht „mehr Stadt", sondern Luft zwischen den
 * Dingen — vorher lag alles so dicht, dass man die Routen nicht mehr gelesen
 * hat.
 *
 * Jedes Objekt ist zugleich Parkour-Element: Autos und Bänke sind Vaults,
 * Bushaltestellen und Container Absätze, Feuerleitern und Gerüste
 * Kletterrouten, Geländer und Gerüststangen Balance- und Schwungziele.
 * Nichts wird nur zur Zierde gebaut.
 *
 * Draw-Calls bleiben niedrig, weil fast alles über `style` in den Stadt-Batch
 * geht (siehe src/level/CityFacade.ts): ein InstancedMesh pro Stil, egal wie
 * viele Boxen unterschiedlicher Größe.
 *
 * Aufruf: node tools/gen-city01.mjs   (schreibt die JSON-Datei direkt)
 */
import { writeFileSync } from 'node:fs';

// ============================================================ Raster
const PITCH = 20.5; // Abstand der Gebäudezentren in x
const ROW_GAP = 30; // Abstand der Zeilenmitten in z
const X0 = -70;
const Z0 = -54;
const HEIGHTS = [
  { name: 'A', heights: [10, 11, 9, 8, 9, 7, 8, 6] },
  { name: 'B', heights: [14, 13, 14, 12, 11, 12, 10, 9] },
  { name: 'C', heights: [8, 9, 7, 8, 6, 7, 5, 6] },
  { name: 'D', heights: [12, 11, 12, 10, 9, 8, 9, 6] },
];
const rows = HEIGHTS.map((r, k) => ({ ...r, z: Z0 + ROW_GAP * k }));
const bx = (i) => X0 + PITCH * i;
const h = (r, i) => rows[r].heights[i];
const rz = (r) => rows[r].z;
/** Mitte der Straße zwischen Zeile r und r+1. */
const streetZ = (r) => rz(r) + ROW_GAP / 2;
/** Maßstab gegenüber dem alten 17.5er-Raster — für handgesetzte x-Positionen. */
const SCALE = PITCH / 17.5;
const sx = (x) => +(x * SCALE).toFixed(2);

const boxes = [];
const ramps = [];
const rails = [];
const markers = [];
const scenery = { buildings: [], cars: [], trees: [], lamps: [], signs: [] };

/** Deterministischer Pseudo-Zufall — der Stadtplan ist bei jedem Lauf gleich. */
const hash = (a, b) => {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// Kurzformen: alles ohne eigenen Stil geht in den einfarbigen Stadt-Batch
const box = (pos, size, color, extra) =>
  boxes.push({ pos, size, color, style: 'plain', ...extra });
/** Reine Deko: kein Collider, keine Kante (Markierungen, Kulisse). */
const deco = (pos, size, color, extra) =>
  boxes.push({ pos, size, color, style: 'plain', solid: false, ...extra });
const rail = (a, b) => rails.push({ points: [a, b] });

// Farbwelt: warmer Altbaubestand, kühle Nachkriegsbauten, Beton, Ziegel
const FACADES = [
  { color: '#e1c7a5', style: 'windows-mixed' }, // Sandstein-Altbau
  { color: '#d99c8c', style: 'windows-mixed' }, // Ziegelrot
  { color: '#c5d4cb', style: 'windows-grid' }, // Betongrau
  { color: '#d8d2bd', style: 'windows-grid' },
  { color: '#9fbeb9', style: 'windows-strip' }, // Bandfassade, Nachkriegsbau
  { color: '#c9c3b4', style: 'windows-strip' },
];
const ASPHALT = '#343b40';
const CONCRETE = ['#9aa0a3', '#b3b8bc', '#8b9094'];
const CURB = '#a9aeb3';
const METAL = '#5d646e';
const PLINTH = '#6a7078'; // Sockelzone
const TERRA = '#c96f4a';
const YELLOW = '#e8c547';
const GREEN = '#5f7a4a';

// ============================================================ Grundstücke
// Fugen zwischen den Spalten bestimmen, wie städtisch die Zeile wirkt:
//   jump   — Sprunglücke (3.2–4.8 m), die klassische Dachlinie
//   alley  — enge Gasse (~2.5 m): Wandsprung-Kamin mit Feuerleiter
//   infill — Lückenbau: ein niedrigerer Riegel schließt den Block
const JOINTS = {
  A: ['jump', 'jump', 'alley', 'jump', 'jump', 'infill', 'jump'],
  B: ['jump', 'jump', 'alley', 'infill', 'jump', 'jump', 'jump'],
  C: ['infill', 'jump', 'jump', 'alley', 'jump', 'jump', 'infill'],
  D: ['jump', 'infill', 'jump', 'jump', 'alley', 'jump', 'jump'],
};
const GAP_TARGET = { alley: 2.5, infill: 4.4 };
const START_WIDTH = { A: 15.7, B: 17.1, C: 15.2, D: 16.6 };

/** Grundflächen der Zeile aus den Fugen ableiten (Zentren bleiben im Raster). */
const layoutRow = (r) => {
  const joints = JOINTS[rows[r].name];
  const w = [START_WIDTH[rows[r].name]];
  for (let i = 0; i < joints.length; i++) {
    const target =
      joints[i] === 'jump' ? 3.2 + hash(r * 3 + 1, i) * 1.6 : GAP_TARGET[joints[i]];
    const next = Math.min(19, Math.max(13.5, 2 * (PITCH - target) - w[i]));
    w.push(next);
  }
  // Tiefe so gewählt, dass zwischen zwei Zeilen ~14 m Straße bleiben
  const d = w.map((_, i) => 14 + hash(i * 5 + 2, r * 7) * 3.5);
  const gap = joints.map((_, i) => PITCH - (w[i] + w[i + 1]) / 2);
  return { w, d, gap, joints };
};
const plots = rows.map((_, r) => layoutRow(r));
const W = (r, i) => plots[r].w[i]; // Breite in x
const D = (r, i) => plots[r].d[i]; // Tiefe in z
/** Nordkante (kleineres z) und Südkante eines Grundstücks. */
const zN = (r, i) => rz(r) - D(r, i) / 2;
const zS = (r, i) => rz(r) + D(r, i) / 2;

// ============================================================ Rohbauten
for (let r = 0; r < rows.length; r++) {
  for (let i = 0; i < 8; i++) {
    const height = h(r, i);
    const f = FACADES[Math.floor(hash(r * 11 + 3, i * 13) * FACADES.length)];
    boxes.push({
      pos: [bx(i), height / 2, rz(r)],
      size: [W(r, i), height, D(r, i)],
      color: f.color,
      style: 'plain',
    });
    const stairSide = ({7:1,20:1,22:-1,31:-1})[r*8+i] ?? 0;
    scenery.buildings.push({ stairSide, x: bx(i), z: rz(r), width: W(r,i), depth: D(r,i), height, color: f.color, variant: (r * 3 + i) % 4 });
    const bays = Math.floor((W(r,i)-1)/2.8);
    for (const side of [-1,1]) for(let k=0;k<bays;k++) {
      if (side === stairSide) continue;
      const wx=bx(i)+(k-(bays-1)/2)*2.8;
      const front=rz(r)+side*(D(r,i)/2+.06);
      box([wx,2.87,front+side*.5],[2.5,.13,1.05],f.color,{invisible:true});
      if((r*3+i)%4===1 && k%2===0) for(let y=4.7;y<height-1;y+=3.2) {
        box([wx,y-.98,front+side*.58],[2.25,.16,1.2],f.color,{invisible:true});
      }
    }
    // Sockelzone: dunklerer, leicht vorstehender Fuß — gibt der Fassade
    // Maßstab und nebenbei einen 1.4-m-Absatz zum Aufsteigen
    box([bx(i), 0.7, rz(r)], [W(r, i) + 0.12, 1.4, D(r, i) + 0.12], '#9eaaab');

    // Staffelgeschoss auf den hohen Häusern. B3 bleibt frei: dort steht der
    // Spawn, und ein Aufbau direkt davor verstellt den ersten Blick.
    if (height >= 11 && !(r === 1 && i === 3)) {
      const th = 2.4 + hash(r, i * 3) * 1.6;
      boxes.push({
        // Bündig mit der Südfassade und nur auf der hinteren Hälfte: die
        // Dachmitte bleibt als Lauflinie frei
        pos: [bx(i) + (hash(i, r) - 0.5) * 2, height + th / 2, rz(r) + D(r, i) * 0.3],
        size: [W(r, i) * 0.55, th, D(r, i) * 0.4],
        color: f.color,
        style: f.style,
      });
    }
  }
}

// Lückenbauten: schließen den Block und liegen 1.4 m unter dem niedrigeren
// Nachbarn — ein Schritt runter, ein Sprung wieder rauf
for (let r = 0; r < rows.length; r++) {
  plots[r].joints.forEach((kind, i) => {
    if (kind !== 'infill') return;
    const top = Math.min(h(r, i), h(r, i + 1)) - 1.4;
    const xL = bx(i) + W(r, i) / 2 - 0.6;
    const xR = bx(i + 1) - W(r, i + 1) / 2 + 0.6;
    const depth = Math.min(D(r, i), D(r, i + 1)) - 1.2;
    boxes.push({
      pos: [(xL + xR) / 2, top / 2, rz(r)],
      size: [xR - xL, top, depth],
      color: '#9c8f7e',
      style: 'windows-strip',
    });
    // Attika-Rand des Lückenbaus: schmale Balance-Kante zur Straße
    rail(
      [xL + 0.3, top + 0.4, rz(r) - depth / 2 + 0.3],
      [xR - 0.3, top + 0.4, rz(r) - depth / 2 + 0.3],
    );
  });
}

// Landmarken-Türme östlich (eine Spalte hinter dem Raster)
const TOWER_X = bx(8);
const towers = [
  { r: 1, height: 20, color: TERRA, style: 'windows-mixed' },
  { r: 3, height: 18, color: '#93a3a8', style: 'windows-strip' },
  { r: 0, height: 7, color: '#a8adb4', style: 'windows-grid' },
  { r: 2, height: 6, color: '#c08a63', style: 'windows-mixed' },
];
for (const t of towers) {
  boxes.push({
    pos: [TOWER_X, t.height / 2, rz(t.r)],
    size: [15, t.height, 14],
    color: t.color,
    style: t.style,
  });
  box([TOWER_X, 0.7, rz(t.r)], [15.5, 1.4, 14.5], PLINTH);
}

// ============================================================ Dachlandschaft
// Attika (Brüstung) an den Straßenseiten, mit 6 m breiter Öffnung in der
// Dachmitte: die Querungen (Rails, Stangen, Slabs) setzen dort an, und die
// Lauflinie über die Dächer bleibt frei.
for (let r = 0; r < rows.length; r++) {
  for (let i = 0; i < 8; i++) {
    if (hash(r * 17, i * 19) > 0.6) continue; // nicht auf jedem Dach
    const height = h(r, i);
    const armLen = (W(r, i) - 6) / 2;
    if (armLen < 1.5) continue;
    for (const side of [-1, 1]) {
      // Staffelgeschoss steht auf der Südhälfte — dort keine Attika
      if (side === 1 && height >= 11) continue;
      const zEdge = rz(r) + (side * D(r, i)) / 2 - side * 0.2;
      for (const dir of [-1, 1]) {
        box(
          [bx(i) + dir * (3 + armLen / 2), height + 0.25, zEdge],
          [armLen, 0.5, 0.35],
          CONCRETE[1],
        );
      }
    }
  }
}

// Dachtechnik: Lüfter (vaultbar), Wassertanks, Oberlichter. Auf der Nordhälfte,
// damit Lauflinie und Staffelgeschoss frei bleiben — und bewusst nur auf gut
// der Hälfte der Dächer: vorher war jedes Dach zugestellt und die Routen
// darüber schlecht zu lesen.
for (let r = 0; r < rows.length; r++) {
  for (let i = 0; i < 8; i++) {
    if (hash(r * 7 + 2, i * 5) > 0.58) continue;
    const y = h(r, i);
    const zTech = rz(r) - D(r, i) * 0.28;
    const pick = hash(r * 23 + 5, i * 29);
    if (pick < 0.4) {
      // Lüftungsblock + zwei Rohre
      box([bx(i) - 2.5, y + 0.35, zTech], [1.6, 0.7, 1.2], METAL);
      box([bx(i) + 1.2, y + 0.6, zTech - 0.6], [0.45, 1.2, 0.45], METAL);
      box([bx(i) + 2.0, y + 0.45, zTech - 0.6], [0.45, 0.9, 0.45], METAL);
    } else if (pick < 0.7) {
      // Wassertank auf Stelzen — Unterschlupf und Mantle-Ziel
      for (const dx of [-1.1, 1.1]) {
        for (const dz of [-1.1, 1.1]) {
          box([bx(i) + dx, y + 0.9, zTech + dz], [0.25, 1.8, 0.25], METAL);
        }
      }
      box([bx(i), y + 2.6, zTech], [3.2, 1.8, 3.2], '#7a6a55');
    } else {
      // Oberlichter-Reihe (flach, vaultbar)
      for (let k = 0; k < 3; k++) {
        box([bx(i) - 3 + k * 3, y + 0.3, zTech], [2.2, 0.6, 1.6], '#7f8a92');
      }
    }
    // Schornstein und Antennenmast als Silhouette — sparsam gesetzt
    if (hash(i * 31, r * 37) > 0.7) {
      box([bx(i) + W(r, i) / 2 - 1.6, y + 1.1, zTech + 1.8], [0.9, 2.2, 0.9], '#8a6a5a');
    }
    if (hash(i * 41, r * 43) > 0.8) {
      deco([bx(i) - W(r, i) / 2 + 1.4, y + 2.8, zTech], [0.14, 5.6, 0.14], METAL);
      deco([bx(i) - W(r, i) / 2 + 1.4, y + 4.4, zTech], [1.2, 0.1, 0.1], METAL);
    }
  }
}

// Dachaufbauten mit Funktion: Treppenhäuschen (3 m — nur per Wandlauf und
// Mantle erreichbar)
const SHEDS = [[0, 2], [1, 0], [1, 6], [2, 4], [3, 0]];
for (const [r, i] of SHEDS) {
  const x = bx(i) - 3;
  const z = rz(r) - 3;
  box([x, h(r, i) + 1.5, z], [3, 3, 3], '#5d646e');
  deco([x, h(r, i) + 1.05, z + 1.55], [1.1, 2.1, 0.12], '#3f454d'); // Tür
  rail([x - 1.3, h(r, i) + 3.4, z - 1.3], [x + 1.3, h(r, i) + 3.4, z - 1.3]);
}

// Reklametafeln über den Sprunglücken: Wandlauf-Ziele
const wallGaps = [[0, 1], [0, 4], [1, 5], [2, 2], [3, 3], [3, 6]];
for (const [r, i] of wallGaps) {
  const top = Math.max(h(r, i), h(r, i + 1));
  const xm = bx(i) + PITCH / 2;
  box([xm, top + 2, rz(r)], [5.5, 4, 0.5], TERRA);
  deco([xm, top + 4.35, rz(r)], [5.5, 0.3, 0.7], METAL); // Beleuchtungsschiene
  for (const dx of [-2.2, 2.2]) deco([xm + dx, top - 0.4, rz(r)], [0.2, 0.9, 0.2], METAL);
}

// Vault-Kästen (Lüftung) auf den Lauflinien — Höhe 0.9 m
for (const [r, i] of [[0, 1], [0, 4], [1, 2], [1, 3], [1, 5], [2, 1], [2, 3], [3, 2], [3, 4], [3, 6]]) {
  box([bx(i), h(r, i) + 0.45, rz(r) + 2], [2.4, 0.9, 0.6], '#879b98');
}

// ============================================================ Dach-Querungen
// Geneigte Balance-Rails über die Straßen (hoch -> runter)
const slopedRails = [
  { i: 1, hi: 1, lo: 0 }, // B1(13) -> A1(11)
  { i: 4, hi: 1, lo: 2 }, // B4(11) -> C4(6)
  { i: 2, hi: 3, lo: 2 }, // D2(12) -> C2(7)
  { i: 6, hi: 3, lo: 2 }, // D6(9)  -> C6(5)
];
for (const s of slopedRails) {
  const down = rz(s.hi) < rz(s.lo); // Richtung der Querung in z
  s.zHi = down ? zS(s.hi, s.i) : zN(s.hi, s.i);
  s.zLo = down ? zN(s.lo, s.i) : zS(s.lo, s.i);
  s.yHi = h(s.hi, s.i) + 0.4;
  s.yLo = h(s.lo, s.i) + 0.4;
  rail([bx(s.i), s.yHi, s.zHi], [bx(s.i), s.yLo, s.zLo]);
}

// Balance-Rails entlang von Dachkanten (immer 1 m innerhalb der Kante)
const edgeRail = (r, i, along) => {
  const y = h(r, i) + 0.4;
  if (along === 'z') {
    const x = bx(i) + W(r, i) / 2 - 1.5;
    rail([x, y, zN(r, i) + 1], [x, y, zS(r, i) - 1]);
  } else {
    const z = zN(r, i) + 0.6;
    rail([bx(i) - W(r, i) / 2 + 1, y, z], [bx(i) + W(r, i) / 2 - 1, y, z]);
  }
};
edgeRail(0, 2, 'z');
edgeRail(1, 4, 'x');
edgeRail(2, 1, 'x');
edgeRail(3, 4, 'z');

// Schwungstangen-Reihen über die Straßen. Anzahl aus der Straßenbreite: die
// Kette muss tatsächlich hinüberreichen, sonst hängt man über der Fahrbahn.
const barRows = [
  { i: 3, hi: 1, lo: 0 }, // B3(12) -> A3(8)
  { i: 5, hi: 1, lo: 2 }, // B5(12) -> C5(7)
  { i: 0, hi: 3, lo: 2 }, // D0(12) -> C0(8)
  { i: 5, hi: 3, lo: 2 }, // D5(8)  -> C5(7)
];
for (const b of barRows) {
  const down = rz(b.hi) < rz(b.lo);
  const from = down ? zS(b.hi, b.i) : zN(b.hi, b.i);
  const to = down ? zN(b.lo, b.i) : zS(b.lo, b.i);
  const dir = Math.sign(to - from);
  const span = Math.abs(to - from);
  const n = Math.max(3, Math.round(span / 3.5) - 1);
  const step = span / (n + 1);
  b.x = bx(b.i);
  b.y = h(b.hi, b.i) + 1;
  b.zs = [];
  for (let k = 1; k <= n; k++) {
    const z = from + dir * step * k;
    b.zs.push(z);
    rail([b.x - 2, b.y, z], [b.x + 2, b.y, z]);
  }
}

// Hangel-Slabs über die Straßen (per Sprung greifen, rüberhangeln)
const slabs = [
  { i: 3, a: 2, b: 3 }, // C3(8) -> D3(10)
  { i: 6, a: 0, b: 1 }, // A6(8) -> B6(10)
  { i: 1, a: 2, b: 3 }, // C1(9) -> D1(11)
];
for (const s of slabs) {
  s.x = bx(s.i);
  s.zc = streetZ(s.a);
  s.top = h(s.a, s.i) + 3.1;
  const len = zN(s.b, s.i) - zS(s.a, s.i) + 5;
  box([s.x, s.top - 0.15, s.zc], [1.2, 0.3, len], '#4a4f57');
}

// Fußgängerbrücke über die C–D-Straße: Stadtinfrastruktur und Route auf
// halber Höhe. Nicht über bx(4) — dort führt die Treppe C4 hoch, und ein Deck
// in Kopfhöhe blockiert den Autostep (siehe Kommentar bei den Treppen). Sie
// liegt deshalb in der Fuge zwischen C4 und C5 und verbindet beide Dächer.
const bridge = { x: bx(4) + PITCH / 2, y: 6.4, z: streetZ(2) };
{
  const { x, y, z } = bridge;
  const len = zN(3, 4) - zS(2, 4) + 6;
  box([x, y, z], [2.6, 0.3, len], CONCRETE[2]);
  for (const dx of [-1.35, 1.35]) {
    deco([x + dx, y + 1.1, z], [0.1, 0.1, len], METAL);
    deco([x + dx, y + 0.72, z], [0.08, 0.06, len], METAL);
    for (const dz of [-len / 3, 0, len / 3]) {
      deco([x + dx, y + 0.65, z + dz], [0.12, 0.9, 0.12], METAL);
    }
  }
  for (const dz of [-len / 2 + 1, len / 2 - 1]) box([x, y / 2, z + dz], [1.2, y, 1.2], CONCRETE[0]);
}

// ============================================================ Gassen
// Enge Fugen bekommen Feuerleitern: versetzte Podeste, die man sich
// hochmantelt — die Straße ist dadurch mit den Dächern verbunden.
const alleys = [];
for (let r = 0; r < rows.length; r++) {
  plots[r].joints.forEach((kind, i) => {
    if (kind !== 'alley') return;
    const xm = bx(i) + PITCH / 2;
    alleys.push({ r, i, xm, gap: plots[r].gap[i] });
    const top = Math.min(h(r, i), h(r, i + 1));
    const xL = bx(i) + W(r, i) / 2;
    const xR = bx(i + 1) - W(r, i + 1) / 2;
    // Podeste wechselseitig alle 2.5 m — Mantle-Kette bis unters Dach
    let side = 1;
    for (let y = 3.2; y <= top - 1.2; y += 2.5) {
      const x = side > 0 ? xL + 0.7 : xR - 0.7;
      box([x, y, rz(r)], [1.4, 0.2, 3.2], METAL);
      // Geländer bewusst als Deko: eine Rail auf Hüfthöhe würde beim
      // Vorbeilaufen als Schwungstange gegriffen
      deco([x, y + 0.6, rz(r) - 1.5], [1.4, 1.0, 0.08], METAL);
      deco([x, y + 0.6, rz(r) + 1.5], [1.4, 1.0, 0.08], METAL);
      side = -side;
    }
    // Müllcontainer als Einstieg (Vault-Höhe 1.1 m)
    box([xm, 0.55, zN(r, i) - 2.2], [1.9, 1.1, 1.2], '#4f6b52');
  });
}

// ============================================================ Straßenraum
// Fahrbahn: eine große Fläche (bewusst kein Precision-/Ledge-Ziel)
boxes.push({ pos: [10, -0.5, -5], size: [250, 1, 170], color: ASPHALT });

// Gehwege mit Bordstein an allen Zeilenkanten
for (let r = 0; r < rows.length; r++) {
  for (const side of [-1, 1]) {
    const zEdge = rz(r) + side * (Math.max(...plots[r].d) / 2 + 1.8);
    box([10, 0.075, zEdge], [200, 0.15, 3.4], CURB);
  }
}
// Mittelstreifen (gestrichelt) und Zebrastreifen an den Querungen
for (let r = 0; r < 3; r++) {
  const zc = streetZ(r);
  for (let x = -88; x <= 100; x += 6) deco([x, 0.02, zc], [3.2, 0.04, 0.22], '#d8d2be');
  for (const xc of [bx(2) + PITCH / 2, bx(5) + PITCH / 2]) {
    for (let k = -3; k <= 3; k++) deco([xc + k * 0.9, 0.02, zc], [0.5, 0.04, 9], '#e2ded0');
  }
}

// Laternen: Mast, Ausleger, Leuchte. Paarweise gegenüber — dazwischen hängt
// jeweils ein Straßenschild als Schwungstange auf 3 m.
for (let r = 0; r < 3; r++) {
  const zc = streetZ(r);
  for (let k = 0; k < 6; k++) {
    const x = bx(0) + 4 + k * PITCH * 1.4;
    for (const side of [-1, 1]) {
      const z = zc + side * 4.6;
      scenery.lamps.push({ x, z, side });
    }
    rail([x, 3.0, zc - 4.6], [x, 3.0, zc + 4.6]);
    deco([x, 3.35, zc], [1.6, 0.55, 0.08], YELLOW);
  }
}

// Parkende Autos am Bordstein: Vault-Linien (Kofferraum 1.1 m) und
// Trittsteine Richtung Feuerleiter
const CAR_COLORS = ['#7b3f3f', '#3f5b7b', '#c9c9c4', '#4a6b4a', '#8a7a3f', '#2f3438'];
const parkCar = (x, z, n) => {
  for (let k = 0; k < n; k++) {
    const cx = x + k * 5.4;
    const c = CAR_COLORS[Math.floor(hash(cx, z) * CAR_COLORS.length)];
    box([cx, 0.72, z], [4.4, 0.76, 1.9], c, { invisible: true }); // Karosserie
    box([cx - 0.2, 1.32, z], [2.3, 0.62, 1.75], c, { invisible: true }); // Aufbau
    scenery.cars.push({ x: cx, z, color: c }); // Schweller/Räder
  }
};
parkCar(sx(-58), streetZ(0) + 3.4, 4);
parkCar(sx(-4), streetZ(0) - 3.4, 3);
parkCar(sx(38), streetZ(0) + 3.4, 3);
parkCar(sx(-40), streetZ(2) - 3.4, 3);
parkCar(sx(20), streetZ(2) + 3.4, 4);
parkCar(sx(-62), streetZ(2) + 3.4, 3);

// Bushaltestelle: Dach auf 2.6 m als Absatz, Bank als Vault davor
const busStop = { x: sx(-30), z: streetZ(0) - 4.6 };
{
  const { x, z } = busStop;
  for (const dx of [-2.4, 2.4]) {
    for (const dz of [-1.1, 1.1]) deco([x + dx, 1.3, z + dz], [0.14, 2.6, 0.14], METAL);
  }
  box([x, 2.7, z], [5.6, 0.24, 2.8], '#6f7a82');
  box([x, 1.0, z - 1.15], [5.2, 0.06, 0.12], '#8fa3b0'); // Rückwand-Glas
  box([x + 0.2, 0.55, z + 0.4], [2.6, 0.55, 0.55], '#7a6a55'); // Bank
  deco([x + 3.4, 1.7, z], [0.12, 3.4, 0.12], METAL);
  deco([x + 3.4, 3.2, z], [0.9, 0.7, 0.1], TERRA); // Haltestellenschild
}

// Kiosk mit Vordach an der C–D-Straße
{
  const x = sx(4);
  const z = streetZ(2) - 3.3;
  box([x, 1.4, z], [4.2, 2.8, 3.0], '#b5643f');
  box([x, 2.95, z + 2.0], [4.8, 0.2, 1.6], TERRA); // Vordach — Absatz auf 3 m
  deco([x - 1.6, 1.5, z + 1.55], [1.4, 1.0, 0.08], '#3f454d'); // Verkaufsklappe
  box([x + 3.4, 0.6, z + 1.4], [0.6, 1.2, 0.6], '#4f6b52'); // Mülleimer
}

// Bäume und Pflanzkübel: Kübel sind Vaults, Kronen reine Silhouette
const tree = (x, z, s = 1) => {
  box([x, 0.45, z], [1.6, 0.9, 1.6], CONCRETE[2]); // Kübel (Vault)
  scenery.trees.push({ x, z, scale: s, palm: scenery.trees.length % 3 !== 2 });
};
for (const [x, dz, r] of [
  [-46, -4.9, 2], [-38, -4.9, 2], [12, -4.9, 2], [56, -4.9, 2],
  [-20, -2.1, 0], [30, -2.1, 0],
]) {
  tree(sx(x), streetZ(r) + dz, 0.9 + hash(x, dz) * 0.3);
}

// ============================================================ Baustelle
// Nordrand des Viertels: Gerüst über drei Ebenen, plus Containerlager.
// Ein Spot, der Klettern, Balancieren, Schwingen und Präzision verbindet.
const scaffold = { x: bx(2) - 6, z: zN(0, 2) - 8 };
{
  const x0 = scaffold.x;
  const z = scaffold.z;
  for (let lvl = 0; lvl < 3; lvl++) {
    const y = 2.8 + lvl * 2.8;
    box([x0 + 6, y, z], [13, 0.2, 2.0], '#a08a5e'); // Bohle
    deco([x0 + 6, y + 1.05, z - 0.9], [13, 1.0, 0.08], '#b0b5ba'); // Geländer (Deko)
    for (const dx of [0, 6, 12]) deco([x0 + dx, y + 1.4, z + 0.9], [0.12, 2.8, 0.12], '#8d9298');
    // Querstange auf Kopfhöhe über der Bohle: Schwungstange zwischen den Ebenen
    if (lvl < 2) rail([x0 + 2, y + 2.5, z + 0.9], [x0 + 10, y + 2.5, z + 0.9]);
  }
  for (const dx of [0, 6, 12]) {
    for (const dz of [-0.9, 0.9]) deco([x0 + dx, 4.2, z + dz], [0.14, 8.4, 0.14], '#8d9298');
  }
  // Bauzaun und Materialstapel als Vault-Linie
  for (let k = 0; k < 6; k++) box([x0 - 4 + k * 3.4, 0.9, z + 5.5], [3.2, 1.8, 0.12], '#c9a227');
  for (let k = 0; k < 3; k++) box([x0 + 14 + k * 2.4, 0.55, z + 2.5], [2.2, 1.1, 1.4], '#8a7a5c');
}
// Containerlager: gestapelt und versetzt — Sprung-, Precision- und Vault-Ziele
const yard = { x: bx(4) - 8, z: zN(0, 4) - 9 };
{
  const { x: cx, z: cz } = yard;
  const CONT = ['#8a4a3c', '#3f6b7a', '#6b7a3f', '#7a6a3f'];
  const cont = (dx, y, dz, k) => box([cx + dx, y + 1.3, cz + dz], [6.1, 2.6, 2.44], CONT[k % 4]);
  cont(0, 0, 0, 0);
  cont(6.6, 0, 0, 1);
  cont(13.2, 0, 0, 2);
  cont(3.3, 2.6, 0, 3);
  cont(9.9, 2.6, 0, 0);
  cont(6.6, 5.2, 0, 1);
  cont(-1, 0, 4.6, 2);
  cont(8, 0, 4.6, 3);
  rail([cx + 4.0, 8.2, cz], [cx + 9.2, 8.2, cz]); // Balance auf dem obersten Container
}

// ============================================================ Stadtpark
// Südrand: Rasenfläche, Brunnen, Hecken, Sitzstufen — ruhiger Gegenpol mit
// niedriger Vault- und Precision-Linie.
const park = { z: zS(3, 4) + 13 };
{
  const pz = park.z;
  deco([0, 0.03, pz], [105, 0.06, 24], '#5c7a48'); // Rasen
  box([-4, 0.4, pz], [9, 0.8, 9], CONCRETE[1]); // Brunnenpodest
  box([-4, 1.1, pz], [5.5, 0.6, 5.5], '#7fa3b5'); // Wasserbecken
  box([-4, 2.0, pz], [1.2, 2.2, 1.2], CONCRETE[0]); // Fontänenstock
  for (let k = 0; k < 5; k++) box([14 + k * 3.6, 0.3, pz - 5], [3.2, 0.6, 1.2], '#8a7a5c');
  for (let k = 0; k < 6; k++) box([-46 + k * 5.5, 0.5, pz + 7], [4.2, 1.0, 1.0], '#4d6b3f');
  for (const x of [-30, -16, 18, 32]) tree(x, pz + 2, 1.1);
  deco([-22, 1.0, pz - 7], [30, 0.1, 0.1], METAL); // Parkgeländer (Deko)
  for (const x of [-37, -22, -7]) deco([x, 0.5, pz - 7], [0.1, 1.0, 0.1], METAL);
}

// ============================================================ Betonpark
// Straßenniveau-Spots auf der B–C-Straße (2026-07-10). Der Platz in der Mitte
// des Viertels; die Treppe C6 und die Türme bleiben frei. Die x-Positionen
// sind mit dem Raster mitgewachsen (sx), die z-Werte hängen an streetZ(1).
const PZ = streetZ(1);
deco([sx(0), 0.04, PZ], [sx(120), 0.08, 14], '#8f8b82'); // Plattenbelag

// Spot 1 — Precision-Garten: Mauer-Slalom + Poller
[0.6, 0.9, 1.2, 0.9, 0.6].forEach((wh, k) => {
  box([sx(-64) + k * 4.4, wh / 2, PZ - 0.5], [0.5, wh, 3.2], CONCRETE[k % 3]);
});
for (let k = 0; k < 4; k++) box([sx(-62) + k * 4.4, 0.45, PZ + 3.3], [0.45, 0.9, 0.45], CONCRETE[2]);

// Spot 2 — Stangen-Dschungel: Swing-Kette knapp über Kopf
for (const [k, x] of [-36, -32, -28].entries()) {
  rail([sx(x), 2.7 + k * 0.05, PZ - 2.5], [sx(x), 2.7 + k * 0.05, PZ + 1.5]);
}
box([sx(-39.5), 0.5, PZ - 0.5], [2, 1, 3], CONCRETE[1]);
box([sx(-24.5), 0.5, PZ - 0.5], [2, 1, 3], CONCRETE[1]);

// Spot 3 — Skulpturen-Plaza: Blocktreppe, Bogen, Bank, Wellen
[0.5, 1.0, 1.5, 2.0].forEach((sh, k) => {
  box([sx(-10) + k * 2.4, sh / 2, PZ - 3], [2, sh, 2], CONCRETE[k % 3]);
});
box([sx(2), 1.6, PZ - 0.5], [1, 3.2, 1], CONCRETE[0]);
box([sx(8), 1.6, PZ - 0.5], [1, 3.2, 1], CONCRETE[0]);
box([sx(5), 3.45, PZ - 0.5], [8, 0.5, 1.2], CONCRETE[2]);
rail([sx(3.2), 3.0, PZ - 0.5], [sx(6.8), 3.0, PZ - 0.5]);
ramps.push({ pos: [sx(13), 0.9, PZ + 2.7], size: [4, 0.3, 4.4], tiltX: -0.48, color: CONCRETE[1] });
for (const [k, y] of [0.25, 1.0, 1.75].entries()) {
  box([sx(12) + k * 1.8, y, PZ - 3.5], [4.5, 0.5, 2.4], CONCRETE[k % 3]);
}

// Spot 4 — Wall-Korridor: Parallelmauern für Wall-Jumps
for (const dz of [1, -2.5]) {
  box([sx(44), 1.5, PZ + dz], [10, 3, 0.4], CONCRETE[0]);
  rail([sx(44) - 4.8, 3.4, PZ + dz], [sx(44) + 4.8, 3.4, PZ + dz]);
}
markers.push({ type: 'gap', id: 'gap-korridor', pos: [sx(44), 3.8, PZ - 0.75], size: [8, 1.6, 2.6] });

// Spot 5 — Kanten-Combo: Podest mit Kanten-Rails + Poller-Reihe
box([sx(59), 0.75, PZ - 1], [9, 1.5, 6], CONCRETE[1]);
rail([sx(59) - 4.3, 1.9, PZ - 1], [sx(59) + 4.3, 1.9, PZ - 1]);
for (let k = 0; k < 3; k++) box([sx(56) + k * 3.8, 0.6, PZ + 3.6], [0.45, 1.2, 0.45], CONCRETE[2]);
markers.push({ type: 'precision', id: 'prec-podest', pos: [sx(63), 1.5, PZ - 3] });

// A–B-Straße: Pflanzkübel-Vaults + tiefe Schwungstangen
for (let k = 0; k < 3; k++) box([sx(-18) + k * 6.5, 0.4, streetZ(0) + 1.5], [3, 0.8, 1.2], '#6f7a6a');
for (const [k, x] of [20, 24].entries()) {
  rail([sx(x), 2.7 + k * 0.05, streetZ(0) - 2], [sx(x), 2.7 + k * 0.05, streetZ(0) + 2]);
}

// C–D-Straße: Mauer-Slalom (die Treppen C4 und D7 bleiben frei)
for (const [k, wh] of [0.7, 1.1, 0.8, 1.1].entries()) {
  box([sx(14) + k * 4.4, wh / 2, streetZ(2) - 0.5], [0.5, wh, 3.2], CONCRETE[(k + 1) % 3]);
}

// Ladehof mit Rampe an der C-Zeile: Absatz auf 1.2 m, schräg befahrbar
{
  const x = sx(-56);
  const z = zN(2, 1) - 4;
  box([x, 0.6, z], [10, 1.2, 5], CONCRETE[2]);
  ramps.push({
    pos: [x + 7.4, 0.62, z],
    size: [5, 0.3, 4.6],
    rotY: Math.PI / 2,
    tiltX: -0.24,
    color: CONCRETE[1],
  });
  rail([x - 4.6, 1.6, z - 2.2], [x + 4.6, 1.6, z - 2.2]);
  box([x - 3, 1.75, z + 2], [2.2, 1.1, 1.4], '#8a7a5c');
}

// ============================================================ Treppen
// Zurück nach oben an 4 Stellen. Steigung 0.30 bei 0.75 Auftritt: der Autostep
// steht auf 0.4 m, aber mit 0.38 blieb der Spieler auf halber Treppe stehen.
// Die Reserve zum Autostep-Limit ist die Sicherheit gegen genau das.
//
// Wichtiger Nachbar-Befund (an der Treppe C4 nachgestellt): der Autostep hebt
// den Spieler erst an und schiebt ihn dann vor. Ein Deck über der Treppe
// blockiert das Anheben, und er bleibt stehen — über begehbaren Treppen darf
// deshalb nichts in Kopfhöhe plus 0.4 m liegen.
//
// Statt eines Handlaufs bekommt jede Treppe eine gestufte Wange. Ein Geländer
// als Rail wäre auf Hüfthöhe und würde beim Hochlaufen als Schwungstange
// gegriffen — Rails gehören im Projekt 0.4 m über eine begehbare Fläche
// (Balance) oder ab 2.5 m frei in die Luft (Swing), nichts dazwischen.
const RISE = 0.3;
const TREAD = 0.75;
const stairs = [
  { r: 0, i: 7, side: 1 },
  { r: 2, i: 4, side: 1 },
  { r: 2, i: 6, side: -1 },
  { r: 3, i: 7, side: -1 },
];
for (const st of stairs) {
  const n = Math.ceil(h(st.r, st.i) / RISE);
  const zEdge = rz(st.r) + st.side * (D(st.r, st.i) / 2 + 0.7);
  st.zEdge = zEdge;
  st.xFoot = bx(st.i) + 6 - TREAD * (n - 1);
  for (let k = 0; k < n; k++) {
    const x = bx(st.i) + 6 - TREAD * (n - 1 - k);
    box([x, 0.2 + RISE * k, zEdge], [3, 0.4, TREAD + 0.15], '#787d84');
    // Wange: eine Brüstung pro Stufe, folgt der Steigung
    box([x - 1.5 + TREAD / 2, 0.85 + RISE * k, zEdge + st.side * 0.7], [TREAD, 0.9, 0.25], CONCRETE[2]);
  }
}

// ============================================================ Marker
// Gap-Marker an den echten Sprunglücken
for (let r = 0; r < rows.length; r++) {
  plots[r].joints.forEach((kind, i) => {
    if (kind !== 'jump' || plots[r].gap[i] < 3.4) return;
    markers.push({
      type: 'gap',
      id: `gap-row-${rows[r].name}${i}`,
      pos: [bx(i) + PITCH / 2, Math.max(h(r, i), h(r, i + 1)) + 1.2, rz(r)],
      size: [plots[r].gap[i] + 0.6, 2.5, 6],
    });
  });
}
for (const [n, s] of slopedRails.entries()) {
  markers.push({
    type: 'gap',
    id: `gap-street-${n}`,
    pos: [bx(s.i), (s.yHi + s.yLo) / 2 + 0.6, (s.zHi + s.zLo) / 2],
    size: [4, 2.5, Math.abs(s.zLo - s.zHi) - 2],
  });
}
for (const a of alleys) {
  markers.push({
    type: 'gap',
    id: `gap-gasse-${rows[a.r].name}${a.i}`,
    pos: [a.xm, h(a.r, a.i) + 1.2, rz(a.r)],
    size: [a.gap + 0.6, 2.5, 6],
  });
}

// Precision-Pads (zusätzlich zur überall aktiven Kanten-Precision)
for (const [r, i] of [[0, 6], [1, 4], [2, 0], [2, 5], [3, 5], [3, 6]]) {
  markers.push({ type: 'precision', id: `prec-${rows[r].name}${i}`, pos: [bx(i) + 4, h(r, i), rz(r) + 4] });
}
markers.push({ type: 'precision', id: 'prec-container', pos: [yard.x + 6.6, 7.8, yard.z] });
markers.push({ type: 'precision', id: 'prec-bruecke', pos: [bridge.x, bridge.y + 0.15, bridge.z] });

// Sammelobjekte (Task 18). Reihenfolge ist verbindlich: col-01..04 liegen
// über den geneigten Rails und werden von der Mission „Sammler" gefordert.
let colN = 0;
const pushCol = (pos) => {
  colN++;
  markers.push({ type: 'collectible', id: `col-${String(colN).padStart(2, '0')}`, pos });
};
for (const s of slopedRails) pushCol([bx(s.i), (s.yHi + s.yLo) / 2 + 0.8, (s.zHi + s.zLo) / 2]);
for (const b of barRows) pushCol([b.x, b.y, (b.zs[0] + b.zs[1]) / 2]);
for (const [r, i] of wallGaps.slice(0, 5)) {
  pushCol([bx(i) + PITCH / 2, Math.max(h(r, i), h(r, i + 1)) + 1, rz(r)]);
}
for (const [r, i] of [[0, 2], [1, 6], [3, 0]]) pushCol([bx(i) - 3, h(r, i) + 3 + 0.8, rz(r) - 3]);
for (const [r, i, dx, dz] of [[0, 7, 5, -5], [1, 7, -5, 5], [2, 7, 5, -5], [3, 1, -5, 5]]) {
  pushCol([bx(i) + dx, h(r, i) + 1, rz(r) + dz]);
}
// Betonpark
pushCol([sx(-56), 1.8, PZ - 0.5]);
pushCol([sx(-32), 3.4, PZ - 0.5]);
pushCol([sx(5), 4.4, PZ - 0.5]);
pushCol([sx(44), 4.2, PZ - 0.75]);
pushCol([sx(59), 2.6, PZ - 1]);
pushCol([sx(-12), 1.4, streetZ(0) + 1.5]);
// Stadt-Spots
for (const a of alleys.slice(0, 2)) pushCol([a.xm, 6.2, rz(a.r)]);
pushCol([scaffold.x + 6, 9.0, scaffold.z]); // oberste Gerüstbohle
pushCol([yard.x + 6.6, 8.6, yard.z]); // Container-Stapel
pushCol([bridge.x, bridge.y + 1.6, bridge.z]); // über der Fußgängerbrücke
pushCol([busStop.x, 3.6, busStop.z]); // Dach der Bushaltestelle
pushCol([-4, 2.6, park.z]); // Brunnen im Park

// Zeitrennen (Task 19): Start auf B3, über die B-Zeile westwärts, Rail runter
// zur A-Zeile, ostwärts über die Dachlücken zum Finish
markers.push({ type: 'trialStart', id: 'trial-1', pos: [bx(3), h(1, 3) + 1.3, rz(1) - 5] });
const railB1 = slopedRails[0];
const cps = [
  [bx(2), h(1, 2) + 1.4, rz(1)],
  [bx(1), h(1, 1) + 1.4, rz(1)],
  [bx(1), (railB1.yHi + railB1.yLo) / 2, (railB1.zHi + railB1.zLo) / 2],
  [bx(1), h(0, 1) + 1.4, rz(0)],
  [bx(2), h(0, 2) + 1.4, rz(0)],
  [bx(3), h(0, 3) + 1.4, rz(0)],
  [bx(4), h(0, 4) + 1.4, rz(0)],
  [bx(5), h(0, 5) + 1.4, rz(0)],
];
cps.forEach((pos, i) => markers.push({ type: 'checkpoint', id: `cp${i + 1}`, pos }));
markers.push({ type: 'finish', id: 'finish-1', pos: [bx(6), h(0, 6) + 1.4, rz(0)] });

// Coastal extension: connected boardwalk, training plaza and pavilion roofs.
box([8, -0.5, 94], [224, 1, 50], '#8a968b');
box([8, 0.08, 96], [220, 0.16, 30], '#b8b6a4');
for (let x = -94; x <= 108; x += 12) {
  scenery.trees.push({ x, z: 108, scale: 1.15 + hash(x, 9) * 0.3, palm: true });
  scenery.lamps.push({ x: x + 4, z: 85, side: -1 });
  // Seating is also a low vault and precision line.
  box([x, 0.48, 104], [3.6, 0.96, 0.65], '#bdaf95');
}
for (let k = 0; k < 7; k++) {
  const x = -83 + k * 8;
  box([x, 0.4 + (k%3)*0.3, 94], [2.8, 0.8 + (k%3)*0.6, 2.4], '#d4cbb8');
  deco([x, 0.815 + (k%3)*0.6, 94], [2.7, 0.025, 2.3], '#558c86');
}
for (let k = 0; k < 4; k++) {
  const x = -10 + k * 3.4;
  for (const dz of [-2, 2]) box([x, 1.5, 94+dz], [0.12, 3, 0.12], '#657a79');
  rail([x, 3, 92], [x, 3, 96]);
}
for (let k = 0; k < 3; k++) {
  const x = 32 + k * 15;
  box([x, 1.35, 94], [8, 2.7, 7], ['#b9cfc3','#d8b4a0','#cec5ac'][k]);
  box([x, 2.8, 94], [8.5, 0.2, 7.5], '#ede5d2');
  box([x-5, 0.5, 92], [1.8, 1, 2], '#ada994');
  box([x-5, 1.05, 95], [1.8, 2.1, 2], '#ada994');
  scenery.signs.push({ x, y: 2, z: 90.45, text: ['BOARDWALK','FLOW CLUB','COASTAL CAFE'][k], color: '#164b50' });
  rail([x-3, 3.3, 93], [x+3, 3.3, 93]);
}
scenery.signs.push({ x:-40, y:2.8, z:83, text:'PALM QUAY  /  FREERUN PARK', color:'#164b50' });

// ============================================================ Kulisse
// Skyline ohne Collider hinter dem Viertel — im Dunst (Fog ab 40 m) wird
// daraus eine Stadt, die weitergeht. Kostet einen Bruchteil eines Draw-Calls,
// weil alles im selben Stadt-Batch steckt.
const skyline = (pos, size, seed) => {
  const f = FACADES[Math.floor(hash(seed * 7, seed * 13 + 2) * FACADES.length)];
  boxes.push({ pos, size, color: f.color, style: f.style, solid: false });
};
for (const [zc, sign] of [[zN(0, 0) - 85, -1], [zS(3, 0) + 165, 1]]) {
  for (let k = 0; k < 18; k++) {
    const x = -175 + k * 22 + hash(k, zc) * 6;
    const height = 12 + hash(k * 3, zc + 1) * 38;
    skyline([x, height / 2, zc + sign * hash(k, zc + 3) * 22], [9 + hash(k * 5, zc) * 6, height, 10], k + zc);
  }
}
for (const xc of [bx(0) - 85, TOWER_X + 75]) {
  for (let k = 0; k < 16; k++) {
    const z = Z0 - 40 + k * 13;
    const height = 14 + hash(k * 11, xc) * 30;
    skyline([xc + (hash(k, xc) - 0.5) * 18, height / 2, z], [10, height, 9 + hash(k * 3, xc) * 6], k + xc);
  }
}

const level = {
  name: 'Palm Quay — Coastal District',
  spawn: [bx(3), h(1, 3) + 0.1, rz(1)],
  boxes,
  ramps,
  rails,
  markers,
  scenery,
  trialTimes: { gold: 60000, silver: 80000, bronze: 100000 },
};

writeFileSync(
  new URL('../public/levels/city01.json', import.meta.url),
  JSON.stringify(level, null, 1) + '\n',
);

console.log(
  `city01.json: ${boxes.length} Boxen, ${rails.length} Rails, ${markers.length} Marker, ` +
    `${colN} Sammelobjekte`,
);
console.log(
  `  Raster: Pitch ${PITCH} m, Zeilenabstand ${ROW_GAP} m, ` +
    `Viertel ${(PITCH * 8).toFixed(0)} x ${(ROW_GAP * 3 + 30).toFixed(0)} m`,
);
for (let r = 0; r < rows.length; r++) {
  const d = plots[r].d;
  console.log(
    `  Zeile ${rows[r].name} (z=${rz(r)}): Fugen ${plots[r].gap.map((g) => g.toFixed(1)).join(' ')} · ` +
      `Breiten ${plots[r].w.map((w) => w.toFixed(0)).join(' ')} · Tiefe ~${(d.reduce((a, b) => a + b) / d.length).toFixed(1)}`,
  );
}
for (let r = 0; r < 3; r++) {
  console.log(
    `  Straße ${rows[r].name}–${rows[r + 1].name} (z=${streetZ(r)}): ` +
      `${(ROW_GAP - (Math.max(...plots[r].d) + Math.max(...plots[r + 1].d)) / 2).toFixed(1)} m breit`,
  );
}
