#!/usr/bin/env node
/**
 * Generator für public/levels/city01.json — „Rooftops District"
 * (Task 17, Stadtbild-Pass Task 17b).
 *
 * STRASSENRASTER (unverändert seit Task 17, weil Zeitrennen-Route und
 * Smoke-Tests daran hängen): 4 Häuserzeilen A–D mit je 8 Gebäuden,
 * Spaltenabstand 17.5 m in x, Zeilenabstand 25 m in z. Die Gebäudezentren
 * und die Dachhöhen sind fix.
 *
 * Neu im Stadtbild-Pass ist alles andere. Aus dem Raster gleich großer
 * Würfel wird ein Viertel:
 *   - Grundflächen variieren, benachbarte Häuser wachsen zu Blöcken zusammen
 *     (Lückenbauten) oder lassen enge Gassen frei
 *   - hohe Häuser bekommen ein zurückgesetztes Staffelgeschoss
 *   - Sockelzone, Attika, Dachtechnik, Wassertanks, Antennen, Reklametafeln
 *   - Straßenraum mit Fahrbahnmarkierung, Bordstein, Gehweg, Zebrastreifen
 *   - Möblierung: Laternen, Ampeln, parkende Autos, Bushaltestelle, Kiosk,
 *     Container, Bänke, Bäume, Müllcontainer, Baugerüst, Feuerleitern
 *   - Skyline-Kulisse ohne Collider hinter dem Viertel
 *
 * Jedes dieser Objekte ist zugleich ein Parkour-Element: Autos und Bänke sind
 * Vaults, Bushaltestellen und Container Absätze, Feuerleitern und Gerüste
 * Kletterrouten, Geländer und Gerüststangen Balance- und Schwungziele. Die
 * Regel für den ganzen Pass: nichts wird nur zur Zierde gebaut.
 *
 * Draw-Calls bleiben trotz der Detailmenge niedrig, weil fast alles über
 * `style` in den Stadt-Batch geht (siehe src/level/CityFacade.ts): ein
 * InstancedMesh pro Stil, egal wie viele Boxen unterschiedlicher Größe.
 *
 * Aufruf: node tools/gen-city01.mjs   (schreibt die JSON-Datei direkt)
 */
import { writeFileSync } from 'node:fs';

// ============================================================ Raster (fix)
const PITCH = 17.5; // Abstand der Gebäudezentren in x
const X0 = -70;
const rows = [
  { name: 'A', z: -45, heights: [10, 11, 9, 8, 9, 7, 8, 6] },
  { name: 'B', z: -20, heights: [14, 13, 14, 12, 11, 12, 10, 9] },
  { name: 'C', z: 5, heights: [8, 9, 7, 8, 6, 7, 5, 6] },
  { name: 'D', z: 30, heights: [12, 11, 12, 10, 9, 8, 9, 6] },
];
const bx = (i) => X0 + PITCH * i;
const h = (r, i) => rows[r].heights[i];
const rz = (r) => rows[r].z;

const boxes = [];
const ramps = [];
const rails = [];
const markers = [];

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
  { color: '#c08a63', style: 'windows-mixed' }, // Sandstein-Altbau
  { color: '#b5643f', style: 'windows-mixed' }, // Ziegelrot
  { color: '#a8adb4', style: 'windows-grid' }, // Betongrau
  { color: '#8e959d', style: 'windows-grid' },
  { color: '#93a3a8', style: 'windows-strip' }, // Bandfassade, Nachkriegsbau
  { color: '#c9c3b4', style: 'windows-strip' },
];
const ASPHALT = '#4c4f55';
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
// Die Fugen sind so gelegt, dass alle Routen aus Task 17 erhalten bleiben
// (Reklamewände, Zeitrennen, Straßenquerungen).
const JOINTS = {
  A: ['jump', 'jump', 'alley', 'jump', 'jump', 'infill', 'jump'],
  B: ['jump', 'jump', 'alley', 'infill', 'jump', 'jump', 'jump'],
  C: ['infill', 'jump', 'jump', 'alley', 'jump', 'jump', 'infill'],
  D: ['jump', 'infill', 'jump', 'jump', 'alley', 'jump', 'jump'],
};
const GAP_TARGET = { alley: 2.5, infill: 4.4 };
const START_WIDTH = { A: 13.4, B: 14.6, C: 13.0, D: 14.2 };

/** Grundflächen der Zeile aus den Fugen ableiten (Zentren bleiben im Raster). */
const layoutRow = (r) => {
  const joints = JOINTS[rows[r].name];
  const w = [START_WIDTH[rows[r].name]];
  for (let i = 0; i < joints.length; i++) {
    const target =
      joints[i] === 'jump' ? 3.2 + hash(r * 3 + 1, i) * 1.6 : GAP_TARGET[joints[i]];
    const next = Math.min(16.2, Math.max(11.5, 2 * (PITCH - target) - w[i]));
    w.push(next);
  }
  const d = w.map((_, i) => 12.5 + hash(i * 5 + 2, r * 7) * 3.5);
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
      style: f.style,
    });
    // Sockelzone: dunklerer, leicht vorstehender Fuß — gibt der Fassade
    // Maßstab und nebenbei einen 1.4-m-Absatz zum Aufsteigen
    box([bx(i), 0.7, rz(r)], [W(r, i) + 0.5, 1.4, D(r, i) + 0.5], PLINTH);

    // Staffelgeschoss auf den hohen Häusern — immer auf die Südhälfte, damit
    // die Dachmitte (Lauflinie und Zeitrennen-Tore) frei bleibt. B3 bleibt
    // frei: dort steht der Spawn, und ein Aufbau direkt davor verstellt den
    // ersten Blick über das Viertel.
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
    rail([(xL + xR) / 2 - (xR - xL) / 2 + 0.3, top + 0.4, rz(r) - depth / 2 + 0.3], [
      (xL + xR) / 2 + (xR - xL) / 2 - 0.3,
      top + 0.4,
      rz(r) - depth / 2 + 0.3,
    ]);
  });
}

// Landmarken-Türme östlich (Spalte x=70)
boxes.push({ pos: [70, 10, -20], size: [14, 20, 13], color: TERRA, style: 'windows-mixed' });
boxes.push({ pos: [70, 9, 30], size: [13, 18, 14], color: '#93a3a8', style: 'windows-strip' });
boxes.push({ pos: [70, 3.5, -45], size: [14, 7, 14], color: '#a8adb4', style: 'windows-grid' });
boxes.push({ pos: [70, 3, 5], size: [14, 6, 13], color: '#c08a63', style: 'windows-mixed' });
for (const z of [-20, 30, -45, 5]) box([70, 0.7, z], [14.5, 1.4, 14.5], PLINTH);

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

// Dachtechnik: Lüfter (vaultbar), Lüftungsrohre, Antennen, Oberlichter.
// Alles auf die Nordhälfte, damit Lauflinie und Staffelgeschoss frei bleiben.
for (let r = 0; r < rows.length; r++) {
  for (let i = 0; i < 8; i++) {
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
    // Schornstein und Antennenmast als Silhouette
    if (hash(i * 31, r * 37) > 0.55) {
      box([bx(i) + W(r, i) / 2 - 1.6, y + 1.1, zTech + 1.8], [0.9, 2.2, 0.9], '#8a6a5a');
    }
    if (hash(i * 41, r * 43) > 0.7) {
      deco([bx(i) - W(r, i) / 2 + 1.4, y + 2.8, zTech], [0.14, 5.6, 0.14], METAL);
      deco([bx(i) - W(r, i) / 2 + 1.4, y + 4.4, zTech], [1.2, 0.1, 0.1], METAL);
    }
  }
}

// Dachaufbauten mit Funktion: Treppenhäuschen (3 m — nur per Wandlauf und
// Mantle erreichbar). Aus Task 17 übernommen, jetzt mit Tür und Geländer.
for (const [r, i] of [[0, 2], [1, 0], [1, 6], [2, 4], [3, 0]]) {
  const x = bx(i) - 3;
  const z = rz(r) - 3;
  box([x, h(r, i) + 1.5, z], [3, 3, 3], '#5d646e');
  deco([x, h(r, i) + 1.05, z + 1.55], [1.1, 2.1, 0.12], '#3f454d'); // Tür
  rail([x - 1.3, h(r, i) + 3.4, z - 1.3], [x + 1.3, h(r, i) + 3.4, z - 1.3]);
}

// Reklametafeln über den Sprunglücken: Wandlauf-Ziele (aus Task 17)
const wallGaps = [[0, 1], [0, 4], [1, 5], [2, 2], [3, 3], [3, 6]];
for (const [r, i] of wallGaps) {
  const top = Math.max(h(r, i), h(r, i + 1));
  const xm = bx(i) + PITCH / 2;
  box([xm, top + 2, rz(r)], [5.5, 4, 0.5], TERRA);
  deco([xm, top + 4.35, rz(r)], [5.5, 0.3, 0.7], METAL); // Beleuchtungsschiene
  for (const dx of [-2.2, 2.2]) deco([xm + dx, top - 0.4, rz(r)], [0.2, 0.9, 0.2], METAL);
}

// Vault-Kästen (Lüftung) auf den Lauflinien — Höhe 0.9 m, aus Task 17
for (const [r, i] of [[0, 1], [0, 4], [1, 2], [1, 3], [1, 5], [2, 1], [2, 3], [3, 2], [3, 4], [3, 6]]) {
  box([bx(i), h(r, i) + 0.45, rz(r) + 2], [2.4, 0.9, 0.6], YELLOW);
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
  const zHi = rz(s.hi) < rz(s.lo) ? zS(s.hi, s.i) : zN(s.hi, s.i);
  const zLo = rz(s.hi) < rz(s.lo) ? zN(s.lo, s.i) : zS(s.lo, s.i);
  s.zHi = zHi;
  s.zLo = zLo;
  s.yHi = h(s.hi, s.i) + 0.4;
  s.yLo = h(s.lo, s.i) + 0.4;
  rail([bx(s.i), s.yHi, zHi], [bx(s.i), s.yLo, zLo]);
}
// Balance-Rails entlang von Dachkanten
rail([bx(2) + 7, h(0, 2) + 0.4, -52], [bx(2) + 7, h(0, 2) + 0.4, -38]);
rail([bx(4) - 7, h(1, 4) + 0.4, -27], [bx(4) + 7, h(1, 4) + 0.4, -27]);
rail([bx(1) - 7, h(2, 1) + 0.4, -2], [bx(1) + 7, h(2, 1) + 0.4, -2]);
rail([bx(4) + 7, h(3, 4) + 0.4, 23], [bx(4) + 7, h(3, 4) + 0.4, 37]);

// Schwungstangen-Reihen (Freiraum darunter, von hoch nach tief)
const barRows = [
  { x: bx(3), y: h(1, 3) + 1, zs: [-28.5, -32, -35.5] }, // B3(12) -> A3(8)
  { x: bx(5), y: h(1, 5) + 1, zs: [-11.5, -8, -4.5] }, // B5(12) -> C5(7)
  { x: bx(0), y: h(3, 0) + 1, zs: [21.5, 18, 14.5] }, // D0(12) -> C0(8)
  { x: bx(5), y: h(3, 5) + 1, zs: [21.5, 18, 14.5] }, // D5(8) -> C5(7)
];
for (const row of barRows) {
  for (const z of row.zs) rail([row.x - 2, row.y, z], [row.x + 2, row.y, z]);
}

// Hangel-Slabs über die Straßen (per Sprung greifen, rüberhangeln)
const slabs = [
  { x: bx(3), zc: 17.5, top: h(2, 3) + 3.1 }, // C3(8) -> D3(10)
  { x: bx(6), zc: -32.5, top: h(0, 6) + 3.1 }, // A6(8) -> B6(10)
  { x: bx(1), zc: 17.5, top: h(2, 1) + 3.1 }, // C1(9) -> D1(11)
];
for (const s of slabs) box([s.x, s.top - 0.15, s.zc], [1.2, 0.3, 12], '#4a4f57');

// Fußgängerbrücke über die C–D-Straße: echte Stadtinfrastruktur und
// zugleich eine Route auf halber Höhe, mit Geländer als Balance-Rail
{
  const y = 6.4;
  // Nicht über bx(4): dort führt die Treppe C4 hoch, und ein Deck 1.3 m über
  // dem Kopf blockiert den Autostep — der Spieler bliebe auf halber Treppe
  // stehen. Die Brücke liegt deshalb in der Fuge zwischen C4 und C5 und
  // verbindet dort gleich beide Dächer.
  const x = bx(4) + 8.75;
  box([x, y, 17.5], [2.6, 0.3, 13], CONCRETE[2]);
  for (const dx of [-1.35, 1.35]) {
    deco([x + dx, y + 1.1, 17.5], [0.1, 0.1, 13], METAL);
    deco([x + dx, y + 0.72, 17.5], [0.08, 0.06, 13], METAL);
    for (const z of [12.5, 17.5, 22.5]) deco([x + dx, y + 0.65, z], [0.12, 0.9, 0.12], METAL);
  }
  for (const z of [12.2, 22.8]) box([x, y / 2, z], [1.2, y, 1.2], CONCRETE[0]);
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
      // Vorbeilaufen als Schwungstange gegriffen (siehe Kommentar bei den
      // Treppen weiter unten)
      deco([x, y + 0.6, rz(r) - 1.5], [1.4, 1.0, 0.08], METAL);
      deco([x, y + 0.6, rz(r) + 1.5], [1.4, 1.0, 0.08], METAL);
      side = -side;
    }
    // Müllcontainer als Einstieg (Vault-Höhe 1.1 m)
    box([xm, 0.55, rz(r) - D(r, i) / 2 - 2.2], [1.9, 1.1, 1.2], '#4f6b52');
  });
}

// ============================================================ Straßenraum
// Fahrbahn: eine große Fläche (bewusst kein Precision-/Ledge-Ziel)
boxes.push({ pos: [5, -0.5, -7.5], size: [220, 1, 135], color: ASPHALT });

// Gehwege mit Bordstein an allen Zeilenkanten
for (let r = 0; r < rows.length; r++) {
  for (const side of [-1, 1]) {
    const zEdge = rz(r) + side * (Math.max(...plots[r].d) / 2 + 1.6);
    box([5, 0.075, zEdge], [150, 0.15, 3.2], CURB);
  }
}
// Mittelstreifen (gestrichelt) und Zebrastreifen an den Querungen
for (const zc of [-32.5, -7.5, 17.5]) {
  for (let x = -76; x <= 66; x += 6) deco([x, 0.02, zc], [3.2, 0.04, 0.22], '#d8d2be');
}
for (const zc of [-32.5, -7.5, 17.5]) {
  for (const xc of [bx(2) + PITCH / 2, bx(5) + PITCH / 2]) {
    for (let k = -3; k <= 3; k++) deco([xc + k * 0.9, 0.02, zc], [0.5, 0.04, 8], '#e2ded0');
  }
}

// Laternen: Mast, Ausleger, Leuchte. Paarweise gegenüber — dazwischen hängt
// jeweils ein Straßenschild als Schwungstange auf 3 m.
for (const zc of [-32.5, -7.5, 17.5]) {
  for (let k = 0; k < 5; k++) {
    const x = -62 + k * 28;
    for (const side of [-1, 1]) {
      const z = zc + side * 4.2;
      deco([x, 2.6, z], [0.18, 5.2, 0.18], '#454b52');
      deco([x, 5.1, z - side * 0.9], [0.14, 0.12, 1.8], '#454b52');
      deco([x, 5.0, z - side * 1.7], [0.5, 0.2, 0.9], '#d9d2a8');
    }
    rail([x, 3.0, zc - 4.2], [x, 3.0, zc + 4.2]);
    deco([x, 3.35, zc], [1.6, 0.55, 0.08], YELLOW);
  }
}

// Parkende Autos am Bordstein: Vault-Linien (Kofferraum 1.1 m) und
// Trittsteine Richtung Feuerleiter
const CAR_COLORS = ['#7b3f3f', '#3f5b7b', '#c9c9c4', '#4a6b4a', '#8a7a3f', '#2f3438'];
const parkCar = (x, z, n, dir) => {
  for (let k = 0; k < n; k++) {
    const cx = x + k * dir * 5.4;
    const c = CAR_COLORS[Math.floor(hash(cx, z) * CAR_COLORS.length)];
    box([cx, 0.72, z], [4.4, 0.76, 1.9], c); // Karosserie
    box([cx - 0.2, 1.32, z], [2.3, 0.62, 1.75], c); // Aufbau
    deco([cx, 0.34, z], [4.0, 0.5, 2.0], '#25282c'); // Schweller/Räder
  }
};
parkCar(-58, -29.6, 4, 1);
parkCar(-4, -35.4, 3, 1);
parkCar(38, -29.6, 3, 1);
parkCar(-40, 11.4, 3, 1);
parkCar(20, 23.6, 4, 1);
parkCar(-62, 23.6, 3, 1);

// Bushaltestelle: Dach auf 2.6 m als Absatz, Bank als Vault davor
{
  const x = -30;
  const z = -35.6;
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
  const x = 4;
  const z = 14.2;
  box([x, 1.4, z], [4.2, 2.8, 3.0], '#b5643f');
  box([x, 2.95, z + 2.0], [4.8, 0.2, 1.6], TERRA); // Vordach — Absatz auf 3 m
  deco([x - 1.6, 1.5, z + 1.55], [1.4, 1.0, 0.08], '#3f454d'); // Verkaufsklappe
  box([x + 3.4, 0.6, z + 1.4], [0.6, 1.2, 0.6], '#4f6b52'); // Mülleimer
}

// Bäume und Pflanzkübel: Kübel sind Vaults, Kronen reine Silhouette
const tree = (x, z, s = 1) => {
  box([x, 0.45, z], [1.6, 0.9, 1.6], CONCRETE[2]); // Kübel (Vault)
  deco([x, 1.9 * s + 0.9, z], [0.34, 2.6 * s, 0.34], '#6b543c');
  // Krone aus zwei versetzten Blöcken — eine einzelne Platte sieht aus der
  // Straßenperspektive wie ein schwebendes Schild aus
  deco([x, 3.2 * s + 0.9, z], [2.4 * s, 1.6 * s, 2.4 * s], GREEN);
  deco([x + 0.3 * s, 4.2 * s + 0.9, z - 0.2 * s], [1.7 * s, 1.3 * s, 1.7 * s], '#6d8a52');
};
for (const [x, z] of [[-46, 12.6], [-38, 12.6], [12, 12.6], [-20, -34.6], [30, -34.6], [56, 12.6]]) {
  tree(x, z, 0.9 + hash(x, z) * 0.3);
}

// ============================================================ Baustelle
// Nordrand des Viertels: Gerüst über drei Ebenen an A2, plus Containerlager.
// Ein Spot, der Klettern, Balancieren, Schwingen und Präzision verbindet.
{
  const x0 = bx(2) - 6;
  const z = -54.5;
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
  for (let k = 0; k < 6; k++) box([x0 - 4 + k * 3.4, 0.9, z + 4.5], [3.2, 1.8, 0.12], '#c9a227');
  for (let k = 0; k < 3; k++) box([x0 + 14 + k * 2.4, 0.55, z + 2], [2.2, 1.1, 1.4], '#8a7a5c');
}
// Containerlager: gestapelt und versetzt — Sprung-, Precision- und Vault-Ziele
{
  const cx = 24;
  const cz = -56;
  const CONT = ['#8a4a3c', '#3f6b7a', '#6b7a3f', '#7a6a3f'];
  const cont = (x, y, z, k) => box([x, y + 1.3, z], [6.1, 2.6, 2.44], CONT[k % 4]);
  cont(cx, 0, cz, 0);
  cont(cx + 6.6, 0, cz, 1);
  cont(cx + 13.2, 0, cz, 2);
  cont(cx + 3.3, 2.6, cz, 3);
  cont(cx + 9.9, 2.6, cz, 0);
  cont(cx + 6.6, 5.2, cz, 1);
  cont(cx - 1, 0, cz + 4.2, 2);
  cont(cx + 8, 0, cz + 4.2, 3);
  rail([cx + 4.0, 8.2, cz], [cx + 9.2, 8.2, cz]); // Balance auf dem obersten Container
}

// ============================================================ Stadtpark
// Südrand: Rasenfläche, Brunnen, Hecken, Sitzstufen — ruhiger Gegenpol mit
// niedriger Vault- und Precision-Linie.
{
  const pz = 45;
  deco([0, 0.03, pz], [90, 0.06, 20], '#5c7a48'); // Rasen
  box([-4, 0.4, pz], [9, 0.8, 9], CONCRETE[1]); // Brunnenpodest
  box([-4, 1.1, pz], [5.5, 0.6, 5.5], '#7fa3b5'); // Wasserbecken
  box([-4, 2.0, pz], [1.2, 2.2, 1.2], CONCRETE[0]); // Fontänenstock
  for (let k = 0; k < 5; k++) box([12 + k * 3.6, 0.3, pz - 4], [3.2, 0.6, 1.2], '#8a7a5c'); // Sitzstufen
  for (let k = 0; k < 6; k++) box([-40 + k * 5, 0.5, pz + 6], [4.2, 1.0, 1.0], '#4d6b3f'); // Hecken
  for (const x of [-26, -14, 16, 28]) tree(x, pz + 2, 1.1);
  deco([-20, 1.0, pz - 6], [28, 0.1, 0.1], METAL); // Parkgeländer (Deko)
  for (const x of [-34, -20, -6]) deco([x, 0.5, pz - 6], [0.1, 1.0, 0.1], METAL);
}

// ============================================================ Betonpark
// Straßenniveau-Überarbeitung von 2026-07-10: künstlerische Beton-Spots auf
// der B–C-Straße. Bleibt unverändert erhalten und ist jetzt der Platz in der
// Mitte des Viertels; die Treppe C6 (x 27..41) und die Türme (x>63) sind frei.
deco([0, 0.04, -7.5], [120, 0.08, 11], '#8f8b82'); // Plattenbelag

// Spot 1 — Precision-Garten (x -66..-48): Mauer-Slalom + Poller
[0.6, 0.9, 1.2, 0.9, 0.6].forEach((wh, k) => {
  box([-64 + k * 4, wh / 2, -8], [0.5, wh, 3.2], CONCRETE[k % 3]);
});
for (let k = 0; k < 4; k++) box([-62 + k * 4, 0.45, -4.2], [0.45, 0.9, 0.45], CONCRETE[2]);

// Spot 2 — Stangen-Dschungel (x -38..-24): Swing-Kette knapp über Kopf
for (const [k, x] of [-36, -32, -28].entries()) {
  rail([x, 2.7 + k * 0.05, -10], [x, 2.7 + k * 0.05, -6]);
}
box([-39.5, 0.5, -8], [2, 1, 3], CONCRETE[1]);
box([-24.5, 0.5, -8], [2, 1, 3], CONCRETE[1]);

// Spot 3 — Skulpturen-Plaza (x -12..+16): Blocktreppe, Bogen, Bank, Wellen
[0.5, 1.0, 1.5, 2.0].forEach((sh, k) => {
  box([-10 + k * 2.2, sh / 2, -10.5], [2, sh, 2], CONCRETE[k % 3]);
});
box([2, 1.6, -8], [1, 3.2, 1], CONCRETE[0]);
box([8, 1.6, -8], [1, 3.2, 1], CONCRETE[0]);
box([5, 3.45, -8], [7, 0.5, 1.2], CONCRETE[2]);
rail([3.2, 3.0, -8], [6.8, 3.0, -8]);
ramps.push({ pos: [13, 0.9, -4.8], size: [4, 0.3, 4.4], tiltX: -0.48, color: CONCRETE[1] });
for (const [k, y] of [0.25, 1.0, 1.75].entries()) {
  box([12 + k * 1.6, y, -11], [4.5, 0.5, 2.4], CONCRETE[k % 3]);
}

// Spot 4 — Wall-Korridor (x 39..49): Parallelmauern für Wall-Jumps
for (const zc of [-6.5, -10]) {
  box([44, 1.5, zc], [10, 3, 0.4], CONCRETE[0]);
  rail([39.2, 3.4, zc], [48.8, 3.4, zc]);
}
markers.push({ type: 'gap', id: 'gap-korridor', pos: [44, 3.8, -8.25], size: [8, 1.6, 2.6] });

// Spot 5 — Kanten-Combo (x 55..66): Podest mit Kanten-Rails + Poller-Reihe
box([59, 0.75, -8.5], [9, 1.5, 6], CONCRETE[1]);
rail([54.7, 1.9, -8.5], [63.3, 1.9, -8.5]);
for (let k = 0; k < 3; k++) box([56 + k * 3.5, 0.6, -3.9], [0.45, 1.2, 0.45], CONCRETE[2]);
markers.push({ type: 'precision', id: 'prec-podest', pos: [63, 1.5, -10.5] });

// A–B-Straße: Pflanzkübel-Vaults + tiefe Schwungstangen
for (let k = 0; k < 3; k++) box([-18 + k * 6, 0.4, -31], [3, 0.8, 1.2], '#6f7a6a');
for (const [k, x] of [20, 24].entries()) {
  rail([x, 2.7 + k * 0.05, -34.5], [x, 2.7 + k * 0.05, -30.5]);
}

// C–D-Straße: Mauer-Slalom (Treppen C4 x -6..6 und D7 x 44..58 bleiben frei)
for (const [k, wh] of [0.7, 1.1, 0.8, 1.1].entries()) {
  box([14 + k * 4, wh / 2, 17], [0.5, wh, 3.2], CONCRETE[(k + 1) % 3]);
}

// Ladehof mit Rampe an der C-Zeile: Absatz auf 1.2 m, schräg befahrbar
{
  const x = -56;
  box([x, 0.6, -1.4], [10, 1.2, 5], CONCRETE[2]);
  ramps.push({ pos: [x + 7.4, 0.62, -1.4], size: [5, 0.3, 4.6], rotY: Math.PI / 2, tiltX: -0.24, color: CONCRETE[1] });
  rail([x - 4.6, 1.6, -3.6], [x + 4.6, 1.6, -3.6]);
  box([x - 3, 1.75, 0.6], [2.2, 1.1, 1.4], '#8a7a5c');
}

// ============================================================ Treppen
// Zurück nach oben an 4 Stellen. Steigung 0.30 bei 0.75 Auftritt statt der
// früheren 0.38/0.90: der Autostep steht auf 0.4 m, aber mit 0.38 blieb der
// Spieler in der umgebauten Stadt auf halber Treppe stehen. Mit 0.30 läuft er
// durch — die Reserve zum Autostep-Limit ist die Sicherheit gegen genau das.
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
const streetGaps = [
  { x: bx(1), y: 13, z: -32.5 },
  { x: bx(3), y: 12.5, z: -32 },
  { x: bx(4), y: 11.5, z: -7.5 },
  { x: bx(0), y: 12.5, z: 17.5 },
];
streetGaps.forEach((g, n) => {
  markers.push({ type: 'gap', id: `gap-street-${n}`, pos: [g.x, g.y, g.z], size: [4, 2.5, 10.5] });
});
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
markers.push({ type: 'precision', id: 'prec-container', pos: [30.6, 7.8, -56] });
markers.push({ type: 'precision', id: 'prec-bruecke', pos: [bx(4), 6.55, 17.5] });

// Sammelobjekte (Task 18). Reihenfolge ist verbindlich: col-01..04 liegen
// über den geneigten Rails und werden von der Mission „Sammler" gefordert.
let colN = 0;
const pushCol = (pos) => {
  colN++;
  markers.push({ type: 'collectible', id: `col-${String(colN).padStart(2, '0')}`, pos });
};
for (const s of slopedRails) pushCol([bx(s.i), (s.yHi + s.yLo) / 2 + 0.8, (s.zHi + s.zLo) / 2]);
for (const row of barRows) pushCol([row.x, row.y, (row.zs[0] + row.zs[1]) / 2]);
for (const [r, i] of wallGaps.slice(0, 5)) {
  pushCol([bx(i) + PITCH / 2, Math.max(h(r, i), h(r, i + 1)) + 1, rz(r)]);
}
for (const [r, i] of [[0, 2], [1, 6], [3, 0]]) pushCol([bx(i) - 3, h(r, i) + 3 + 0.8, rz(r) - 3]);
for (const [r, i, dx, dz] of [[0, 7, 5, -5], [1, 7, -5, 5], [2, 7, 5, -5], [3, 1, -5, 5]]) {
  pushCol([bx(i) + dx, h(r, i) + 1, rz(r) + dz]);
}
// Betonpark
pushCol([-56, 1.8, -8]);
pushCol([-32, 3.4, -8]);
pushCol([5, 4.4, -8]);
pushCol([44, 4.2, -8.25]);
pushCol([59, 2.6, -8.5]);
pushCol([-12, 1.4, -31]);
// Neue Stadt-Spots
for (const a of alleys.slice(0, 2)) pushCol([a.xm, 6.2, rz(a.r)]); // in den Gassen
pushCol([bx(2), 9.0, -54.5]); // oberste Gerüstbohle
pushCol([30.6, 8.6, -56]); // Container-Stapel
pushCol([bx(4), 8.0, 17.5]); // über der Fußgängerbrücke
pushCol([-30, 3.6, -35.6]); // Dach der Bushaltestelle
pushCol([-4, 2.6, 45]); // Brunnen im Park

// Zeitrennen (Task 19): Start auf B3, über die B-Zeile westwärts, Rail runter
// zur A-Zeile, ostwärts über die Dachlücken zum Finish
markers.push({ type: 'trialStart', id: 'trial-1', pos: [bx(3), h(1, 3) + 1.3, -25] });
const railB1 = slopedRails[0];
const cps = [
  [bx(2), h(1, 2) + 1.4, -20],
  [bx(1), h(1, 1) + 1.4, -20],
  [bx(1), (railB1.yHi + railB1.yLo) / 2, (railB1.zHi + railB1.zLo) / 2],
  [bx(1), h(0, 1) + 1.4, -45],
  [bx(2), h(0, 2) + 1.4, -45],
  [bx(3), h(0, 3) + 1.4, -45],
  [bx(4), h(0, 4) + 1.4, -45],
  [bx(5), h(0, 5) + 1.4, -45],
];
cps.forEach((pos, i) => markers.push({ type: 'checkpoint', id: `cp${i + 1}`, pos }));
markers.push({ type: 'finish', id: 'finish-1', pos: [bx(6), h(0, 6) + 1.4, -45] });

// ============================================================ Kulisse
// Skyline ohne Collider hinter dem Viertel — im Dunst (Fog ab 40 m) wird
// daraus eine Stadt, die weitergeht. Kostet einen Bruchteil eines Draw-Calls,
// weil alles im selben Stadt-Batch steckt.
for (const [zc, depth] of [[-95, 22], [72, 22]]) {
  for (let k = 0; k < 26; k++) {
    const x = -150 + k * 12 + hash(k, zc) * 4;
    const height = 16 + hash(k * 3, zc + 1) * 34;
    const f = FACADES[Math.floor(hash(k * 7, zc + 2) * FACADES.length)];
    boxes.push({
      pos: [x, height / 2, zc + (hash(k, zc + 3) - 0.5) * depth],
      size: [9 + hash(k * 5, zc) * 6, height, 10],
      color: f.color,
      style: f.style,
      solid: false,
    });
  }
}
for (const xc of [-135, 128]) {
  for (let k = 0; k < 14; k++) {
    const z = -80 + k * 12;
    const height = 14 + hash(k * 11, xc) * 30;
    const f = FACADES[Math.floor(hash(k * 13, xc + 5) * FACADES.length)];
    boxes.push({
      pos: [xc + (hash(k, xc) - 0.5) * 16, height / 2, z],
      size: [10, height, 9 + hash(k * 3, xc) * 6],
      color: f.color,
      style: f.style,
      solid: false,
    });
  }
}

const level = {
  name: 'Rooftops District',
  spawn: [bx(3), h(1, 3) + 0.1, -20],
  boxes,
  ramps,
  rails,
  markers,
  trialTimes: { gold: 60000, silver: 80000, bronze: 100000 },
};

writeFileSync(
  new URL('../public/levels/city01.json', import.meta.url),
  JSON.stringify(level, null, 1) + '\n',
);

const styles = new Set(boxes.map((b) => b.style ?? '-'));
console.log(
  `city01.json: ${boxes.length} Boxen (${styles.size} Batches), ` +
    `${rails.length} Rails, ${markers.length} Marker, ${colN} Sammelobjekte`,
);
for (let r = 0; r < rows.length; r++) {
  console.log(
    `  Zeile ${rows[r].name}: Fugen ${plots[r].gap.map((g) => g.toFixed(1)).join(' ')} ` +
      `(${plots[r].joints.join(',')})`,
  );
}
