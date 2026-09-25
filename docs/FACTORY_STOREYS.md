# Ironworks: schwierigere Zugänge und vier Geschosse

Die Haupthalle besitzt Erdgeschoss plus drei Obergeschosse auf 0, 7, 14 und 21 m. Das Dach liegt bei 28 m; die 35 cm starken Zwischendecken lassen etwa 6,65 m lichte Höhe. Drei Meter breite, gegenläufige Treppen mit Zwischenpodesten verbinden alle Ebenen. Die Decken sparen das Treppenhaus aus; obere Maschinen, Kompressoren, Schwingstangen und breite Laufwege verteilen die Parkour-Spots über das Gebäude. Das bestehende Eingangsfenster liegt höher (Fensterbank 3,4 m) und wird über versetzte Frachtstücke erreicht.

Die Werkstatt ist ausschließlich durch den offenen Dachzugang erreichbar und verlassbar. Außen führen fünf versetzte Frachtstapel aufs etwa 7 m hohe Dach. Unter der Dachöffnung führt eine begehbare Treppe ins Gebäude und wieder hinaus. Frühere Fenster und Türen sind physisch geschlossen.

Das Kesselhaus wird ausschließlich durch ein Fenster im ersten Obergeschoss betreten und verlassen: Fensterbank 7,6 m, Geschossboden 6,5 m. Die äußere Route führt über vier Frachtstapel. Innen verbindet eine Treppe das Obergeschoss mit dem Erdgeschoss; es gibt keinen ebenerdigen Durchgang. Die Turbinenhalle behält ihren bestehenden Fensterzugang.

Der kleine Zaunspalt liegt jetzt hinter einem versetzten Blech-Sichtschutz. Der begehbare Weg erfordert zwei Richtungswechsel. Die alternative Container-/Kranroute bleibt erhalten.

## Ausstattung

Zusätzliche Fassadenfenster mit Rahmen und Fensterbänken, Dachaufbauten, Attiken, Fallrohre und Halter, Mauerwerksverfärbungen, Rohrflansche, Elektroschränke, Paletten, lose Ziegel und gerippte Frachtstapel. Neue Kompressoren besitzen zylindrische Druckbehälter, Ventilräder, Anzeigen, Motorverkleidungen und Kollision. Die vorhandenen Materialbatches werden weiter genutzt; die dokumentierte Übersichtsaufnahme benötigt 76 Draw Calls. Das ist keine allgemeine FPS-Garantie.

## Prüfung

`smoke-factory-storeys` spielt ohne Versetzen zwischen den Wegpunkten den versteckten Zauneingang, sämtliche Haupttreppen hinauf und hinunter, den Werkstattweg vom Hof durchs Dach und zurück sowie die Kesselhausroute durch das Obergeschossfenster und über die Innentreppe durch. Die früheren ebenerdigen Eingänge werden auf Blockierung geprüft.

`smoke-factory` und `smoke-factory-routes` prüfen die übrigen Fabrikzugänge und die durchgehende Kranroute. `smoke-geometry` prüft Kollisionsgeometrie und `smoke-modes` die Spielmodi. `tools/capture-factory.mjs` erzeugt Ansichten der Fassaden, Innenräume, Treppen und neuen Zugänge unter `artifacts/factory/`.

Abschlussprüfung: Produktionsbuild und alle fünf oben genannten Smoke-Tests bestanden. Fassaden, obere Halle und Treppenhaus anhand erzeugter Aufnahmen geprüft; keine Browserfehler beim Aufnahme-Durchlauf.
