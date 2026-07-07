# Rooftop Runner — Komplette Entwicklungsanleitung

**Ein 3D-Parkour-Browser-Spiel im Stil von Tony Hawk's Pro Skater** (Arbeitstitel: *Rooftop Runner* — bitte vor Release auf Markenkonflikte prüfen und ggf. ändern).

> **So benutzt du dieses Dokument:** Kapitel 1–7 sind dein Hintergrundwissen und Nachschlagewerk. Der **Task-Backlog** (ab Abschnitt "Build-Backlog") ist der eigentliche Arbeitsplan: Jeder Task enthält einen kopierfertigen Build-Prompt für ein Coding-Modell. Kopiere zuerst den **Projekt-Kontext-Block** (siehe Backlog-Einleitung) und dann den jeweiligen Task-Prompt in eine neue Session des Coding-Modells.

---

## Executive Summary

**Empfohlener Stack:**

- **Engine/Renderer:** Three.js (WebGL 2) + Vite + TypeScript
- **Physik:** Rapier (`@dimforge/rapier3d-compat`) mit eingebautem Kinematic Character Controller
- **Level:** Datengetrieben (JSON: Boxen, Rampen, Rails als Punktlisten) + kostenlose Low-Poly-Assets (Kenney/Quaternius, CC0)
- **Charakter/Animation:** Mixamo-Charakter + Animationen (GLB), Three.js `AnimationMixer`
- **Audio:** Howler.js · **UI/HUD:** reines HTML/CSS-Overlay (kein React)
- **Hosting:** GitHub Pages via GitHub Actions · **Backend:** Supabase (Auth + Highscores, EU-Region Frankfurt)
- **Mobile (Phase 2):** Capacitor + Touch-Overlay (nipplejs)
- **Ausführendes Coding-Modell:** Claude Opus 4.8 als Standard; Claude Sonnet 5 als günstigere Alternative für ~80 % der Tasks; Haiku 4.5 nur für triviale Tasks (Configs, kleine Dateien).

**Standard-Annahmen, die ich getroffen habe** (statt Rückfragen):

1. Solo-Entwickler, begrenztes Budget, ~5–15 h/Woche.
2. Grafikanspruch: stilisiertes Low-Poly statt Fotorealismus (Begründung in Kap. 3).
3. Zielplattform Phase 1: Desktop-Browser (Chrome/Edge/Firefox/Safari), Tastatur + Maus.
4. Sprache im Spiel: erst Englisch (größere Reichweite, weniger Umlaut-Probleme in Fonts), Deutsch optional später.
5. Kein Multiplayer in Phase 1/2 — nur asynchrone Highscore-Leaderboards. (Echtzeit-Multiplayer würde Aufwand und Kosten vervielfachen.)
6. TypeScript statt JavaScript: Der Compiler fängt einen großen Teil der Fehler ab, die ein günstigeres Coding-Modell macht. Das ist der wichtigste einzelne Qualitätshebel im ganzen Projekt.

---

# Kapitel 1 — Technologie-Analyse

## 1.1 Engine-Vergleich für 3D im Browser

| Kriterium | **Three.js** | **Babylon.js** | **PlayCanvas** | **Unity (WebGL)** | **Godot (Web)** |
|---|---|---|---|---|---|
| Grafikqualität (Browser) | Hoch (PBR, Schatten, Postprocessing) | Hoch (vergleichbar, z. T. mehr out-of-the-box) | Hoch | Sehr hoch (Desktop), im Web aber beschnitten | Mittel (Web-Export limitiert) |
| Browser-Performance | Sehr gut (schlank, ~170 KB gzip Kern) | Gut (größerer Kern) | Sehr gut | Mäßig–schlecht (20–80 MB Downloads, lange Ladezeit, hoher RAM) | Mäßig (großer WASM-Export, Mobile-Browser problematisch) |
| Lernkurve | Mittel (Bibliothek, keine Engine — man baut Game-Loop selbst) | Mittel (mehr Engine-Features eingebaut) | Mittel, aber Editor-zentriert (Cloud-Editor) | Hoch (C#, Editor, Build-Pipeline) | Mittel (GDScript, Editor) |
| Physik-Integration | Extern: Rapier/cannon-es/Ammo — sehr gut dokumentierte Kombos | Havok-Plugin (offiziell) oder cannon | Ammo integriert | PhysX integriert | Integriert |
| Asset-Pipeline | GLTF/GLB first-class, DRACO/KTX2 | GLTF first-class | Editor-Pipeline | Unity-Pipeline (mächtig, aber Web-Export-Probleme) | Eigene Pipeline |
| Mobile-Portierung (Capacitor/WebView) | Sehr gut (leichtgewichtig) | Gut | Gut | Schlecht (WebGL-Export in WebViews sehr problematisch) | Mäßig |
| Lizenz | MIT | Apache 2.0 | Engine MIT, Editor proprietär (Cloud) | Proprietär (Runtime Fee-Debatte, Editor nötig) | MIT |
| **Codegen-Zuverlässigkeit günstiger KI-Modelle** | **Beste**: mit Abstand meiste Trainingsdaten, Tutorials, StackOverflow-Antworten. Reines npm/Code-Projekt, keine Editor-Interaktion nötig. | Gut, aber deutlich weniger Beispielmaterial | Schlecht: Editor-zentriert — KI kann den Cloud-Editor nicht bedienen | Schlecht: KI kann den Unity-Editor nicht bedienen; C#-Web-Export voller Spezialfälle | Mäßig: Editor-zentriert, .tscn-Dateien für KI fehleranfällig |

**Das entscheidende Kriterium für dieses Projekt:** Das ausführende Coding-Modell arbeitet **nur mit Textdateien**. Unity, PlayCanvas und Godot verlangen Editor-Arbeit (Szenen zusammenklicken, Import-Settings, Build-Dialoge) — dort kann dir ein KI-Modell nur begrenzt helfen und du wirst selbst zum Flaschenhals. Three.js-Projekte sind zu 100 % Code + Assets-Ordner. Jeder Task ist "schreibe Datei X" — genau das, was ein Coding-Modell zuverlässig kann.

## 1.2 WebGL vs. WebGPU (Stand Mitte 2026)

- **WebGL 2:** Überall stabil — Chrome, Edge, Firefox, Safari, alle mobilen Browser. Das ist die sichere Basis.
- **WebGPU:** In Chrome/Edge stabil, Safari seit iOS 26/macOS 26 dabei, Firefox auf Windows verfügbar, aber auf Android/Linux/älteren Geräten weiterhin lückenhaft. Bringt vor allem Compute-Shader und weniger Draw-Call-Overhead.
- **Konsequenz für dich:** Für ein stilisiertes Low-Poly-Spiel bietet WebGPU **keinen sichtbaren Grafikvorteil** — der Flaschenhals wären ohnehin Draw-Calls und Asset-Größe, nicht Shader-Leistung. Three.js hat zwar einen `WebGPURenderer`, aber der ist jünger, schlechter dokumentiert, und günstigere Coding-Modelle produzieren dafür deutlich mehr fehlerhaften Code (TSL-Shader-Sprache statt GLSL). **Entscheidung: WebGL 2, kein WebGPU.** Das kannst du in 2–3 Jahren ändern, ohne Spiellogik anzufassen.

## 1.3 Klare Empfehlung

**Haupt-Stack:**

| Zweck | Bibliothek | Begründung |
|---|---|---|
| Rendering | `three` (aktuellste Version bei Projektstart fixieren, z. B. `^0.1xx`) | Siehe 1.1 |
| Build-Tool | `vite` + `typescript` | Zero-Config, HMR, statischer Build für GitHub Pages |
| Physik | `@dimforge/rapier3d-compat` | Schnelle WASM-Physik, **eingebauter `KinematicCharacterController`** (Kollision + Slopes + Steps gelöst, ohne dass das Coding-Modell Kollisionsauflösung selbst schreiben muss — der größte Fehlervermeider im Projekt). `-compat`-Variante lädt WASM inline, funktioniert problemlos mit Vite/GitHub Pages. |
| Character/Animation | Three.js `AnimationMixer` + Mixamo-GLBs | Standard-Weg, tausendfach dokumentiert |
| Audio | `howler` | Robust gegen Browser-Autoplay-Policies, simple API |
| State-Management | **Kein Framework.** Eine handgeschriebene endliche Zustandsmaschine (FSM) für den Spieler + ein Mini-EventBus (30 Zeilen) für Spiel-Events | Weniger Abhängigkeiten = weniger Fehlerquellen für das Coding-Modell. React/Zustand nur, wenn später komplexe Menü-UIs entstehen — fürs HUD reicht DOM. |
| UI/HUD | Reines HTML/CSS-Overlay über dem Canvas | Kein Framework-Overhead, Coding-Modelle können HTML/CSS fehlerfrei |
| Backend | `@supabase/supabase-js` | Siehe Kap. 5 |

**Alternative** (falls du mit Three.js unglücklich wirst): **Babylon.js + Havok**. Gleiche Projektstruktur, gleiches Deployment. Mehr "Engine-Gefühl" (Szenengraph, Inspector, integriertes Physik-Plugin), aber weniger Community-Beispielcode. Wechselkosten nach Meilenstein 1 wären ~1 Woche.

**Ausdrücklich abgeraten** für dieses Projekt: Unity WebGL (Ladezeiten, Mobile-WebView-Probleme, KI kann Editor nicht bedienen) und Eigenbau-Physik (Wall-Runs + Rail-Grinds mit selbstgeschriebener Kollisionsauflösung sind für jedes Coding-Modell ein Bug-Sumpf).

## 1.4 Welches Coding-Modell für welche Tasks

| Modell | Preis (Input/Output pro MTok) | Einsatz |
|---|---|---|
| Claude Opus 4.8 (`claude-opus-4-8`) | $5 / $25 | Standard-Executor. Zwingend für die als **[SCHWER]** markierten Tasks (Rail-Grind, Wall-Run, Animations-Blending). |
| Claude Sonnet 5 (`claude-sonnet-5`) | $3 / $15 (bis 31.08.2026: $2 / $10) | Günstige Wahl für ~80 % der Tasks — alles ohne [SCHWER]-Markierung. Nahe Opus-Qualität bei Coding. |
| Claude Haiku 4.5 (`claude-haiku-4-5`) | $1 / $5 | Nur triviale Tasks: Configs, Workflow-Dateien, HTML-Seiten (Impressum etc.). |

Faustregel: Starte jeden Task mit Sonnet 5. Wenn das Ergebnis nach **einer** Korrektur-Runde nicht läuft, wirf die Session weg und gib denselben Prompt an Opus 4.8 — nicht endlos mit dem günstigeren Modell iterieren, das kostet mehr als es spart.

---

# Kapitel 2 — Architektur & Design-Grundgerüst

## 2.1 Projektstruktur (verbindlich für alle Tasks)

Jeder Build-Prompt referenziert Pfade aus dieser Struktur. Nicht umbenennen, sonst stimmen spätere Prompts nicht mehr.

```
rooftop-runner/
├── index.html                  # Canvas + HUD-Container + Menü-Container
├── package.json
├── tsconfig.json
├── vite.config.ts              # base: '/rooftop-runner/' für GitHub Pages
├── .gitignore
├── .github/
│   └── workflows/deploy.yml    # GitHub-Pages-Deployment
├── public/
│   ├── models/                 # GLB-Dateien (Charakter, Props)
│   ├── audio/                  # MP3/OGG
│   └── levels/                 # Level-JSON-Dateien
├── src/
│   ├── main.ts                 # Einstieg: erstellt Game, startet Loop
│   ├── core/
│   │   ├── Game.ts             # Zentrale Klasse: Szene, Renderer, Loop, Systeme
│   │   ├── EventBus.ts         # Mini-Pub/Sub für Spiel-Events
│   │   ├── Input.ts            # Tastatur/Maus (später + Touch)
│   │   └── AssetLoader.ts      # GLTF/Audio-Loader mit Lade-Screen
│   ├── physics/
│   │   └── PhysicsWorld.ts     # Rapier-Init, Step, Kollisions-Queries
│   ├── level/
│   │   ├── LevelLoader.ts      # Baut Meshes + Collider aus Level-JSON
│   │   └── levelTypes.ts       # TypeScript-Typen des Level-Formats
│   ├── player/
│   │   ├── PlayerController.ts # Kinematic Controller, Bewegung, Sprung
│   │   ├── PlayerStates.ts     # FSM: Zustände + Übergänge
│   │   ├── WallRun.ts          # Wall-Run-Erkennung & -Bewegung
│   │   ├── RailGrind.ts        # Rail-Erkennung & Kurvenfahrt
│   │   ├── Vault.ts            # Hinderniserkennung & Vault-Bewegung
│   │   └── PlayerAnimator.ts   # AnimationMixer, Blending, Zustands-Mapping
│   ├── camera/
│   │   └── FollowCamera.ts     # Third-Person-Kamera
│   ├── gameplay/
│   │   ├── ScoreSystem.ts      # Tricks, Combos, Multiplikator, Bail
│   │   ├── Collectibles.ts
│   │   ├── TimeTrial.ts        # Checkpoints, Timer, Medaillen
│   │   └── Missions.ts
│   ├── ui/
│   │   ├── HUD.ts              # Score/Combo/Timer-Anzeige (DOM)
│   │   └── Menus.ts            # Start/Pause/Results (DOM)
│   ├── audio/
│   │   └── AudioManager.ts
│   ├── save/
│   │   └── SaveGame.ts         # LocalStorage (versioniert)
│   └── backend/
│       ├── supabaseClient.ts
│       └── leaderboard.ts
├── impressum.html
└── datenschutz.html
```

**Architektur-Prinzipien** (stehen auch im Projekt-Kontext-Block für das Coding-Modell):

1. **Ein System = eine Datei.** Systeme kommunizieren über den EventBus (`bus.emit('trick', {...})`), nicht über direkte Querverweise. So kann jeder Task isoliert gebaut werden.
2. **Physik ist die Wahrheit.** Die Spielerposition lebt im Rapier-Controller; das Three.js-Mesh wird jeden Frame nachgezogen. Nie umgekehrt.
3. **Level sind Daten, kein Code.** `public/levels/*.json` beschreibt Boxen, Rampen, Rails, Spawns, Collectibles, Checkpoints. Der LevelLoader generiert daraus Meshes + Collider. Vorteil: Das Coding-Modell muss nie "eine Stadt modellieren", und du kannst Level in JSON von Hand tunen.
4. **Fester Physik-Timestep:** Akkumulator-Loop mit 1/60 s, max. 3 Steps/Frame. Verhindert framerate-abhängige Physik (der klassische Anfängerfehler #1).

## 2.2 Parkour-Mechaniken — technische Umsetzung

### Character-Controller & Kollision
Rapier `KinematicCharacterController` mit Kapsel-Collider (Radius 0.35 m, Höhe 1.8 m). Der Controller löst Kollisionen, Slopes (bis 45°) und Stufen (`autostep` bis 0.4 m) selbst. Wir steuern nur den Wunsch-Bewegungsvektor pro Frame: horizontale Geschwindigkeit aus Input + Momentum, vertikale aus Gravitation/Sprung. Bodenkontakt liefert `controller.computedGrounded()`.

Feeling-Details, die den Unterschied zwischen "billig" und "gut" machen (alle im Controller-Task spezifiziert):
- **Coyote-Time** (120 ms): Springen kurz nach Verlassen einer Kante ist noch erlaubt.
- **Jump-Buffering** (120 ms): Sprung-Taste kurz vor der Landung wird gespeichert und bei Landung ausgeführt.
- **Momentum:** Beschleunigung/Abbremsung über Lerp statt Sofort-Geschwindigkeit; Sprint erhöht Maximalgeschwindigkeit von 6 auf 9 m/s.

### Zustandsmaschine (FSM)
Der Spieler ist immer in genau einem Zustand: `RUN | AIR | WALLRUN | GRIND | VAULT | BAIL`. Jeder Zustand ist eine Klasse mit `enter() / update(dt) / exit()`. Übergänge sind explizit erlaubt/verboten (z. B. `GRIND → WALLRUN` nur via Sprung). Die FSM ist das Rückgrat: Animation, Kamera-Verhalten und Score-Events hängen alle am Zustandswechsel. **Dieser Task muss vor allen Parkour-Moves fertig sein.**

### Wall-Run-Erkennung
Zwei horizontale Raycasts (links/rechts vom Spieler, Länge 0.8 m) pro Frame, nur im Zustand `AIR`. Bedingungen für Start: Wand-Normale annähernd horizontal (|n.y| < 0.3), horizontale Geschwindigkeit > 4 m/s, Blickrichtung nicht frontal in die Wand. Im Wall-Run: Gravitation auf 25 % reduziert, Bewegung entlang der Wandtangente, Max-Dauer 2 s, Kamera neigt sich 10° zur Wand. Abbruch: Taste loslassen, Wand endet (Raycast verliert Kontakt), oder Wall-Jump (Impuls = Wandnormale × 6 + hoch × 5).

### Rail-Grinding [schwierigster Teil des Projekts]
Rails stehen im Level-JSON als Punktlisten (`[[x,y,z], ...]`). Der LevelLoader baut daraus `THREE.CatmullRomCurve3` + ein Rohr-Mesh (`TubeGeometry`). **Kein Physik-Collider für Rails** — Grinding ist rein kinematisch:
- **Aufschnappen:** Im Zustand `AIR` mit Fallgeschwindigkeit ≥ 0 wird die nächstgelegene Rail-Kurve gesucht (Sampling: 50 Punkte pro Kurve cachen, Distanz < 0.8 m). Bei Treffer: Zustand `GRIND`, Spieler wird auf die Kurve gesetzt.
- **Fahren:** Kurvenparameter `t` läuft mit konstanter Geschwindigkeit (Startgeschwindigkeit = horizontale Geschwindigkeit beim Aufschnappen, min. 5 m/s) entlang der Kurve; Fahrtrichtung = Vorzeichen des Skalarprodukts aus Spielergeschwindigkeit und Kurventangente beim Aufschnappen. Spieler-Rotation folgt der Tangente.
- **Verlassen:** Sprung (→ `AIR` mit Tangenten-Momentum + Sprungimpuls) oder Kurvenende (→ `AIR`).
- Balance-Minispiel wie in THPS: **bewusst weggelassen** (Phase 3-Kandidat) — es verdoppelt die Komplexität für wenig MVP-Wert.

### Vault (Hindernis-Überwinden)
Raycast nach vorn auf Hüfthöhe (1 m, Länge 1 m). Treffer + freier Raum darüber (zweiter Raycast auf 1.6 m Höhe trifft nichts) + Hindernishöhe 0.5–1.2 m → Zustand `VAULT`: Spieler wird über 0.4 s entlang einer kleinen Bogen-Kurve über das Hindernis bewegt (Positions-Lerp, Collider währenddessen ignoriert), dann zurück zu `RUN`/`AIR`.

### Trick-/Combo-/Score-System
Reines Event-Konsumenten-System, keine Physik:
- Jede Aktion emittiert ein Event: `trick:wallrun` (+100 Basis), `trick:grind` (+50/Sekunde), `trick:vault` (+75), `trick:walljump` (+150), `trick:gap` (+200, Sprung über markierte Lücke), `trick:precision` (+250, Landung in markierter Zone).
- **Combo:** Läuft, solange der Spieler nicht länger als 1,5 s im Zustand `RUN` ohne neuen Trick ist. Multiplikator = Anzahl Tricks in der Combo (max ×10). Combo-Punkte = Summe der Basispunkte × Multiplikator.
- **Banking:** Combo wird gutgeschrieben, wenn sie sauber endet (Timeout im Stand). **Bail** (Sturz aus > 6 m Fallhöhe ohne Roll-Taste, oder frontal mit > 7 m/s gegen Wand) = Combo verfällt, 1,5 s Aufsteh-Animation.

## 2.3 Kamera & Steuerung (Desktop)

- **Kamera:** Third-Person-Follow. Sollposition = Spieler − Blickrichtung × 4,5 m + hoch 2 m; Glättung per `damp` (framerate-unabhängig!), Maus steuert Orbit (Pointer Lock API), Raycast von Spieler zu Kamera verhindert Wand-Clipping (Kamera rückt näher). FOV steigt mit Geschwindigkeit (60° → 75°) — billiger, wirkungsvoller Speed-Effekt.
- **Tasten:** WASD bewegen · Maus Kamera · Leertaste Sprung (kontextabhängig: Wall-Jump im Wall-Run, Absprung im Grind) · Shift Sprint · Strg/C Roll-Landung · R Respawn am letzten Checkpoint · Esc Pause. Vault triggert automatisch (kein Extra-Knopf — reduziert Frust).

## 2.4 City-Map: Beschaffung & Aufbau

**Entscheidung: modular handgebaut, nicht prozedural.** Prozedurale Städte sehen generisch aus und sind für Parkour-Design (bewusst platzierte Lücken, Rails, Wände) ungeeignet. Ein gutes Parkour-Level ist designtes Spielfeld, keine Kulisse.

Dreistufiger Ansatz:
1. **MVP (Task 5):** "Graybox"-Testlevel komplett aus JSON-Primitiven (Boxen, Rampen, Rails). Kein einziges 3D-Modell nötig. Hier wird das gesamte Movement getunt.
2. **Vertical Slice (Task 17):** Ein Stadt-Distrikt (~200×200 m Dächerlandschaft) — weiterhin JSON-Primitive für alle **begehbaren** Flächen (Kollision bleibt simpel und verlässlich), plus GLB-Props (Klimaanlagen, Antennen, Wassertanks von Kenney/Quaternius) als reine Dekoration ohne bzw. mit simplen Box-Collidern.
3. **Optional später:** Level-Editing in Blender (Boxen benennen: `COL_`-Präfix = Collider) + Export-Skript nach Level-JSON. Erst wenn JSON-Handarbeit zu mühsam wird.

---
# Kapitel 3 — Assets, Grafik & Audio

## 3.1 Empfohlener Grafikstil: stilisiertes Low-Poly / Flat-Shaded

**Begründung:**
- Läuft mit 60 FPS auch auf schwachen Laptops und später auf Mittelklasse-Handys (Phase 2!).
- Kostenlose CC0-Assets in diesem Stil sind reichlich vorhanden und passen zusammen — fotorealistische Assets aus verschiedenen Quellen beißen sich sofort.
- Kaschiert fehlende Texturier-Skills eines Solo-Devs; Farbflächen + gutes Licht sehen bewusst aus, nicht billig.
- Kleine Downloads (wichtig: Browser-Spiel — jede Sekunde Ladezeit kostet Spieler).

Konkret: `MeshLambertMaterial`/`MeshStandardMaterial` mit Vertex-Colors oder Mini-Paletten-Textur, eine Directional Light mit Schatten (nur um den Spieler herum, `shadow.camera` klein halten), Hemisphere Light, Fog für Tiefe, dezentes Postprocessing erst ganz am Ende (Vignette, evtl. AO).

## 3.2 Asset-Quellen mit Lizenzhinweisen

| Kategorie | Quelle | Lizenz | Hinweis |
|---|---|---|---|
| Charakter + Animationen | **Mixamo** (mixamo.com, Adobe-Konto nötig, kostenlos) | Adobe-Nutzungsbedingungen: Nutzung in eigenen Spielen inkl. kommerziell erlaubt; **Weiterverkauf der rohen Assets verboten** | Charakter "X Bot"/"Y Bot" oder eigenen Charakter hochladen (Auto-Rigging). Benötigte Clips: Idle, Run, Sprint, Jump, Fall, Roll, Wall-Run (li/re, notfalls "Running Slide" zweckentfremden), Vault, Balance/Grind (z. B. "Skateboarding"-Pose), Stumble/Fall Flat |
| Stadt-Props, Module | **Kenney.nl** (City Kit, Roads, Props) | CC0 (keinerlei Auflagen) | Erste Wahl, konsistenter Stil |
| Low-Poly-Gebäude, Props | **Quaternius.com** | CC0 | Passt stilistisch zu Kenney |
| Einzelne Modelle | **Sketchfab** (Filter: Downloadable + CC) | Pro Asset prüfen! CC-BY erfordert Namensnennung (Credits-Screen) | Lizenz je Asset dokumentieren (eine `CREDITS.md` pflegen) |
| HDRI/Himmel | **Poly Haven** | CC0 | Ein kleines HDRI (1k) als Environment reicht |
| SFX | **Kenney Audio-Packs**, **freesound.org** | Kenney: CC0; Freesound: je Datei prüfen (CC0 filterbar!) | Schritte, Sprung, Landung, Grind-Schleifen, Whoosh, UI-Klicks |
| Musik | **Pixabay Music**, **Kevin MacLeod (incompetech.com)** | Pixabay-Lizenz (kommerziell ok); MacLeod: CC-BY (Credits!) | **Niemals** bekannte Musik/„gemafreie"-Grauzonen-Seiten. Keine Musik aus YouTube-Librarys ohne klare Lizenz. |

**Regel:** Jedes Asset beim Download sofort in `CREDITS.md` eintragen (Name, Quelle, Lizenz, Link). Nachträglich rekonstruieren ist fast unmöglich.

## 3.3 Asset-Pipeline

GLB (binäres GLTF) als einziges 3D-Format. Vor Einbindung durch `gltf-transform` optimieren (Meshopt-Kompression, Texturen → KTX2 oder max. 1024er JPG/WebP). Ziel: Gesamtdownload des Spiels < 25 MB, Start-Level < 10 MB.

---

# Kapitel 4 — Setup, GitHub & Hosting

## 4.1 Lokale Umgebung

```bash
# Voraussetzungen: Node.js ≥ 20 (nodejs.org, LTS), Git (git-scm.com)
node --version   # v20+
git --version

# Projekt anlegen (macht Task 1 – hier nur zur Übersicht)
npm create vite@latest rooftop-runner -- --template vanilla-ts
cd rooftop-runner
npm install three @dimforge/rapier3d-compat howler
npm install -D @types/three @types/howler
npm run dev      # → http://localhost:5173
```

## 4.2 GitHub-Workflow

```bash
git init
git add . && git commit -m "initial commit"
# Auf github.com: neues Repo "rooftop-runner" (public für kostenloses Pages) anlegen, dann:
git remote add origin git@github.com:DEIN-NAME/rooftop-runner.git
git push -u origin main
```

`.gitignore` (Task 1 erstellt sie): `node_modules/`, `dist/`, `.env`, `.env.*`, `.DS_Store`.

**Commit-Disziplin:** Nach jedem abgeschlossenen + verifizierten Task ein Commit mit Task-Nummer (`git commit -m "Task 07: Third-Person-Kamera"`). So kannst du jeden fehlgeschlagenen Task per `git checkout .` komplett verwerfen — das ist deine wichtigste Absicherung gegen ein Coding-Modell, das etwas kaputt macht.

## 4.3 GitHub Pages Deployment (fertige Workflow-Datei)

Wichtig: In `vite.config.ts` muss `base: '/rooftop-runner/'` stehen (= Repo-Name), sonst sind alle Asset-Pfade auf Pages kaputt.

`.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Aktivieren: Repo → Settings → Pages → Source: **GitHub Actions**. Danach deployt jeder Push auf `main` automatisch nach `https://DEIN-NAME.github.io/rooftop-runner/`.

**Grenzen von GitHub Pages:** Nur statische Dateien (kein Server-Code, keine Datenbank — dafür Supabase, Kap. 5), Soft-Limits ~1 GB Repo / 100 GB Bandbreite pro Monat. **Alternativen** (gleicher statischer Build, 5-Minuten-Umzug): Cloudflare Pages (großzügigste Bandbreite, empfohlen falls das Spiel viral geht), Netlify, Vercel. Du bist nicht eingesperrt.

---

# Kapitel 5 — Accounts, Login & Backend

## 5.1 Vergleich der Auth-/Backend-Dienste

| | **Supabase** | Firebase | Clerk | Auth0 |
|---|---|---|---|---|
| Auth + Datenbank aus einer Hand | ✅ (Postgres + RLS) | ✅ (Firestore) | ❌ nur Auth | ❌ nur Auth |
| Free Tier | 50k monatl. aktive User, 500 MB DB | Großzügig, aber Preismodell unübersichtlich | 10k MAU | 25k MAU |
| DSGVO / EU-Hosting | ✅ Region Frankfurt wählbar, AV-Vertrag verfügbar | US-Konzern, EU-Datenverarbeitung konfigurierbar, aber komplexer | US | US |
| Für Codegen (Doku/Verbreitung) | Sehr gut, einfache JS-API | Gut, aber API größer/älter | Gut (aber React-lastig) | Mittel |
| Lock-in | Gering (ist Postgres — Export jederzeit) | Hoch (Firestore proprietär) | Mittel | Mittel |

**Empfehlung: Supabase** — Auth + Highscore-DB in einem Dienst, EU-Region, SQL (verständlich + portabel), Row Level Security verhindert die schlimmsten Cheat-/Sicherheitsfehler deklarativ.

**Wichtig fürs Spieldesign:** Login **optional** halten. Spielen ohne Account (Fortschritt in LocalStorage), Account nur nötig, um Highscores online einzutragen. Das minimiert DSGVO-Pflichten und Einstiegshürde.

## 5.2 Datenmodell Highscores (SQL, wird in Task 26 eingespielt)

```sql
-- Profile (1:1 zu auth.users)
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null check (char_length(username) between 3 and 16),
  created_at timestamptz default now()
);

-- Scores
create table scores (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  level_id text not null,
  mode text not null check (mode in ('score', 'timetrial')),
  score int,                 -- für mode = score
  time_ms int,               -- für mode = timetrial
  created_at timestamptz default now()
);
create index on scores (level_id, mode, score desc);
create index on scores (level_id, mode, time_ms asc);

-- Row Level Security
alter table profiles enable row level security;
alter table scores enable row level security;
create policy "read all profiles"  on profiles for select using (true);
create policy "insert own profile" on profiles for insert with check (auth.uid() = id);
create policy "read all scores"    on scores   for select using (true);
create policy "insert own scores"  on scores   for insert with check (auth.uid() = user_id);
-- kein UPDATE/DELETE: Scores sind unveränderlich
```

**Ehrlichkeit zum Thema Cheating:** Client-seitige Spiele können Score-Submits immer fälschen (Konsole öffnen, Request nachbauen). Plausibilitätsgrenzen (max. Score pro Level, Mindestzeit) per DB-Constraint oder Edge Function einbauen und akzeptieren, dass ein globales Leaderboard eines Browser-Spiels nie 100 % cheatsicher ist. Für ein Hobby-Projekt ist das okay — nicht in Anti-Cheat-Aufwand versenken.

## 5.3 DSGVO-Minimum (Deutschland)

Auch als Hobby-Projekt öffentlich mit Accounts = du brauchst:

1. **Impressum** (§ 5 DDG): Name, ladungsfähige Anschrift, E-Mail. Pflicht, sobald die Seite nicht rein privat ist (Leaderboard + evtl. spätere Monetarisierung ⇒ Impressum einbauen). Wer seine Privatadresse nicht veröffentlichen will: Impressum-Service/c-o-Adresse nutzen.
2. **Datenschutzerklärung**: Welche Daten (E-Mail, Username, Scores, technisch notwendige Daten), Zweck, Rechtsgrundlage (Art. 6 Abs. 1 lit. b DSGVO für Account-Funktion), Empfänger (Supabase Inc., Verarbeitung in EU/Frankfurt, AV-Vertrag), Speicherdauer, Betroffenenrechte, Kontakt. Generator (z. B. datenschutz-generator.de) + manuelle Anpassung reicht als Startpunkt.
3. **Consent-Banner: nicht nötig**, solange du **keine** Analytics/Werbe-Cookies einsetzt. Supabase-Auth-Token sind technisch erforderlich (§ 25 Abs. 2 TDDDG) und einwilligungsfrei. **Deshalb: kein Google Analytics einbauen.** Wenn Statistik gewünscht: selbst gehostetes, cookiefreies Tool (z. B. Plausible/Umami) — dann reicht weiterhin die Datenschutzerklärung.
4. Links auf Impressum + Datenschutz vom Hauptmenü aus erreichbar machen (Task 27).

*(Hinweis: keine Rechtsberatung — vor echtem Launch 1× gegenlesen lassen.)*

---
# Kapitel 6 — Phase 2: Mobile (Android & iOS)

## 6.1 Capacitor vs. natives Neuschreiben

**Empfehlung: Capacitor** (nicht Cordova — Cordova ist faktisch im Wartungsmodus; Capacitor ist der moderne Nachfolger von Ionic).

- Dein Vite-Build (`dist/`) läuft unverändert in einer nativen WebView (Android: WebView/Chrome-Engine, iOS: WKWebView). WebGL 2 wird von beiden gut unterstützt.
- Ein Codebase für Web + Android + iOS. Natives Neuschreiben (Unity/Godot-Port) hieße: komplettes Projekt doppelt — für einen Solo-Dev indiskutabel.
- Ehrliche Einschränkung: In der WebView verlierst du ~10–20 % Performance gegenüber nativ. Mit Low-Poly-Stil und den Performance-Maßnahmen aus Kap. 7 ist das Ziel „60 FPS auf Mittelklasse-Geräten ab ~2021" erreichbar; sehr alte Geräte bekommen 30-FPS-Cap + reduzierte Schatten (Qualitäts-Toggle).

Vorgehen (Tasks 29–31): `npm i @capacitor/core @capacitor/cli` → `npx cap init` → `npx cap add android ios` → nach jedem Build `npx cap sync`. Android baust du in Android Studio (kostenlos, läuft auf Linux/Windows/Mac); **iOS-Build erfordert einen Mac** mit Xcode — ohne Mac: Cloud-Build-Dienst (z. B. Ionic Appflow) oder gebrauchten Mac mini einplanen.

## 6.2 Touch-Steuerung

- **Linke Bildschirmhälfte:** virtueller Joystick (Bibliothek `nipplejs` — bewährt, simpel) für Bewegung; Joystick-Ausschlag > 80 % = Sprint (ersetzt Shift).
- **Rechte Bildschirmhälfte:** Drag = Kamera (ersetzt Maus, ohne Pointer Lock), plus 2 Buttons unten rechts: **Sprung** (groß) und **Roll** (klein). Vault bleibt automatisch.
- Architektur-Voraussetzung (bereits in Task 3 angelegt): `Input.ts` liefert eine abstrakte Struktur `{ moveX, moveY, lookX, lookY, jump, sprint, roll }` — Tastatur/Maus und Touch sind austauschbare Quellen. Dadurch ist Touch ein additiver Task, kein Umbau.
- UI-Skalierung: HUD mit `rem`/`vh`-Einheiten + Safe-Area-Insets (`env(safe-area-inset-*)`) für Notch-Geräte.

## 6.3 Store-Veröffentlichung

| | **Google Play** | **Apple App Store** |
|---|---|---|
| Konto | 25 $ einmalig | 99 $/Jahr |
| Review | Stunden bis wenige Tage; seit 2024: neue Privat-Konten brauchen 12+ Tester über 14 Tage geschlossenen Test vor Produktions-Release! | 1–3 Tage; strenger. Ablehnungsrisiko 4.2 „Minimum Functionality" bei reinen Web-Wrappern — dagegen hilft: Touch-Steuerung nativ-wertig, Ladezeiten kurz, keine sichtbaren Browser-UI-Elemente, Assets lokal gebündelt (nicht von der Website nachgeladen) |
| Benötigte Assets | Icon 512², Feature-Grafik 1024×500, min. 2 Screenshots/Formfaktor, Datenschutz-URL, Data-Safety-Formular | Icon 1024², Screenshots (6,7" u. a.), Datenschutz-URL, Privacy „Nutrition Labels", Altersfreigabe |
| Altersfreigabe | IARC-Fragebogen (kostenlos im Play-Konsole-Flow) | Fragebogen im App Store Connect |

Realistisch einplanen: Store-Bürokratie (Konten, Formulare, Screenshots, Testphase) kostet einen Solo-Dev **1–2 volle Wochen**, unabhängig vom Code.

---

# Kapitel 7 — Was Anfänger vergessen

1. **Performance-Budget von Anfang an:** Draw-Calls < 150 (Meshes im LevelLoader mergen / `InstancedMesh` für wiederholte Props), ein Material pro Asset-Familie, Schatten-Kamera klein, Texturen ≤ 1024². **Kein `new Vector3()` im Frame-Loop** (GC-Ruckler — der häufigste Three.js-Anfängerfehler; wiederverwendbare Temp-Vektoren als Modul-Konstanten). Stats-Overlay (FPS/Draw-Calls) ab Task 3 eingebaut, damit Regressionen sofort auffallen.
2. **Ladezeiten:** Assets komprimieren (Kap. 3.3), Lade-Screen mit Fortschritt (AssetLoader), Level-JSONs sind winzig — nur GLB/Audio zählen.
3. **Testing/Debugging:** Für Spiellogik lohnen Unit-Tests kaum — stattdessen: (a) TypeScript strict mode, (b) Debug-Panel mit Teleport-Punkten + Zustand-Anzeige der FSM (Task 9), (c) nach jedem Task das Abnahmekriterium manuell prüfen, (d) alle 2–3 Tasks einmal auf dem deployten Pages-Build testen (nicht nur lokal — `base`-Pfad- und Groß/Kleinschreibungs-Fehler zeigen sich nur dort).
4. **Browser-Kompatibilität:** Chrome + Firefox laufend testen, Safari vor jedem Meilenstein (Safari ist am zickigsten: Audio erst nach User-Geste entsperren — macht der AudioManager —, Pointer-Lock-Eigenheiten, WebGL-Kontextverlust behandeln).
5. **Speichern:** LocalStorage mit **Versionsfeld** im Save-Objekt (`{ version: 1, ... }`) + Migrationsfunktion — sonst zerschießt jedes Format-Update alte Spielstände. Cloud-Save via Supabase nur für eingeloggte User als Bonus (Task 26+).
6. **Monetarisierung (realistisch):** Ein Browser-Hobby-Spiel verdient fast nie nennenswert Geld. Realistische Optionen der Reihe nach: kostenlos + „Buy me a coffee"-Link → Itch.io-Version mit Pay-what-you-want → Mobile-Version 1–3 € oder Rewarded Ads (Ads bringen erst ab zehntausenden Spielern relevantes Geld und kosten dich sofort das Consent-Banner-Thema!). Plane mit: Motivation = Lernen + Portfolio, nicht Einkommen.
7. **Rechtliches:** Name darf **keinerlei Anklang an „Tony Hawk"/THPS** haben (auch nicht „Tony Hawkish", „Pro Runner" in THPS-Schriftart o. ä. — Marken- und Trade-Dress-Risiko). Vor Festlegung: Name googeln + Markenrecherche (DPMA/EUIPO-Suche, 10 Minuten). Musik-/Asset-Lizenzen: Kap. 3.2, `CREDITS.md` pflegen. Keine echten Firmenlogos/Werbeplakate in der Stadt.
8. **Realistische Aufwandsschätzung** (Solo, KI-gestützt, ~10 h/Woche): MVP (M1–M3) ≈ 6–10 Wochen · Vertical Slice (M4–M5) ≈ +6–8 Wochen · Web-Release (M6) ≈ +3–4 Wochen · Mobile (M7) ≈ +4–6 Wochen. **Gesamt ≈ 5–7 Monate.** Alles unter der Hälfte davon ist Selbstbetrug; Spiele sind das Projektfeld mit dem höchsten Abbruchrisiko wegen unterschätzter „letzter 20 %" (Polish, Menüs, Sound, Stores).
9. **Häufigste Fallstricke genau dieses Projekttyps:**
   - Movement-Tuning frisst Wochen: Zahlen (Beschleunigung, Sprunghöhe, Wall-Run-Dauer) gehören in eine zentrale `tuning.ts`-Konstantendatei, damit du tunen kannst, ohne das Coding-Modell zu bemühen.
   - Rail-Grind-Snapping fühlt sich lange falsch an → großzügiger Snap-Radius + Magnetismus zur Kurve; im Zweifel großzügig zugunsten des Spielers.
   - Framerate-abhängige Physik (gelöst durch festen Timestep, Task 3) und framerate-abhängige Kamera (gelöst durch `damp` statt `lerp` mit festem Faktor).
   - Scope Creep: Balance-Minigame, Multiplayer, Charakter-Editor, offene Riesenstadt — alles auf die „nach Release"-Liste.
10. **Grenzen des günstigen Coding-Modells — und wie du Tasks dann kleiner schneidest:** Wenn ein Task scheitert, teile ihn nach dem Muster „erst Erkennung, dann Bewegung, dann Übergänge": z. B. Wall-Run → (a) nur Raycast-Erkennung + Debug-Anzeige „Wand links/rechts erkannt", (b) nur die Bewegungsänderung im Wall-Run, (c) nur Ein-/Austritts-Übergänge der FSM. Kleine Tasks mit sichtbarem Zwischenergebnis sind die zuverlässigste Strategie. Außerdem: dem Modell im Prompt immer die relevanten bestehenden Dateien mitgeben (Inhalt einfügen!), nie „schau ins Repo" sagen — es hat keinen Repo-Zugriff, wenn du es im Chat benutzt.

---

# Roadmap & Meilensteine

| Meilenstein | Inhalt | Tasks | „Fertig, wenn…" |
|---|---|---|---|
| **M0 — Fundament** | Projekt, Deployment, Game-Loop, Physik | 1–4 | Drehender Würfel + fallende Physik-Box online auf GitHub Pages |
| **M1 — Movement-MVP** | Testlevel, Laufen, Springen, Kamera, Feeling | 5–9 | Man kann mit gutem Gefühl durch das Graybox-Level laufen und springen |
| **M2 — Parkour-Kern** | Wall-Run, Wall-Jump, Vault, Rail-Grind | 10–14 | Alle vier Moves funktionieren im Testlevel; **Spielspaß-Check:** 10 Min. spielen macht Lust auf mehr — sonst erst tunen, nicht weiterbauen! |
| **M3 — Spiel-MVP** | Score/Combo, HUD, Bail | 15–16 | Ein Run erzeugt nachvollziehbare Punkte mit Combo-Multiplikator |
| **M4 — Vertical Slice** | City-Level, Collectibles, Zeitrennen, Missionen | 17–20 | Ein schöner Stadt-Distrikt mit 3 Missionen, Sammelobjekten, Zeitrennen |
| **M5 — Präsentation** | Charakter + Animationen, Audio, Menüs, Save | 21–24 | Sieht und klingt nach echtem Spiel; Fortschritt bleibt erhalten |
| **M6 — Web-Release** | Supabase-Auth, Leaderboard, Impressum/DSGVO, Performance-Pass | 25–28 | Öffentlich spielbar mit Online-Highscores und Rechtstexten |
| **M7 — Mobile** | Capacitor, Touch, Store-Release | 29–31 | Läuft auf deinem Android-Gerät / TestFlight; Store-Einreichung raus |

---
# Build-Backlog (Task-Liste mit kopierfertigen Prompts)

## So verwendest du die Build-Prompts

1. **Kopiere zuerst diesen PROJEKT-KONTEXT-Block** an den Anfang jeder neuen Coding-Modell-Session, **dann** den jeweiligen Task-Prompt dahinter.
2. Füge zusätzlich den **Inhalt der unter „Betroffene Dateien" gelisteten, bereits existierenden Dateien** in den Prompt ein (kopieren & einfügen). Das Modell hat keinen Zugriff auf dein Repo. (Wenn du das Modell über einen Coding-Agenten mit Repo-Zugriff nutzt — z. B. Claude Code —, entfällt das Einfügen; dann reicht der Kontextblock + Task-Prompt.)
3. Nach jedem Task: Verifikationsschritt ausführen → committen. Bei Fehlschlag: Fehlermeldung + betroffene Datei zurück ins Modell geben; nach der 2. gescheiterten Runde → Opus 4.8 mit frischer Session.
4. Modell-Empfehlung pro Task: **[S5]** = Sonnet 5 reicht · **[OPUS]** = Opus 4.8 nehmen · **[H]** = Haiku 4.5 reicht.

### PROJEKT-KONTEXT (vor jeden Build-Prompt kopieren)

```text
PROJEKT-KONTEXT — Rooftop Runner (3D-Parkour-Browser-Spiel)

Stack: Vite + TypeScript (strict) + Three.js (WebGL2) + Rapier-Physik
(@dimforge/rapier3d-compat) + Howler.js. Kein UI-Framework: HUD/Menüs sind
DOM-Elemente über dem Canvas. Deployment: statischer Build auf GitHub Pages
(vite base: '/rooftop-runner/').

Architektur-Regeln (verbindlich):
1. Projektstruktur: src/core (Game, EventBus, Input, AssetLoader),
   src/physics (PhysicsWorld), src/level (LevelLoader, levelTypes),
   src/player (PlayerController, PlayerStates, WallRun, RailGrind, Vault,
   PlayerAnimator), src/camera (FollowCamera), src/gameplay (ScoreSystem,
   Collectibles, TimeTrial, Missions), src/ui (HUD, Menus),
   src/audio (AudioManager), src/save (SaveGame), src/backend.
2. Systeme kommunizieren über den EventBus (emit/on), keine zyklischen Imports.
3. Physik ist die Wahrheit: Spielerposition lebt im Rapier-Character-Controller,
   das Three.js-Mesh wird pro Frame nachgezogen.
4. Fester Physik-Timestep: Akkumulator mit dt=1/60, max. 3 Steps pro Frame.
5. Alle Tuning-Zahlen (Geschwindigkeiten, Sprungkraft, Timings) als benannte
   Konstanten in src/player/tuning.ts sammeln.
6. Keine Objekt-Allokationen (new Vector3 etc.) in Frame-Loops — Temp-Objekte
   auf Modulebene wiederverwenden.
7. Level sind JSON-Dateien in public/levels/ (Boxen, Rampen, Rails als
   Punktlisten, Spawns, Marker). LevelLoader baut daraus Meshes + Collider.
8. Schreibe vollständige, lauffähige Dateien (keine Auslassungen wie "// rest
   unverändert"). Antworte mit einem Codeblock pro Datei, Pfad als Überschrift.

Aufgabe folgt unten. Setze exakt um, was gefordert ist — keine zusätzlichen
Features, keine Refactorings bestehender Dateien über das Nötige hinaus.
```

---

## M0 — Fundament

### Task 1 — Projekt-Setup mit Basis-Szene **[S5]**
- **Ziel:** Lauffähiges Vite+TS+Three.js-Projekt mit beleuchteter Testszene.
- **Abhängigkeiten:** keine. **Dateien:** `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.ts`, `.gitignore`.
- **Build-Prompt:**

```text
TASK 1 — Projekt-Setup
Erstelle ein neues Vite-Projekt (Template vanilla-ts) namens "rooftop-runner"
mit den Abhängigkeiten three, @dimforge/rapier3d-compat, howler (+ deren
@types als devDependencies). Liste zuerst die auszuführenden Shell-Befehle,
dann alle Dateien:
- vite.config.ts: base '/rooftop-runner/'.
- tsconfig.json: strict true.
- index.html: <canvas id="game">, leere Container <div id="hud"> und
  <div id="menu">, CSS: Canvas fullscreen, margin 0, HUD/Menu als absolute
  Overlays, ohne Pointer-Events auf dem HUD.
- src/main.ts: Three.js-Szene mit PerspectiveCamera, WebGLRenderer
  (antialias, pixelRatio capped auf 2), DirectionalLight + HemisphereLight,
  ein grüner Boden-Plane (100x100) und ein rotierender orangefarbener Würfel
  auf Augenhöhe. requestAnimationFrame-Loop, Resize-Handler.
- .gitignore: node_modules, dist, .env, .env.*, .DS_Store.
Fertig, wenn: npm run dev eine beleuchtete Szene mit rotierendem Würfel zeigt
und npm run build ohne Fehler durchläuft.
```

- **Verifikation:** `npm run dev` → Würfel dreht sich; `npm run build` fehlerfrei.

### Task 2 — GitHub Repo + Pages-Deployment **[H]**
- **Ziel:** Automatisches Deployment auf GitHub Pages.
- **Abhängigkeiten:** Task 1. **Dateien:** `.github/workflows/deploy.yml`.
- **Build-Prompt:**

```text
TASK 2 — GitHub-Pages-Deployment
Erstelle .github/workflows/deploy.yml für ein Vite-Projekt: bei Push auf main
mit Node 20 bauen (npm ci, npm run build) und dist/ über
actions/upload-pages-artifact@v3 + actions/deploy-pages@v4 auf GitHub Pages
deployen (permissions: pages write, id-token write; concurrency group pages).
Erkläre danach in 3 Sätzen, welche Repo-Einstellung ich aktivieren muss.
```

- **Verifikation:** Push auf `main` → Action grün → Spiel unter `https://<name>.github.io/rooftop-runner/` erreichbar (Würfel dreht sich).

### Task 3 — Game-Klasse, EventBus, Input, fester Timestep **[S5]**
- **Ziel:** Saubere Grundarchitektur statt Alles-in-main.ts.
- **Abhängigkeiten:** Task 1. **Dateien:** `src/core/Game.ts`, `src/core/EventBus.ts`, `src/core/Input.ts`, `src/main.ts` (umbauen).
- **Build-Prompt:**

```text
TASK 3 — Kern-Architektur
Refaktoriere main.ts in eine Game-Architektur:
- src/core/EventBus.ts: minimale typsichere Pub/Sub-Klasse (on/off/emit) mit
  einem zentralen Event-Map-Interface GameEvents (erstmal leer erweiterbar).
- src/core/Input.ts: Klasse, die Tastatur (KeyboardEvent.code) und Maus
  erfasst und pro Frame eine Struktur liefert:
  { moveX, moveY: -1..1, lookDX, lookDY: Maus-Delta, jumpPressed (nur im
  Frame des Drucks true), jumpHeld, sprintHeld, rollHeld, pausePressed }.
  Belegung: WASD, Maus, Space, ShiftLeft, KeyC, Escape. Pointer Lock beim
  Klick auf den Canvas anfordern; lookDX/DY nur bei aktivem Pointer Lock.
- src/core/Game.ts: besitzt Szene, Kamera, Renderer, Input, EventBus, ein
  Array von Systemen mit update(dt)-Interface. Game-Loop: variable
  Renderzeit, aber fixedUpdate(1/60) über Akkumulator (max 3 Steps/Frame)
  getrennt von update(dt) für Rendering/Kamera. Stats-Overlay: kleines
  DOM-Element oben links mit FPS und renderer.info.render.calls, jede
  Sekunde aktualisiert.
- src/main.ts: erstellt nur noch Game und startet es; Testwürfel+Boden
  bleiben vorerst in Game.
Fertig, wenn: Szene läuft wie vorher, FPS/Draw-Calls werden angezeigt,
Konsole loggt bei gedrücktem Space "jump pressed" (Testcode in Game).
```

- **Verifikation:** wie im Prompt; Testlog danach wieder entfernen (lassen).

### Task 4 — Rapier-Physik einbinden **[S5]**
- **Ziel:** Physik-Welt läuft; sichtbarer Beweis: fallende Box.
- **Abhängigkeiten:** Task 3. **Dateien:** `src/physics/PhysicsWorld.ts`, `src/core/Game.ts`.
- **Build-Prompt:**

```text
TASK 4 — Physik-Welt
Erstelle src/physics/PhysicsWorld.ts mit @dimforge/rapier3d-compat:
- async init(): RAPIER.init() abwarten, World mit Gravitation (0,-20,0)
  erstellen. (Hinweis: -20 statt -9.81 ist Absicht — Spiel-Gravitation.)
- step(): world.step() — wird von Game.fixedUpdate aufgerufen.
- Helper: addStaticBox(position, size, rotationY) -> Collider und
  addDynamicBox(position, size) -> { rigidBody, collider }.
- Expose world für spätere Queries.
Integiere in Game: nach init() einen statischen Boden-Collider (100x1x100
unter dem Plane) und eine dynamische Test-Box 5 m über dem Boden erzeugen;
ein Three.js-Box-Mesh folgt pro Frame der RigidBody-Translation/-Rotation.
Da RAPIER.init() async ist: Game.start() async machen und Physik vor dem
Loop-Start initialisieren.
Fertig, wenn: Die Box fällt sichtbar, prallt/kippt physikalisch korrekt und
bleibt auf dem Boden liegen.
```

- **Verifikation:** Box fällt und bleibt liegen; keine Konsolen-Fehler; Build läuft.

---

## M1 — Movement-MVP

### Task 5 — Level-Format + LevelLoader + Graybox-Testlevel **[S5]**
- **Ziel:** Datengetriebenes Level ersetzt Testwürfel.
- **Abhängigkeiten:** Task 4. **Dateien:** `src/level/levelTypes.ts`, `src/level/LevelLoader.ts`, `public/levels/testlevel.json`, `src/core/Game.ts`.
- **Build-Prompt:**

```text
TASK 5 — Level-System
1) src/level/levelTypes.ts: Typen für das Level-JSON:
   { name: string; spawn: [x,y,z];
     boxes: { pos:[x,y,z]; size:[x,y,z]; rotY?: number; color?: string }[];
     ramps: { pos:[x,y,z]; size:[x,y,z]; rotY?: number; tiltX?: number;
              color?: string }[];
     rails: { points: [x,y,z][] }[];
     markers?: { type:'gap'|'precision'|'checkpoint'|'collectible'|'finish';
                 pos:[x,y,z]; size?:[x,y,z]; id?: string }[] }
2) src/level/LevelLoader.ts: lädt JSON per fetch (Pfad relativ zu
   import.meta.env.BASE_URL!), erzeugt pro Box/Rampe ein BoxGeometry-Mesh
   (MeshLambertMaterial, Farbe aus JSON oder Palette) + statischen
   Rapier-Collider (Rampen = rotierte Boxen). Rails: pro Rail eine
   THREE.CatmullRomCurve3 aus den Punkten + TubeGeometry-Mesh (Radius 0.05,
   dunkelgrau), KEIN Collider; Kurven in einem Array railCurves
   veröffentlichen, zusätzlich pro Kurve 50 gesampelte Punkte cachen
   (getSpacedPoints) für spätere Abstands-Queries. Markers vorerst nur
   parsen und in einer Liste halten (gap/precision/checkpoint später).
3) public/levels/testlevel.json: Graybox-Parkour-Spielplatz ~60x60 m:
   großer Boden, 6-8 Plattformen auf 2-5 m Höhe mit springbaren Abständen
   (2-4 m horizontal), zwei parallele Wände (10 m lang, 4 m hoch, 1.2 m
   Abstand zu einer Plattformkante) für Wall-Runs, drei kniehohe Hindernisse
   (Höhe 0.8-1 m) für Vaults, eine leicht abfallende Rail mit 4 Punkten
   (Start 3 m Höhe, Ende 1 m) und eine zweite kurvige Rail. spawn auf dem
   Boden. Farben: Boden grau, Plattformen je Höhe abgestuft, Wände ziegelrot,
   Vault-Hindernisse gelb.
4) Game: Testwürfel/Testbox entfernen, Level beim Start laden.
Fertig, wenn: Das Graybox-Level sichtbar ist und die fallende Debug-Box von
Task 4 (temporär über dem Level spawnen) auf Plattformen liegen bleibt.
```

- **Verifikation:** Level sichtbar, Kollision funktioniert, `npm run build` ok.

### Task 6 — PlayerController: Laufen, Gravitation, Sprung **[S5]**
- **Ziel:** Steuerbare Spielfigur (vorerst Kapsel-Mesh).
- **Abhängigkeiten:** Task 5. **Dateien:** `src/player/PlayerController.ts`, `src/player/tuning.ts`, `src/core/Game.ts`.
- **Build-Prompt:**

```text
TASK 6 — Player-Grundcontroller
1) src/player/tuning.ts: exportierte Konstanten mit Kommentaren:
   RUN_SPEED=6, SPRINT_SPEED=9, ACCEL=40, DECEL=30, AIR_CONTROL=0.4,
   JUMP_VELOCITY=8, GRAVITY=20, COYOTE_MS=120, JUMP_BUFFER_MS=120,
   CAPSULE_RADIUS=0.35, CAPSULE_HALFHEIGHT=0.55 (Kapsel gesamt ~1.8 m).
2) src/player/PlayerController.ts: Rapier KinematicCharacterController:
   - KinematicPositionBased RigidBody + Kapsel-Collider am Level-Spawn.
   - characterController mit offset 0.01, autostep (maxHeight 0.4,
     minWidth 0.2), maxSlopeClimbAngle 50°, snapToGround 0.3.
   - fixedUpdate(dt, input, cameraYaw): Wunschbewegung aus moveX/moveY,
     rotiert um cameraYaw (Kamera-relativ). Horizontal: aktuelle
     Geschwindigkeit per ACCEL/DECEL Richtung Zielgeschwindigkeit bewegen
     (Sprint: SPRINT_SPEED); in der Luft nur AIR_CONTROL-Anteil der
     Steuerwirkung. Vertikal: Gravitation integrieren; grounded via
     computedGrounded(). Sprung mit Coyote-Time und Jump-Buffer laut
     tuning.ts. computeColliderMovement + setNextKinematicTranslation.
   - Sichtbares Platzhalter-Mesh: CapsuleGeometry, folgt dem Body;
     Blickrichtung (Yaw) dreht sanft in Bewegungsrichtung.
   - respawn(): zurück zum Spawn, Geschwindigkeit nullen (Taste R in Game
     verdrahten). Fällt der Spieler unter y=-10: auto-respawn.
3) Game: Player erstellen, in fixedUpdate/update einhängen. Kamera vorerst
   statisch schräg von oben aufs Level (cameraYaw entsprechend fest).
Fertig, wenn: Man kann mit WASD laufen, mit Shift sprinten, mit Space über
die 2-4-m-Lücken zwischen den Plattformen springen und Treppenstufen bis
0.4 m ohne Sprung hochlaufen.
```

- **Verifikation:** Movement-Gefühl grob ok; Lücken schaffbar; R respawnt.

### Task 7 — Third-Person-Kamera **[S5]**
- **Ziel:** Maus-orbitierende Follow-Kamera mit Kollision.
- **Abhängigkeiten:** Task 6. **Dateien:** `src/camera/FollowCamera.ts`, `src/core/Game.ts`.
- **Build-Prompt:**

```text
TASK 7 — Third-Person-Kamera
src/camera/FollowCamera.ts:
- Orbit um den Spieler: yaw aus lookDX, pitch aus lookDY (clamp -30°..+60°),
  Distanz 4.5 m, Zielpunkt Spielerposition + 1.5 m hoch.
- Framerate-unabhängige Glättung: exponentielles Damping
  (factor = 1 - Math.exp(-lambda*dt), lambda ≈ 12) für die Kameraposition.
- Kollision: Rapier-Raycast vom Zielpunkt Richtung Sollposition; bei Treffer
  Kamera auf 90 % der Trefferdistanz heranziehen (Collider des Spielers vom
  Raycast ausschließen).
- FOV dynamisch: 60° im Stand bis 75° bei SPRINT_SPEED, gedämpft.
- getYaw() für den PlayerController (Kamera-relative Bewegung).
Game: FollowCamera einbauen, statische Kamera entfernen; Pointer-Lock-Hinweis
("Click to play") als DOM-Overlay, verschwindet bei aktivem Lock.
Fertig, wenn: Kamera folgt weich, Maus dreht sie, sie clippt an Wänden nicht
durch, und Laufen ist kamerarelativ.
```

- **Verifikation:** 5 Minuten durchs Level laufen — keine Kamera-Ruckler/Clips.

### Task 8 — Roll-Landung & Fallschaden-Regel **[S5]**
- **Ziel:** Lande-Mechanik als Grundlage für Bail und Flow.
- **Abhängigkeiten:** Task 7. **Dateien:** `src/player/PlayerController.ts`, `src/core/EventBus.ts` (Events erweitern).
- **Build-Prompt:**

```text
TASK 8 — Landung & Roll
Erweitere den PlayerController:
- Fallhöhe tracken (höchster y-Wert seit Verlassen des Bodens minus Lande-y).
- Landung mit Fallhöhe > 3 m: Wird in den letzten 200 ms vor oder 100 ms
  nach der Landung die Roll-Taste gedrückt -> "roll": kurzer Speed-Boost
  (+20 % für 0.5 s), Event 'player:roll' emittieren. Ohne Roll bei Fallhöhe
  3-6 m: harter Stopp (Geschwindigkeit halbieren, 0.3 s keine Beschleunigung),
  Event 'player:hardLanding'. Fallhöhe > 6 m ohne Roll: Event 'player:bail'
  emittieren (Verhalten kommt in Task 9/15; vorerst 1.5 s Steuerung sperren
  und Geschwindigkeit nullen).
- GameEvents-Interface im EventBus um diese Events erweitern
  (mit Payload { fallHeight: number }).
Fertig, wenn: Sprung von der höchsten Plattform ohne Roll-Taste sperrt kurz
die Steuerung; mit rechtzeitigem C gibt es den Roll-Boost (Konsole loggt die
Events).
```

- **Verifikation:** Beide Fälle im Testlevel reproduzierbar.

### Task 9 — Zustandsmaschine + Debug-Panel **[S5]**
- **Ziel:** FSM als Rückgrat für alle Parkour-Moves.
- **Abhängigkeiten:** Task 8. **Dateien:** `src/player/PlayerStates.ts`, `src/player/PlayerController.ts`.
- **Build-Prompt:**

```text
TASK 9 — Player-Zustandsmaschine
1) src/player/PlayerStates.ts: FSM mit Zuständen RUN, AIR, WALLRUN, GRIND,
   VAULT, BAIL. Abstrakte Basisklasse PlayerState { enter(); update(dt);
   exit(); } mit Zugriff auf den PlayerController. StateMachine-Klasse mit
   transition(to)-Methode, die exit/enter aufruft, unerlaubte Übergänge
   (statische Erlaubnis-Tabelle) mit console.warn ablehnt und bei jedem
   Wechsel 'player:stateChange' { from, to } über den EventBus emittiert.
   Erlaubte Übergänge vorerst: RUN<->AIR (Sprung/Fallen/Landen),
   AIR->BAIL, RUN->BAIL, BAIL->RUN (nach Timer). WALLRUN/GRIND/VAULT sind
   deklariert, aber noch von nichts erreichbar.
2) PlayerController: bestehende Logik in RUN (Bodenbewegung) und AIR
   (Luft/Gravitation/Landung) verschieben; Bail aus Task 8 als BAIL-Zustand
   (1.5 s, dann RUN). Verhalten muss identisch zu vorher bleiben.
3) Debug-Panel: DOM-Element unten links zeigt aktuellen Zustand,
   Geschwindigkeit (m/s) und grounded-Flag; Taste F3 blendet es um.
Fertig, wenn: Verhalten unverändert, Debug-Panel zeigt RUN/AIR/BAIL-Wechsel
live an.
```

- **Verifikation:** Zustandsanzeige wechselt korrekt beim Springen/Fallen/Bailen.

---

## M2 — Parkour-Kern

### Task 10 — Wall-Run-Erkennung (nur Erkennung!) **[S5]**
- **Ziel:** Zuverlässige Wanderkennung mit Debug-Anzeige, noch keine Bewegung.
- **Abhängigkeiten:** Task 9. **Dateien:** `src/player/WallRun.ts`.
- **Build-Prompt:**

```text
TASK 10 — Wall-Run-Erkennung
src/player/WallRun.ts: Klasse WallRunDetector.
- check(playerPos, playerVelocity, world): führt zwei horizontale
  Rapier-Raycasts aus (von Brusthöhe, jeweils senkrecht links und rechts
  zur horizontalen Bewegungsrichtung, Länge 0.8 m, Spieler-Collider
  ausgeschlossen). Ergebnis: { side: 'left'|'right'|null; normal: Vector3;
  point: Vector3 }.
- Gültig nur, wenn: Wand-Normale annähernd horizontal (|normal.y| < 0.3),
  horizontale Geschwindigkeit > 4 m/s, Winkel zwischen Bewegungsrichtung und
  Wandtangente < 45° (man läuft an der Wand entlang, nicht frontal dagegen).
- Integration: Im AIR-Zustand jeden fixedUpdate aufrufen; Ergebnis nur im
  Debug-Panel anzeigen ("wall: left/right/none"). Noch KEINE Bewegungs- oder
  Zustandsänderung.
Fertig, wenn: Beim Sprung an den langen Wänden entlang zeigt das Debug-Panel
zuverlässig left/right an, bei Frontalanflug und im freien Sprung none.
```

- **Verifikation:** Anzeige stimmt an beiden Testwänden in beide Richtungen.

### Task 11 — Wall-Run-Bewegung + Wall-Jump **[OPUS]**
- **Ziel:** Der komplette Wall-Run-Move.
- **Abhängigkeiten:** Task 10. **Dateien:** `src/player/WallRun.ts`, `src/player/PlayerStates.ts`, `src/player/tuning.ts`.
- **Build-Prompt:**

```text
TASK 11 — Wall-Run & Wall-Jump
Baue auf dem WallRunDetector auf:
1) tuning.ts ergänzen: WALLRUN_GRAVITY_FACTOR=0.25, WALLRUN_MAX_MS=2000,
   WALLRUN_MIN_SPEED=4, WALLJUMP_NORMAL_IMPULSE=6, WALLJUMP_UP_IMPULSE=5,
   WALLRUN_CAMERA_TILT_DEG=10.
2) Neuer FSM-Zustand WALLRUN (Übergänge freischalten: AIR->WALLRUN,
   WALLRUN->AIR):
   - enter: Vertikalgeschwindigkeit auf max(vy, -1) kappen, Timer starten.
   - update: Bewegung entlang der Wandtangente in bisheriger Laufrichtung
     mit aktueller horizontaler Geschwindigkeit (leicht abklingend, -1 m/s²);
     Gravitation × WALLRUN_GRAVITY_FACTOR; Spieler leicht an die Wand ziehen
     (0.5 m/s Richtung -normal), damit er bei unebenen Collidern dranbleibt.
   - Abbruch -> AIR wenn: Timer > WALLRUN_MAX_MS, Detector verliert die Wand,
     Geschwindigkeit < WALLRUN_MIN_SPEED, oder Spieler wird grounded.
   - Sprungtaste -> Wall-Jump: Impuls = normal × WALLJUMP_NORMAL_IMPULSE +
     up × WALLJUMP_UP_IMPULSE, zusätzlich 70 % der Tangentialgeschwindigkeit
     behalten -> AIR. Event 'trick:walljump' emittieren.
   - Beim Eintritt Event 'trick:wallrun' emittieren.
3) Kamera: Im WALLRUN-Zustand Roll-Neigung um WALLRUN_CAMERA_TILT_DEG zur
   Wandseite, gedämpft rein und raus (FollowCamera liest den Zustand über
   das stateChange-Event oder einen Getter).
Fertig, wenn: Man kann mit Anlauf an einer Testwand entlang laufen (sichtbar
verlangsamtes Fallen, geneigte Kamera) und per Space in einem Bogen zur
gegenüberliegenden Wand/Plattform abspringen.
```

- **Verifikation:** Wand-zu-Wand-Sprung zwischen den beiden Parallelwänden gelingt reproduzierbar. **Danach tunen** (Zahlen in tuning.ts), bis es sich gut anfühlt — erst dann weiter.

### Task 12 — Vault **[S5]**
- **Ziel:** Automatisches Übersteigen kniehoher Hindernisse.
- **Abhängigkeiten:** Task 9 (FSM). **Dateien:** `src/player/Vault.ts`, `src/player/PlayerStates.ts`.
- **Build-Prompt:**

```text
TASK 12 — Vault
src/player/Vault.ts + FSM-Zustand VAULT (Übergänge RUN->VAULT, AIR->VAULT
bei Fallgeschwindigkeit > -2 m/s, VAULT->RUN, VAULT->AIR):
- Erkennung (nur in RUN mit Speed > 3 m/s oder flachem AIR): Raycast nach
  vorn auf Höhe 1.0 m, Länge 1.0 m. Bei Treffer: zweiter Raycast auf Höhe
  1.6 m gleicher Richtung — muss FREI sein. Dritter, abwärts gerichteter
  Raycast 1.2 m hinter der Hinderniskante ermittelt die Landehöhe.
- Ausführung: 0.4 s lang Position entlang einer QuadraticBezierCurve3
  (Start, Kontrollpunkt über der Hindernisoberkante + 0.3 m, Landepunkt)
  lerpen; Collider-Bewegung in dieser Zeit direkt setzen
  (setNextKinematicTranslation ohne computeColliderMovement), Eingaben
  ignorieren, horizontale Geschwindigkeit beibehalten. Danach RUN oder AIR
  je nach grounded. Event 'trick:vault' beim Start.
- Kein eigener Button: triggert automatisch, aber höchstens alle 500 ms.
Fertig, wenn: Anlauf auf die gelben Hindernisse führt zu flüssigem
Drüber-Steigen ohne Hängenbleiben; gegen hohe Wände passiert weiterhin nichts.
```

- **Verifikation:** Alle drei Vault-Hindernisse im Testlevel funktionieren; hohe Wände nicht.

### Task 13 — Rail-Grind **[OPUS]**
- **Ziel:** Aufschnappen, Fahren, Abspringen auf Rails.
- **Abhängigkeiten:** Task 9, Task 5 (railCurves). **Dateien:** `src/player/RailGrind.ts`, `src/player/PlayerStates.ts`, `src/player/tuning.ts`.
- **Build-Prompt:**

```text
TASK 13 — Rail-Grind
tuning.ts ergänzen: GRIND_SNAP_RADIUS=0.8, GRIND_MIN_SPEED=5,
GRIND_FRICTION=0.4 (m/s² Abbremsung), GRIND_JUMP_VELOCITY=7.

src/player/RailGrind.ts + FSM-Zustand GRIND (AIR->GRIND, GRIND->AIR):
1) Aufschnappen (jeden fixedUpdate im AIR-Zustand, nur bei vy <= 0.5):
   Über alle railCurves des Levels: mit den 50 gecachten Sample-Punkten den
   nächstgelegenen Punkt zur Spielerposition finden (Fuß des Spielers,
   also Position - Kapselhöhe/2). Distanz < GRIND_SNAP_RADIUS und Spieler
   höchstens 0.5 m ÜBER dem Punkt -> GRIND. Beim Eintritt: Kurvenparameter t
   des nächsten Sample-Punkts als Start; Fahrtrichtung = Vorzeichen von
   dot(horizontalVelocity, curve.getTangentAt(t)); Startgeschwindigkeit =
   max(horizontale Geschwindigkeit, GRIND_MIN_SPEED).
2) Fahren: t so fortschreiben, dass die Weltgeschwindigkeit konstant der
   Grind-Geschwindigkeit entspricht (Bogenlänge beachten:
   dt_param = speed*dt / Kurvenlänge, curve.getLength() beim Laden cachen).
   Geschwindigkeit pro Sekunde um GRIND_FRICTION reduzieren, min.
   GRIND_MIN_SPEED. Position = Kurvenpunkt + Kapsel-Offset nach oben;
   direkt setzen (setNextKinematicTranslation), Yaw folgt der Tangente.
   Pro volle Sekunde im Grind Event 'trick:grindTick' emittieren; beim
   Eintritt 'trick:grindStart', beim Verlassen 'trick:grindEnd'
   { durationMs }.
3) Verlassen: Sprungtaste -> AIR mit Tangentialgeschwindigkeit +
   GRIND_JUMP_VELOCITY nach oben. Kurvenende (t<=0 oder >=1) -> AIR mit
   Tangentialgeschwindigkeit. Kein erneutes Aufschnappen auf DIESELBE Rail
   für 300 ms.
Fertig, wenn: Sprung auf die gerade Rail schnappt sichtbar auf, der Spieler
gleitet mit Rotation entlang der Kurve bis zum Ende oder springt ab; die
kurvige Rail funktioniert ebenfalls.
```

- **Verifikation:** Beide Rails in beide Richtungen befahrbar; Absprung auf Plattform möglich. **Feeling-Tuning einplanen** (Snap-Radius, Reibung) — das ist der Task mit dem meisten Nacharbeitsbedarf.

### Task 14 — Gap- & Präzisions-Marker **[S5]**
- **Ziel:** Belohnbare Sprünge (Grundlage fürs Score-System).
- **Abhängigkeiten:** Task 9, Task 5 (markers). **Dateien:** `src/gameplay/` (neu: `Markers.ts`), `public/levels/testlevel.json`.
- **Build-Prompt:**

```text
TASK 14 — Gap- und Präzisionszonen
src/gameplay/Markers.ts: verarbeitet die markers-Liste des Levels.
- type 'gap': unsichtbare Box-Zone (size aus JSON). Durchfliegt der Spieler
  sie im AIR/WALLRUN/GRIND-Zustand vollständig (Eintritt und Austritt ohne
  grounded dazwischen), Event 'trick:gap' { id }.
- type 'precision': sichtbare, leuchtende flache Plattform-Markierung
  (1x1 m, emissives Material). Landet der Spieler mit beiden "Füßen"
  (Kapselzentrum horizontal < 0.4 m vom Markerzentrum) aus > 2 m Fallhöhe
  darauf: Event 'trick:precision' { id }, Marker pulst kurz auf.
  Cooldown 5 s pro Marker.
- Debug: F3-Panel zeigt zusätzlich zuletzt ausgelöstes Trick-Event.
testlevel.json: zwei gap-Marker (zwischen den weitesten Plattformen, in der
Lücke schwebend) und zwei precision-Marker auf kleinen Plattformen ergänzen.
Fertig, wenn: Beide Marker-Typen im Debug-Panel ihre Events auslösen.
```

- **Verifikation:** Events erscheinen im Debug-Panel bei korrekter Aktion, nicht bei normalem Laufen.

---
## M3 — Spiel-MVP

### Task 15 — Score-, Combo- & Bail-System **[S5]**
- **Ziel:** Punkte mit Multiplikator, THPS-artiges Banking.
- **Abhängigkeiten:** Tasks 11–14. **Dateien:** `src/gameplay/ScoreSystem.ts`.
- **Build-Prompt:**

```text
TASK 15 — Score & Combo
src/gameplay/ScoreSystem.ts, rein eventgetrieben (lauscht auf dem EventBus):
- Basispunkte: wallrun 100, walljump 150, vault 75, grindStart 50 +
  grindTick 50, gap 200, precision 250, roll (nach >4 m Fall) 50.
- Combo-Logik: Erster Trick startet eine Combo. Jeder weitere Trick erhöht
  den Multiplikator um 1 (max 10) und fügt Basispunkte zur Combo-Summe
  hinzu. Die Combo endet ("Banking": comboSumme × Multiplikator wird dem
  Gesamtscore gutgeschrieben), wenn der Spieler länger als 1.5 s im
  RUN-Zustand ist, ohne dass ein neues Trick-Event kam. Events 'player:bail'
  und 'player:hardLanding' brechen die Combo ersatzlos ab (0 Punkte).
- Emittiert für die UI: 'score:combo' { sum, multiplier, active },
  'score:banked' { amount, total }, 'score:lost' { amount },
  'score:total' { total }.
- API: reset(), getTotal() — für Zeitrennen/Missionen.
Fertig, wenn: Konsolen-Logging zeigt plausible Combos, z. B. Wallrun ->
Walljump -> Grind -> Gap -> saubere Landung ergibt (100+150+50+…+200) × 4+.
```

- **Verifikation:** Kette aus 3+ Tricks bankt korrekt; Bail verwirft.

### Task 16 — HUD **[S5]**
- **Ziel:** Sichtbares Feedback statt Konsole.
- **Abhängigkeiten:** Task 15. **Dateien:** `src/ui/HUD.ts`, `index.html` (CSS).
- **Build-Prompt:**

```text
TASK 16 — HUD
src/ui/HUD.ts (DOM in #hud, kein Framework):
- Oben rechts: Gesamtscore (monospace, groß).
- Mitte rechts: laufende Combo "1.250 × 4" — nur sichtbar bei aktiver Combo,
  wächst leicht mit dem Multiplikator (CSS transform), färbt sich ab ×5
  orange, ab ×8 rot. Beim Banking: kurze "+5.000"-Aufsteig-Animation zum
  Gesamtscore; bei Combo-Verlust: rotes Wackeln und Ausblenden.
- Unten mitte: dezenter Geschwindigkeitsbalken (0-9 m/s).
- Trick-Ticker: löst ein trick:*-Event aus, erscheint kurz der Trick-Name
  ("WALL RUN", "GAP!") mittig unten, stapelt bei schnellen Folgen.
- Alle Updates über EventBus-Subscriptions; CSS in index.html oder
  separater ui.css. Stil: kantig, halbtransparent dunkel, weiße Schrift,
  eine Akzentfarbe (#ff6a00).
Fertig, wenn: Ein Parkour-Run liest sich komplett im HUD ohne Konsole.
```

- **Verifikation:** Combo-Aufbau, Banking und Verlust sind visuell klar.

---

## M4 — Vertical Slice

### Task 17 — City-Level „Rooftops District" **[S5, ggf. mehrfach iterieren]**
- **Ziel:** Erstes echtes Level (~200×200 m Dächerlandschaft).
- **Abhängigkeiten:** Task 14. **Dateien:** `public/levels/city01.json`, `src/level/LevelLoader.ts` (kleine Erweiterungen), `src/core/Game.ts` (Levelwahl per URL-Param `?level=`).
- **Build-Prompt:**

```text
TASK 17 — City-Level
1) LevelLoader erweitern: boxes bekommen optionales Feld "instanced": bei
   gleicher size+color werden Boxen zu einem InstancedMesh
   zusammengefasst (Collider bleiben einzeln). Fog (Farbe wie Himmel,
   40-180 m) und ein simples Skybox-Blau bzw. Vertical-Gradient einbauen.
   Level per URL-Parameter ?level=city01 wählbar (Default testlevel).
2) public/levels/city01.json: Entwirf eine Dächerlandschaft ~200x200 m,
   ~25-35 Gebäude (Boxen, Höhen 6-30 m, Dachflächen begehbar) in 3-4
   "Straßenzügen" mit 2.5-5 m Sprunglücken zwischen benachbarten Dächern
   (springbar bei RUN_SPEED 6 bis SPRINT 9 + Sprungweite ~4-7 m; Höhenabfall
   in Sprungrichtung großzügig erlauben, Aufwärtssprünge max +1 m).
   Elemente: mind. 8 Rails (Dachkanten, schräge Verbindungen zwischen
   Gebäuden), 6 Wall-Run-Passagen (Aufzugstürme/Reklamewände mit
   Plattform-Anschluss), 10 Vault-Hindernisse (Lüftungskästen), 12
   gap-Marker über den besten Lücken, 6 precision-Marker, Farbpalette:
   3 Gebäude-Grautöne + Terrakotta-Akzente, Rails dunkel. spawn auf einem
   mittelhohen Dach. Unten auf Straßenniveau: durchgehender Boden
   (Respawn-Trigger bleibt y=-10, Straße liegt auf y=0 — Sturz auf die
   Straße ist erlaubt, aber es gibt Treppen-Boxen zurück nach oben an
   4 Stellen).
   WICHTIG: Gib das JSON vollständig aus. Plane die Koordinaten
   systematisch (Raster), damit Lücken konsistent springbar sind.
Fertig, wenn: ?level=city01 lädt flüssig (Draw-Calls < 150 laut Stats),
und eine Route über mind. 8 Dächer mit 2 Rails und 1 Wall-Run ist spielbar.
```

- **Verifikation:** Route selbst abfahren; Stellen, die nicht springbar sind, notieren und als Korrektur-Prompt zurückgeben („Lücke zwischen Gebäude bei x,z … ist zu weit — rücke näher"). Rechne mit 2–3 Iterationen.

### Task 18 — Sammelobjekte **[S5]**
- **Ziel:** Collectibles mit Persistenz-Anschluss.
- **Abhängigkeiten:** Task 17. **Dateien:** `src/gameplay/Collectibles.ts`, Level-JSONs.
- **Build-Prompt:**

```text
TASK 18 — Sammelobjekte
src/gameplay/Collectibles.ts: verarbeitet markers vom type 'collectible'
(id erforderlich). Darstellung: schwebendes, rotierendes Oktaeder
(emissiv, Akzentfarbe), leichtes Auf-Ab-Schweben (sin). Aufsammeln bei
Distanz < 1 m: Objekt verschwindet mit kurzem Scale-Pop, Events
'collect:pickup' { id } und +100 Score-Basispunkte als Trick-Event
(zählt zur Combo). getCollected(): Set<string>, setCollected(ids) zum
Wiederherstellen (Save kommt später — eingesammelte respawnen bis dahin
bei Levelneustart). HUD ergänzen: "7/20"-Zähler oben links.
city01.json: 20 collectible-Marker auf interessanten Routen platzieren
(Rails entlang, hinter Wall-Runs, auf Präzisions-Plattformen).
Fertig, wenn: Zähler funktioniert und Aufsammeln zur Combo beiträgt.
```

- **Verifikation:** Zähler + Combo-Beitrag sichtbar.

### Task 19 — Zeitrennen **[S5]**
- **Ziel:** Checkpoint-Rennen mit Medaillen.
- **Abhängigkeiten:** Task 17. **Dateien:** `src/gameplay/TimeTrial.ts`, `src/ui/HUD.ts`, Level-JSON.
- **Build-Prompt:**

```text
TASK 19 — Zeitrennen
src/gameplay/TimeTrial.ts:
- Level-Marker: type 'checkpoint' (ringförmige, halbtransparente Tore,
  3 m Durchmesser, nummeriert via id "cp1"...) und ein 'finish'.
  Ein Marker type 'trialStart' startet das Rennen bei Berührung.
- Ablauf: Start -> Timer läuft (HUD oben mitte, mm:ss.ms), Checkpoints
  müssen in Reihenfolge durchflogen werden (nächstes Tor leuchtet,
  übrige gedimmt), Finish stoppt. R während des Rennens: Neustart am
  trialStart. Medaillen aus Level-JSON-Feld "trialTimes": { gold, silver,
  bronze } (ms). Ergebnis-Event 'trial:finished' { timeMs, medal }.
- Ergebnis-Overlay (einfaches DOM): Zeit, Medaille, Buttons "Retry"/"Free
  Run" (Events, Verdrahtung übernimmt Game/Menus später — vorerst Reload
  bzw. Overlay schließen).
city01.json: einen Kurs mit trialStart, 8 Checkpoints entlang einer
flüssigen Route (Rails/Wall-Runs einbauend) und finish + trialTimes
(gold 60000, silver 80000, bronze 100000) ergänzen.
Fertig, wenn: Der Kurs ist komplett abfahrbar und das Overlay zeigt
Zeit + Medaille.
```

- **Verifikation:** Kurs 2× fahren, Bestzeit-Logik + Reihenfolge-Zwang prüfen.

### Task 20 — Missionssystem (datengetrieben, einfach) **[S5]**
- **Ziel:** 3 Missionstypen ohne Skript-Engine.
- **Abhängigkeiten:** Tasks 15, 18, 19. **Dateien:** `src/gameplay/Missions.ts`, `public/levels/city01.missions.json`.
- **Build-Prompt:**

```text
TASK 20 — Missionen
Missionsdefinitionen als JSON (public/levels/city01.missions.json), Typen:
- { id, title, type:'score', target: 10000, timeLimitS: 120 }  -> erreiche
  X Punkte in Y Sekunden
- { id, title, type:'collect', ids: [...], timeLimitS: 90 }    -> sammle
  die gelisteten Collectibles in der Zeit
- { id, title, type:'combo', targetMultiplier: 6 }             -> lande
  (banke) eine Combo mit Multiplikator >= X
src/gameplay/Missions.ts: lädt die Datei, bietet start(id) / abort();
lauscht auf Score-/Collect-Events; HUD-Element oben mitte mit Missionsziel
+ Fortschritt + Restzeit; bei Erfolg/Fehlschlag Overlay (wie Task 19) und
Events 'mission:completed'/'mission:failed' { id }. Erfolge in einem
Set<string> merken (Persistenz kommt in Task 24). Missionsauswahl vorerst:
Tasten 1/2/3 starten Mission 1-3 (nur außerhalb aktiver Mission/Rennen).
Definiere 3 sinnvolle Missionen für city01.
Fertig, wenn: Alle 3 Missionstypen sind spiel- und gewinnbar/verlierbar.
```

- **Verifikation:** Jede Mission je 1× gewinnen und 1× verlieren.

---

## M5 — Präsentation

### Task 21 — Charakter + Animationen **[OPUS]**
- **Ziel:** Mixamo-Charakter ersetzt die Kapsel.
- **Abhängigkeiten:** Task 13 (alle Zustände existieren). **Dateien:** `src/player/PlayerAnimator.ts`, `src/core/AssetLoader.ts`, `public/models/runner.glb`.
- **Vorarbeit durch dich (manuell, ~1–2 h):** Auf mixamo.com Charakter „X Bot" wählen; Animationen einzeln **ohne Skin** als FBX laden: Idle, Running, Sprinting, Jump, Falling Idle, Rolling, Running Slide (als Grind-Pose), Left/Right Wall Run (falls vorhanden, sonst Running geneigt), Vaulting/Jumping Over, Stumble Backwards (Bail), Getting Up. In Blender: Charakter + Animationen importieren, als **eine GLB** mit benannten Clips exportieren (`public/models/runner.glb`). Alternativ das Modell + Clips einzeln als GLB und im Prompt die Dateinamen nennen.
- **Build-Prompt:**

```text
TASK 21 — Charakter & Animation
Gegeben: public/models/runner.glb — ein geriggter Charakter mit
AnimationClips namens: Idle, Run, Sprint, Jump, Fall, Roll, Grind,
WallRunL, WallRunR, Vault, Bail, GetUp. (Passe die Namen an die an, die
ich dir nenne: <HIER DEINE CLIPNAMEN EINFÜGEN>.)
1) src/core/AssetLoader.ts: GLTFLoader (+ DRACO optional), lädt das Modell
   einmalig mit einfachem Lade-Overlay (Prozent), Cache per URL.
2) src/player/PlayerAnimator.ts: AnimationMixer auf dem geladenen Modell.
   Mapping FSM-Zustand -> Clip: RUN steht/läuft/sprintet (Blend zwischen
   Idle/Run/Sprint über Geschwindigkeit, crossFade 0.15 s), AIR: Jump
   einmalig bei Absprung, dann Fall (loop), WALLRUN: WallRunL/R je nach
   Seite, GRIND: Grind (loop), VAULT: Vault (einmalig, Dauer an 0.4 s
   angepasst via timeScale), BAIL: Bail einmalig + GetUp, Roll-Event: Roll
   einmalig mit höherer Priorität. Alle Wechsel mit crossFadeTo, keine
   harten Schnitte. Animator lauscht auf 'player:stateChange' und
   'player:roll'.
3) PlayerController: Kapsel-Mesh unsichtbar schalten (Debug-Toggle F4
   zeigt sie wieder), Modell als Kind des Player-Objekts, Füße auf
   Kapselunterkante, Blickrichtung wie bisher.
Fertig, wenn: Alle Zustände zeigen die passende Animation mit weichen
Übergängen; kein T-Pose-Blitzen.
```

- **Verifikation:** Jeden Zustand durchspielen und auf Übergänge achten. Typische Nacharbeit: Clip-Namen, Fuß-Offset, timeScale.

### Task 22 — Audio **[S5]**
- **Ziel:** SFX + Musik mit Browser-Autoplay-Handling.
- **Abhängigkeiten:** Task 15. **Dateien:** `src/audio/AudioManager.ts`, `public/audio/*`.
- **Vorarbeit:** SFX gemäß Kap. 3.2 besorgen (Schritte, Sprung, Landung, Roll, Grind-Loop, Wind-Loop, Whoosh, Collect, Combo-Bank, Bail, UI-Klick; 1 Musik-Track), in `public/audio/` legen, `CREDITS.md` ergänzen.
- **Build-Prompt:**

```text
TASK 22 — Audio
src/audio/AudioManager.ts mit Howler.js:
- Erst nach erster User-Geste initialisieren (Pointer-Lock-Klick) —
  Browser-Autoplay-Policy.
- Event-Mapping über den EventBus: Schritte als Loop mit Rate abhängig von
  Geschwindigkeit (nur RUN + bewegt), Sprung/Landung/Roll/Vault einmalig,
  Grind als Loop (Start/Stop mit grindStart/grindEnd, leichtes
  Pitch-Wobble), Wind-Loop mit Lautstärke proportional zur Geschwindigkeit
  im AIR, Collect/Banking/Bail-Sounds, UI-Klick.
- Musik: ein Track als Loop, -6 dB unter SFX, Taste M schaltet Musik um.
- Master-Volumes (music, sfx) als Felder, spätere Settings-Anbindung.
- Dateiliste (public/audio/): <HIER DEINE DATEINAMEN EINFÜGEN>.
Fertig, wenn: Ein Run klingt stimmig; vor dem ersten Klick ist es still
und es gibt keine Konsolen-Warnungen.
```

- **Verifikation:** Safari zusätzlich testen (strengste Autoplay-Policy).

### Task 23 — Menüs & Game-Flow **[S5]**
- **Ziel:** Start-/Pause-/Results-Screens, Levelwahl.
- **Abhängigkeiten:** Tasks 19, 20, 22. **Dateien:** `src/ui/Menus.ts`, `src/core/Game.ts`.
- **Build-Prompt:**

```text
TASK 23 — Menüs
src/ui/Menus.ts (DOM in #menu, gleicher Stil wie HUD):
- Startmenü: Titel, Buttons "Free Run" (Levelwahl: Testlevel/City),
  "Missions" (Liste aus Missions.ts mit Erledigt-Häkchen), "Time Trial",
  Lautstärke-Slider (music/sfx), Links zu impressum.html/datenschutz.html.
- Pausemenü (Esc): Resume, Restart, Settings (Lautstärke, Qualität
  hoch/niedrig — Qualität schaltet Schatten und pixelRatio), Back to Menu.
  Bei Pause: Game-Loop-Updates anhalten (Rendering weiter), Pointer Lock
  freigeben.
- Results-Overlays von Task 19/20 hierher vereinheitlichen.
- Game: sauberer Zustand MENU/PLAYING/PAUSED; Level-Neustart ohne Reload
  (Level entladen: Meshes disposen, Collider entfernen — LevelLoader
  bekommt eine unload()-Methode).
Fertig, wenn: Kompletter Flow Menü -> Spiel -> Pause -> Menü -> anderes
Level funktioniert ohne Seiten-Reload und ohne Speicherleck-Anzeichen
(Draw-Calls steigen nicht bei wiederholtem Levelwechsel).
```

- **Verifikation:** 5× Levelwechsel — Draw-Calls/Speicher stabil.

### Task 24 — Savegame (LocalStorage) **[S5]**
- **Ziel:** Fortschritt bleibt erhalten.
- **Abhängigkeiten:** Task 23. **Dateien:** `src/save/SaveGame.ts` + Integrationen.
- **Build-Prompt:**

```text
TASK 24 — Savegame
src/save/SaveGame.ts: LocalStorage-Wrapper mit versioniertem Schema:
{ version: 1, collectibles: { [levelId]: string[] },
  missions: string[] (completed ids),
  bestTimes: { [levelId]: number }, bestScores: { [levelId]: number },
  settings: { musicVol, sfxVol, quality, muted } }.
- load(): parse mit try/catch; unbekannte version -> Migrationstabelle
  (vorerst nur v1); korrupt -> Default + Backup des alten Strings unter
  eigenem Key.
- Debounced save (500 ms) bei Änderungen; Systeme (Collectibles, Missions,
  TimeTrial, ScoreSystem-Bestwert, Menus-Settings) lesen beim Start und
  schreiben über SaveGame. Collectibles bleiben über Neustarts gesammelt.
- "Reset progress"-Button in den Settings (mit confirm()).
Fertig, wenn: Reload der Seite erhält Collectibles, Missionshaken,
Bestzeiten und Settings.
```

- **Verifikation:** Reload-Test + Reset-Test.

---

## M6 — Web-Release

### Task 25 — Supabase-Projekt + Auth **[S5]**
- **Ziel:** Optionaler Login (Magic Link + Username).
- **Abhängigkeiten:** Task 23. **Vorarbeit durch dich:** supabase.com-Konto, neues Projekt (Region **eu-central (Frankfurt)**), unter Settings → API: `URL` + `anon key` kopieren.
- **Dateien:** `src/backend/supabaseClient.ts`, `src/ui/Menus.ts`, `.env`.
- **Build-Prompt:**

```text
TASK 25 — Supabase Auth
1) npm i @supabase/supabase-js. src/backend/supabaseClient.ts: Client aus
   import.meta.env.VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (.env-Datei
   + .env.example anlegen; Hinweis: der anon key ist public-by-design,
   Sicherheit kommt aus RLS — er darf ins Frontend, aber .env bleibt
   trotzdem in .gitignore und die Werte werden im GitHub-Action-Build als
   Repository-Secrets/Variables injiziert: ergänze die nötigen env-Zeilen
   im deploy.yml Build-Step).
2) Menü: "Sign in"-Bereich — E-Mail-Feld, Magic-Link-Login
   (signInWithOtp), Status "Check your email". Nach erstem Login: Prompt
   für Username (3-16 Zeichen), Insert in profiles-Tabelle (Fehler
   "unique violation" -> "Name vergeben"). Eingeloggt: Username + Logout
   im Menü. Session via onAuthStateChange halten.
3) Alles fehlertolerant: ohne Netz/ohne Login bleibt das Spiel voll
   spielbar; Backend-Fehler erscheinen als dezente Toasts.
Fertig, wenn: Login per Magic Link funktioniert (lokal + auf GitHub
Pages), Username wird angelegt und nach Reload erkannt.
```

- **Verifikation:** Kompletter Login-Flow auf dem deployten Build.

### Task 26 — Leaderboard **[S5]**
- **Ziel:** Online-Highscores pro Level/Modus.
- **Abhängigkeiten:** Task 25. **Vorarbeit:** SQL aus Kap. 5.2 im Supabase SQL-Editor ausführen.
- **Dateien:** `src/backend/leaderboard.ts`, `src/ui/Menus.ts`.
- **Build-Prompt:**

```text
TASK 26 — Leaderboard
Gegeben: Tabellen profiles/scores mit RLS wie folgt: <SQL AUS KAP. 5.2
EINFÜGEN>.
src/backend/leaderboard.ts:
- submitScore(levelId, mode, value): eingeloggt -> Insert (score bzw.
  time_ms); vorher Client-Plausibilisierung (score < 1_000_000,
  time_ms > 15_000). Nur senden, wenn besser als der eigene bisherige
  Online-Bestwert (vorher per Query prüfen).
- getTop(levelId, mode, limit=10): Join auf profiles.username, sortiert
  (score desc bzw. time_ms asc). getMyRank(levelId, mode).
- UI: Results-Overlay (Zeitrennen + Score-Missionen) zeigt danach Top 10
  + eigenen Rang; nicht eingeloggt: Hinweis "Sign in to submit" +
  Sign-in-Button. Leaderboard-Ansicht auch im Startmenü pro Level.
Fertig, wenn: Zwei verschiedene Accounts erscheinen korrekt sortiert im
Leaderboard; Gast sieht das Board, kann aber nicht submitten.
```

- **Verifikation:** Mit 2 Test-Accounts (2 Browser) gegeneinander eintragen.

### Task 27 — Impressum, Datenschutz, Credits **[H]**
- **Ziel:** Rechtstexte + Attribution.
- **Abhängigkeiten:** keine. **Dateien:** `impressum.html`, `datenschutz.html`, `CREDITS.md`, Menü-Links.
- **Build-Prompt:**

```text
TASK 27 — Rechtsseiten
Erstelle impressum.html und datenschutz.html als eigenständige, schlicht
gestylte statische Seiten (gleiche Farbwelt wie das Spiel, Link zurück).
Impressum: Platzhalter [NAME], [ADRESSE], [E-MAIL]. Datenschutzerklärung
für: statisches Hosting auf GitHub Pages (Server-Logs durch GitHub Inc.),
optionale Accounts über Supabase (E-Mail, Username, Scores; Region
Frankfurt; Rechtsgrundlage Art. 6 Abs. 1 lit. b DSGVO), LocalStorage für
Spielstände (§ 25 Abs. 2 TDDDG, technisch erforderlich), keine Cookies zu
Werbe-/Analysezwecken, Betroffenenrechte, Kontakt. Deutlicher Hinweis im
Code-Kommentar, dass der Text vom Betreiber geprüft/angepasst werden muss.
Zusätzlich eine Credits-Sektion im Startmenü, die CREDITS.md-Einträge
(Format: Name — Quelle — Lizenz) anzeigt.
Fertig, wenn: Beide Seiten deployt erreichbar und aus dem Menü verlinkt
sind.
```

- **Verifikation:** Links vom Startmenü aus prüfen; Platzhalter ausfüllen (du selbst!).

### Task 28 — Performance-Pass **[OPUS]**
- **Ziel:** Stabile 60 FPS Desktop, Vorbereitung Mobile.
- **Abhängigkeiten:** M5 komplett. **Dateien:** diverse (Analyse-Task).
- **Build-Prompt:**

```text
TASK 28 — Performance-Audit
Ich gebe dir folgende Dateien: Game.ts, LevelLoader.ts, PlayerController.ts,
FollowCamera.ts, HUD.ts, PlayerAnimator.ts <INHALTE EINFÜGEN> und diese
Messwerte aus dem Stats-Overlay: <FPS/DRAW-CALLS EINTRAGEN, Desktop +
schwächstes verfügbares Gerät>.
Prüfe systematisch auf: (1) Allokationen in Frame-Loops (new, clone,
Array-Literale), (2) unnötige pro-Frame-DOM-Updates im HUD (nur bei
Wertänderung schreiben), (3) Schatten-Setup (shadow.camera-Größe, mapSize
<= 2048, nur eine schattenwerfende Lichtquelle), (4) Draw-Call-Reduktion
(weitere Instancing-/Merge-Kandidaten im LevelLoader), (5) Physik (Anzahl
Collider ok? Rail-Sampling gecacht?), (6) Qualitäts-Toggle wirksam
(pixelRatio, Schatten aus). Liefere konkrete Patches als vollständige
geänderte Dateien, keine Umbauten der Architektur.
Fertig, wenn: 60 FPS stabil im City-Level auf meinem Referenzgerät und
Draw-Calls < 150.
```

- **Verifikation:** Vorher/Nachher-Messung notieren.

---

## M7 — Mobile (Phase 2)

### Task 29 — Capacitor-Integration **[S5]**
- **Ziel:** Android-/iOS-Projekt um den Web-Build.
- **Abhängigkeiten:** M6 stabil. **Dateien:** `capacitor.config.ts`, `package.json`-Scripts.
- **Build-Prompt:**

```text
TASK 29 — Capacitor
Führe mich durch die Capacitor-Integration eines bestehenden
Vite-Projekts: benötigte Pakete (@capacitor/core, @capacitor/cli,
@capacitor/android, @capacitor/ios), npx cap init (appId
de.<DEIN-NAME>.rooftoprunner, appName "Rooftop Runner", webDir "dist"),
capacitor.config.ts mit backgroundColor schwarz, Fullscreen/Immersive
(Android: StatusBar-Plugin oder androidScheme-Hinweise), iOS
contentInset "never". WICHTIG: für den Capacitor-Build muss vite base
'./' (relativ) statt '/rooftop-runner/' sein — richte dafür einen
Vite-Mode "capacitor" (vite build --mode capacitor) ein, der base
umschaltet, plus npm-Scripts build:web / build:app / cap:sync / cap:run.
Erkläre die einmaligen Schritte in Android Studio bis zum Lauf auf einem
per USB verbundenen Gerät.
Fertig, wenn: Das Spiel startet auf einem Android-Gerät im Vollbild
(Steuerung noch Desktop — Touch kommt in Task 30).
```

- **Verifikation:** App läuft auf echtem Gerät; FPS im Stats-Overlay notieren.

### Task 30 — Touch-Steuerung **[OPUS]**
- **Ziel:** Vollwertige Mobile-Steuerung.
- **Abhängigkeiten:** Task 29. **Dateien:** `src/core/Input.ts`, `src/ui/TouchControls.ts`.
- **Build-Prompt:**

```text
TASK 30 — Touch-Steuerung
1) npm i nipplejs. src/ui/TouchControls.ts: aktiviert sich bei
   Touch-Fähigkeit ('ontouchstart' in window) oder ?touch=1.
   - Linke Bildschirmhälfte: nipplejs-Joystick (dynamic mode) -> moveX/
     moveY; Auslenkung > 80 % setzt sprintHeld.
   - Rechte Hälfte: Drag = lookDX/lookDY (Sensitivität einstellbar,
     KEIN Pointer Lock auf Touch); Multi-Touch: Kamera-Drag parallel zum
     Joystick (Touch-IDs sauber trennen).
   - Buttons unten rechts (DOM, groß, halbtransparent): JUMP (setzt
     jumpPressed/jumpHeld) und ROLL. Safe-Area-Insets berücksichtigen.
2) Input.ts: Touch als zweite Quelle, die dieselbe Input-Struktur
   speist; Tastatur/Maus bleiben parallel funktionsfähig. Menüs/HUD:
   Buttons min. 44x44 px, :active-Feedback statt :hover.
Fertig, wenn: Das City-Level ist auf dem Handy komplett spielbar
(Laufen, Sprint, Kamera, Sprung, Wall-Run, Grind, Roll) und die
Desktop-Steuerung ist unverändert.
```

- **Verifikation:** Kompletter Trick-Run auf dem Gerät; parallel Desktop-Regression testen.

### Task 31 — Store-Vorbereitung **[H + Handarbeit]**
- **Ziel:** Einreichbare Builds + Store-Listings.
- **Abhängigkeiten:** Task 30. **Dateien:** Icons/Splash, Store-Texte.
- **Build-Prompt:**

```text
TASK 31 — Store-Assets & Checkliste
1) Erzeuge mir eine Schritt-für-Schritt-Checkliste für (a) Google Play
   (Konto, App-Signing, AAB-Build in Android Studio, Data-Safety-Formular
   für: Supabase-Login optional/E-Mail, keine Werbung, kein Tracking;
   geschlossener Test mit 12 Testern falls neues Privatkonto) und
   (b) App Store (Apple Developer Program, Xcode-Archive, TestFlight,
   Privacy Nutrition Labels analog, Hinweise gegen 4.2-Ablehnung:
   Touch-UI, Offline-Fähigkeit, gebündelte Assets).
2) Schreibe Store-Texte (EN): Titel, Kurzbeschreibung (80 Zeichen),
   Langbeschreibung (~250 Wörter, Feature-Liste), 5 Screenshot-Ideen mit
   Bildunterschriften.
3) Icon-Vorlage: beschreibe ein einfaches, markantes Icon-Konzept
   (Silhouette Runner + Dachkante, Akzentfarbe #ff6a00) und liefere es
   als SVG, das ich auf 512/1024 exportieren kann.
```

- **Verifikation:** Checkliste abarbeiten; Review-Feedback einplanen (1–2 Runden sind normal).

---

# Checkliste „Diese Woche zuerst"

1. ☐ Node.js ≥ 20 + Git installieren, GitHub-Konto prüfen.
2. ☐ **Task 1** ausführen (Projekt-Setup) → lokal Würfel sehen → erster Commit.
3. ☐ GitHub-Repo anlegen, pushen, **Task 2** (Deployment) → Live-URL im Browser öffnen. *Ab jetzt hast du nach jedem Task etwas Vorzeigbares.*
4. ☐ **Tasks 3 + 4** (Architektur + Physik).
5. ☐ **Task 5** (Testlevel) und **Task 6** (Movement) — Ziel der Woche: **selbst durchs Graybox-Level laufen und springen.**
6. ☐ Nebenbei (je 15 Min.): Mixamo-Konto anlegen und Animationsliste aus Task 21 durchklicken (nur sichten, noch nichts exportieren); Spielname brainstormen + DPMA/EUIPO-Kurzsuche; `CREDITS.md` anlegen.
7. ☐ Am Wochenende: 10 Minuten mit dem Movement spielen und Tuning-Wünsche notieren — dieses Feedback fließt ab Task 7 in jeden Prompt.

**Wichtigste Regel für alles Weitere:** Erst wenn sich das Movement in M1/M2 **gut anfühlt**, in Content (M4) investieren. Ein Parkour-Spiel mit mittelmäßigem Movement ist durch keine Stadt der Welt zu retten.

