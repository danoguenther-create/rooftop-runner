# Dive Roll per Doppeltipp

Spieler 1 tippt **W zweimal**, Spieler 2 **Pfeil hoch zweimal**, innerhalb von 300 ms. Gedrückthalten und Tastatur-Autorepeat zählen nicht als zweiter Tipp. Nach dem Absprung darf die Taste losgelassen werden. Eine laufende Rolle kann nicht durch einen weiteren Doppeltipp abgebrochen werden.

## Flache Flugbahn und Hindernisse

Auf freier Strecke erreicht die Kapsel-Fußhöhe etwa **1,07 m statt 3,8 m**. Der Flug dauert etwa **0,5 s**, die Strecke ohne Sprint-Anlauf etwa **2,3 m**. Die Figur streckt die Arme vor. Ihre Beckenneigung folgt dem Winkel aus vertikaler und horizontaler Fluggeschwindigkeit: beim Absprung schräg aufwärts, am Scheitel horizontal und beim Sinkflug mit Kopf und Händen zum Boden. Die Beine bleiben beim Übergang zur Schulterrolle angezogen.

Nur bei niedrigen Hindernissen im Flugkorridor wird der Absprung angehoben. Die vorhandenen Deckflächen werden einschließlich ihrer Drehung und der Kapselbreite geprüft. Die Höhe ist begrenzt: Eine 2 m hohe, 0,8 m tiefe Testkiste wird mit etwa **2,38 m Fußhöhe und 0,75 s Flugzeit** überquert. Wände erhöhen den Sprung nicht. Sehr breite oder unmittelbar vor der Figur stehende Hindernisse sind damit nicht automatisch überwindbar; die Kollision bleibt maßgeblich.

Sprintmomentum bleibt beim Absprung erhalten und wird während des Fluges gleichmäßig zur kompakten Dive-Geschwindigkeit abgebaut. Loslassen oder Kameradrehen ändern die Flugrichtung nicht abrupt. Bei der Landung gibt es keinen zusätzlichen Geschwindigkeitsboost; die Laufsteuerung übernimmt während der ersten 0,4 s sanft.

## Durchgehende Bewegung

Die Flugneigung wird im Skelett um das Becken erzeugt. Die gesamte Modellwurzel wird beim Aufsetzen nicht mehr schlagartig aufgerichtet. Die zuletzt sichtbaren Knochenpositionen und -rotationen gehen über 0,14 s in die Schulterrolle über; dieselbe Übergangskorrektur verbindet die Rolle mit dem Weiterlaufen. Procedurale Korrekturen werden vor jedem neuen Animationssample zurückgesetzt.

Die Sprint-Rolle läuft mit 1,75-fachem Cliptempo. Während der Rolle erzwingt die normale Boden-IK keinen Fußkontakt – das hatte die angezogenen Beine gegen die Rollanimation verzogen. Automatische Griffe, Wallruns und Vaults übernehmen weiterhin nicht mitten im Hechtsprung.

Die bisherige C-Dive-Steuerung und das automatische Abrollen aus 2,4 bis 12 m Fallhöhe bleiben erhalten. Unvollendete Luft-Flips werden nicht automatisch gerettet.

## Prüfung

`smoke-dive-jump` prüft beide Spieler, freie Strecke, die 2-m-Kiste, Einzel-/Doppeltipp, Autorepeat, Loslassen, vollständige Körperrotation, nach unten gerichtete Hände und Kopf vor dem Aufsetzen, kontinuierliche Hüft-/Handpose beim Aufsetzen, Sprintmomentum und Simulation bei 30/60/120 Hz. Die bisherigen Fallhöhen 6/9/11,9/13 m werden ebenfalls geprüft.

`tools/capture-dive.mjs` erzeugt Bilder von Absprung, Flug, Sinkflug, Rolle und Weiterlaufen, jeweils auf freier Strecke und über der Kiste. Ausgabe: `artifacts/dive/flat-*.jpg` und `crate-*.jpg`.

Weitere Regressionen: `smoke-15c`, `smoke-contacts`, `smoke-motion-flow`, `smoke-visual-character` und `smoke-split`. Der Stand bleibt auf `feat/factory-visual-character-preview`; kein Merge nach `main`.

Validierung am 01.10.2026: Produktionsbuild und alle 26 Smoke-Tests bestanden (Grafikprüfung nach Korrektur der Wachen-Deckflächen-Zählung separat wiederholt). Die Dive-Prüfung bestätigt für beide Spieler die nach unten gerichteten Hände und den Kopf vor der Landung sowie eine kontinuierliche Hüftorientierung beim Aufsetzen. Aufnahmen von Flug, Sinkflug und Schulterrolle wurden visuell geprüft. Das beschreibt die geprüfte Bewegungssequenz, keine allgemeine FPS-Zusage für die gesamte Karte.
