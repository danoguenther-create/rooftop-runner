# Grafikprobe: Haupthalle und Charakter

Branch: `feat/factory-visual-character-preview`. Die Produktionsversion auf `main` bleibt unverändert.

Direkteinstieg in die Haupthalle:

- Splitscreen: `/rooftop-runner/?level=city01&showcase=mill&mode=split&play=1`
- Einzelspieler: `/rooftop-runner/?level=city01&showcase=mill&play=1`
- Vergleich mit bisherigen Materialien/Animationen: zusätzlich `&look=original`.

P1: W/S, A/D, Space, Links-Shift. P2: Pfeiltasten, Enter, #. Das übrige Level und alle Parkour-Techniken bleiben im Teststand verfügbar.

## Gebäudemuster

Nur die Haupthalle erhält die neuen Backstein-, Beton-, Metall- und Glasmaterialien. Blender 4.5 erzeugt zwei Sätze aus Farb-, Normalen- und Rauheitskarten mit je 512² Pixeln sowie eine Maschine mit abgerundeten Gusskanten, Kühlrippen, Schrauben, Ventilrad und Instrumenten. Die Maschine wird 14-mal instanziert und auf die unveränderten bisherigen Kollisionsmaße eingepasst. Die Blender-Quelldatei liegt neben dem GLB; sie wird nicht vom Spiel heruntergeladen.

Materialkarten sind gebacken; die Gebäudebeleuchtung ist weiterhin Echtzeitbeleuchtung, keine vollständig gebackene globale Beleuchtung. Vier lokale Strahler ohne eigene Schattenkarten, emissive Leuchten und eine kostengünstige räumliche Kontaktabschattung geben dem Innenraum mehr Tiefe. Niedrige Grafikqualität schaltet die zusätzlichen Strahler ab. Die übrigen Gebäude behalten ihren bisherigen Look.

Neue Runtime-Assets: insgesamt etwa 1,05 MB (GLB plus sechs PNG-Dateien, ohne `.blend`). Die Wiederverwendung der Modelle vermeidet einzelne Zeichenaufrufe pro Schraube oder Maschinenteil.

## Charakter

Stoff-Normalen und getrennte Rauheit für Kleidung und Haut. Eine Maske aus den Skelettgewichten verhindert Stoffstruktur auf Gesicht, Händen und Schuhen. Spieler 2 erhält seine blaue Unterscheidungsfarbe nur auf der Kleidung; Haut und Augen behalten natürliche Farben. Beide Figuren verwenden getrennte Materialien und Animation-Mixer.

Beim Lauf-/Sprintwechsel bleibt die normalisierte Schrittphase erhalten. Sprung-/Fallübergänge werden etwas weicher überblendet. Die Wirbelsäule reagiert dezent auf Laufgeschwindigkeit und Kurven. Kleine Landungen werden über etwa 0,24 s mit gebeugten Knien abgefedert, während die Füße ihre animierten Kontaktpunkte halten. Bestehende Rollen, Flip-Tucks, Wallrun-, Hang- und Vault-Kontakte haben Vorrang.

## Vergleich und Prüfung

`tools/capture-visual-trial.mjs` nimmt den bisherigen und den neuen Look mit gleichen Kameras im Einzelspieler und Splitscreen auf. Bilder und Messwerte liegen unter `artifacts/visual-trial/`.

Bei 1280 × 800 Pixeln am Direkteinstieg: Einzelspieler 58 → 76 Zeichenaufrufe, Splitscreen insgesamt 156 → 192. Dreiecke im Splitscreen 1,733 → 1,891 Millionen (inklusive Renderdurchläufen). Unverändert: 5.977 Deckflächen und 275 Rails. Das beschreibt den gemessenen Bildausschnitt und ist keine FPS-Zusage; der VPS verwendet Softwaregrafik. Die Bildrate muss auf den Zielgeräten beurteilt werden.

`smoke-visual-character` prüft beide Stoffmasken, getrennte Materialien, Schrittphasen und Lande-Kompression mit erhaltenem Fußkontakt. Dazu werden `smoke-motion-flow`, `smoke-contacts`, `smoke-dive-jump`, `smoke-split` und `smoke-factory-storeys` ausgeführt.

Assets reproduzieren: `blender -b --python tools/blender/build_factory_preview.py`. Nur das Maschinenmodell neu erzeugen: zusätzlich `-- --kit-only`.

Validierung am 30.09.2026: Produktionsbuild und alle sechs oben genannten Smoke-Tests bestanden. Die öffentliche Vorschau wurde zusätzlich im Browser geprüft: zwei Spieler, Blender-Maschinen und Stoffmaterialien für beide Figuren geladen, keine Browserfehler.

Nachbesserung: Sonnen-Schatten werden im Lichtkoordinatensystem an ganze Schatten-Texel gebunden und pro Bild nur einmal für beide Ansichten berechnet. Der Hallenboden liegt optisch 2 cm über dem zuvor deckungsgleichen Hofuntergrund; Kollisionen bleiben unverändert. `smoke-shadow-stability` prüft Subpixel-Bewegung, Rasterstabilität, gemeinsame Schattenkarte und die getrennten Bodenflächen. Die Dive-Roll benötigt jetzt etwa 0,82 s für 3,5 m Flugweite, mit schnellerem Abrollen und ohne automatische Griff-/Vault-Unterbrechung.

Validierung der Nachbesserung: Build und sieben gezielte Smoke-Tests bestanden (`smoke-shadow-stability`, `smoke-dive-jump`, `smoke-15c`, `smoke-contacts`, `smoke-motion-flow`, `smoke-split`, `smoke-visual-character`). Die Schattenprüfung besteht auch über den öffentlichen Splitscreen-Testlink.
