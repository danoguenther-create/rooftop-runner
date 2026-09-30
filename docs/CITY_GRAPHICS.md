# Grafikstil für die gesamte Karte

Die Erweiterung liegt auf `feat/factory-visual-character-preview`. `main` und das Produktionsdeployment bleiben unverändert. Einstieg in die Stadt: `/rooftop-runner/?level=city01&mode=split&play=1`. Der bisherige Look bleibt über `&look=original` vergleichbar.

## Umfang

- Alle 32 Stadtgebäude sowie Dachaufbauten und Skyline: strukturierter Putz, dezente Verschmutzung am Sockel, getrennte Dachoberfläche. Fenster behalten glatte, weniger raue Reflexionen.
- Straßen, Hof und Außenflächen: Asphalt und Beton mit maßstäblicher Oberflächenstruktur statt derselben generischen Textur.
- Restliche Fabrikgebäude, Ausstattung und Kanäle: Backstein, Metall, Holz und feuchter Beton. Die ausgearbeitete Haupthalle und ihre Beleuchtung bleiben erhalten.
- Bestehende Fassadendetails, Bäume, Strand und Wasser verwenden ebenfalls passende Oberflächen. Schaufensterglas und Autolack bleiben glatt.
- 30 vorhandene Dachlüfter werden durch ein in Blender modelliertes Modell mit Gehäusekanten, Lüftungslamellen, Ventilatoren und Befestigungen ersetzt. Drei instanzierte Materialgruppen reichen für alle 30 Lüfter.

Die Gebäudefarben und die Küstenarchitektur bleiben erkennbar. Die Erweiterung ersetzt keine Spielgeometrie und fügt keine zusätzlichen Echtzeitlichter pro Gebäude hinzu. Es handelt sich um gebackene Materialkarten und Echtzeitbeleuchtung, nicht um gebackene globale Beleuchtung.

## Assets und Umsetzung

`tools/blender/build_city_finish.py` erzeugt vier Materialsets (Putz, Asphalt, Holz und Metall; jeweils Farbe, Normale und Rauheit in 512² Pixeln) sowie `public/models/city/roof-vent.glb`. Zusätzliche Runtime-Assets: 3.811.783 Byte (etwa 3,8 MB). Die zugehörige `.blend` liegt daneben und wird nicht zur Laufzeit geladen. Die Backstein- und Betontexturen der Fabrik werden für die Stadt wiederverwendet, auch als dieselben Texture-Objekte auf der GPU.

Reproduzieren: `blender -b --python tools/blender/build_city_finish.py`; nur das Modell: zusätzlich `-- --kit-only`.

`CityPBR.ts` projiziert Texturen in Weltkoordinaten, auch auf gedrehte Instanzen und zusammengefasste Dekoration. `CityLook.ts` wählt Materialgruppen, ohne die originalen Styles für Kollisionsregeln umzuschreiben. Alle neuen Texturen werden geladen, bevor sie verwendet werden; bei Ladefehlern bleibt die bisherige Darstellung spielbar. Für ein nicht verfügbares Lüftermodell bleiben die vorhandenen Boxmodelle sichtbar.

## Vergleich und Prüfung

`node tools/capture-city-look.mjs` erzeugt Aufnahmen von Straße, Dach, Werkstatt, Kanal und Küste sowie einen Splitscreen-Vergleich unter `artifacts/city-look/`. Die Prüfung vergleicht die vollständigen sortierten Koordinaten aller 5.977 Deckflächen und aller 275 Rails: identisch im bisherigen und neuen Look.

Am Stadt-Startpunkt bei 1200 × 760: Splitscreen 128 → 158 Zeichenaufrufe und 1.525.496 → 1.949.288 gerenderte Dreiecke einschließlich Schatten. Der Stadt-Physiktest misst ohne Charakter 81 Zeichenaufrufe; seine Obergrenze wird für die zusätzlichen Materialgruppen von 80 auf 100 angepasst (ursprüngliches Projektbudget: 150). Dieser Vergleich enthält auch die bereits vorhandene Fabrik- und Charakter-Grafikprobe gegenüber `look=original`. Der gemessene Aufwand hängt vom Bildausschnitt ab; Softwaregrafik auf dem VPS liefert keine repräsentative Geräte-FPS.

`smoke-city-look` prüft zwei Spieler, geladene Normalen-/Rauheitskarten, die Grafikqualität-Umschaltung und einen absichtlich simulierten Textur-Ladefehler. Weitere gezielte Tests: `smoke-city`, `smoke-factory-storeys`, `smoke-factory-sewers`, `smoke-shadow-stability`, `smoke-split` und `smoke-dive-jump`.

Validierung: Produktionsbuild, alle sieben genannten Smoke-Tests und der Vergleich der vollständigen Deckflächen-/Rail-Geometrie bestanden. Straßen-, Dach- und Kanalaufnahmen wurden visuell geprüft. Der öffentliche Splitscreen-Test besteht einschließlich Qualitätsumschaltung und simuliertem Textur-Ladefehler; keine Browserfehler im normalen Betrieb.
