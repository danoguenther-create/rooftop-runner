# Polizei am Lost Place

Die City-Karte besitzt eine Wache südwestlich der Fabrik (103 / 89). Sobald **ein** Spieler 90 durchgehende Sekunden im Lost Place verbringt, werden **beide Spieler** gesucht, auch wenn der andere außerhalb des Geländes steht. Vor dem Alarm setzt das Verlassen des Geländes den eigenen Countdown zurück.

## Einsatz und Verstärkung

Der erste Streifenwagen fährt zur westlichen Zaunöffnung; zwei Beamte steigen nacheinander aus. Solange mindestens ein Spieler gesucht wird, startet alle **120 Sekunden ab Alarm** ein weiterer Wagen mit zwei Beamten. Fahrzeuge nutzen getrennte Halteplätze und kehren nach Ende der Suche jeweils zu ihrem eigenen Stellplatz an der Wache zurück. Noch anfahrende Wagen brechen den Einsatz ab und fahren ebenfalls zurück. Die Rückfahrt beginnt erst, wenn sämtliche Beamte eingestiegen sind; so versperren fahrende Autos den anderen Beamten nicht den Weg zur Tür.

Für einen begrenzten Speicher- und Renderaufwand im Browser sind maximal **sechs Wagen / zwölf Beamte** gleichzeitig vorgesehen. Die vorhandenen Streifen werden bei späteren Einsätzen wiederverwendet. Die Splitscreen-Anzeige zeigt je gesuchtem Spieler die gemeinsame Verfolgungsdauer als `m:ss`, die Polizeistärke einschließlich anfahrender Verstärkung und den nächsten Verstärkungstermin. Alle Timer pausieren mit dem Spiel.

Bodenkontakt, Sichtkontakt und weniger als 1,15 m Abstand lösen eine Festnahme aus. Nach drei Sekunden wird der Spieler vor der Wache freigelassen; die laufende Trick-Kombo verfällt, gesicherte Punkte bleiben erhalten. Der Einsatz bleibt aktiv, bis beide Spieler festgenommen wurden. Nach dem ersten Fang verfolgen sämtliche Beamte den verbleibenden Spieler; Verstärkungen kommen weiterhin. Abstand oder verlorener Sichtkontakt beenden die Suche nicht. Der bereits freigelassene Spieler wird während desselben Einsatzes nicht erneut gesucht. Nach Rückkehr sämtlicher Fahrzeuge gibt es 15 Sekunden Einsatzpause.

## Bewegung und Engstellen

Die erste Einheit sprintet mit dem Spielertempo von 9 m/s. Die zweite und alle folgenden Einheiten erreichen 10,8 m/s, also 20 % mehr. Die Werte sind an das Spieler-Sprinttempo gekoppelt. Laufanimation und Schritttempo passen sich an; alle Einheiten können springen und klettern.

Die Wegsuche bildet begehbare Flächen auf mehreren Höhen aus der tatsächlichen Kollisionsgeometrie ab. Sie nutzt Treppen, bis zu 2,5 m hohe erreichbare Kanten, kurze Sprünge zwischen benachbarten Plattformen und kontrollierte Absätze bis 3,5 m. Jede Verbindung wird mit einer Kapsel auf freien Raum geprüft, einschließlich Aufstieg und Flugkurve. Auch während der Bewegung werden Kollisionen geprüft. Beamte klettern damit über Hindernisse und verfolgen Spieler auf erreichbare höhere Flächen; sie können nicht beliebig hohe, glatte Wände hochlaufen.

Eine feste Vorfahrtsregel und seitliches Ausweichen verhindern gegenseitiges Blockieren. Ist ein Gang zu schmal zum Ausweichen, zieht sich der nachrangige Beamte bis zu einer freien Stelle zurück. Die gesamten Sprung- und Kletterwege werden vor dem Start reserviert; wartende Beamte lassen die Bewegung erst abschließen. Positionsreservierungen halten Abstand zwischen den Beamten; ihre Physikkapseln werden nicht gegeneinander verklemmt. Bei ausbleibendem Fortschritt werden blockierte Ausweichziele verworfen und der Weg anhand der aktuellen Fahrzeugpositionen neu gesucht. Lange Teilrouten werden nach tatsächlichem Fortschritt fortgesetzt.

## Darstellung

Der Streifenwagen besitzt eine geneigte Fahrgastzelle, abgerundete Karosserie, Lackmaterial, Säulen, Spiegel, Türgriffe, bewegliche Türen und Räder, Felgen, Kühlergrill, Scheinwerfer, Rückleuchten, Kennzeichen, Antenne und Blaulicht. Die Beamten haben geformte Körperteile, Gesicht, Ohren, Hände, Mütze, Stoffstruktur, Schutzweste, Funkgerät, Taschen, Gürtel und Stiefel. Ellbogen und Knie bewegen sich zusätzlich zu den Schulter- und Hüftgelenken; Sprung und Klettern erhalten eigene Posen. Starre Modelldetails werden je Material zusammengefasst, bewegliche Teile bleiben getrennt. Geometrie und Materialien sind auf den bestehenden Browser-Look abgestimmt.

## Prüfung

- `smoke-police`: Alarm, Zurücksetzen, beide Spieler, Anfahrt, Festnahme beider Spieler, fortgesetzte Suche nach dem ersten Fang, Rückfahrt und erneuter Einsatz.
- `smoke-police-ai`: zwei entgegenkommende Beamte in einem schmalen Gang, Mindestabstand, gemessene Sprintgeschwindigkeiten, Einholen eines sprintenden Ziels durch die Verstärkung, tatsächliches Erklettern einer Kiste Sprung mit Landung auf einer getrennten erhöhten Plattform, Gegenverkehr an Kletterkanten und den Aufstieg durch das echte Fabriktreppenhaus bis auf 21 m.
- `smoke-police-reinforcements`: Alarm für einen Spieler außerhalb des Geländes, Zeit-/Stärkeanzeige, Pause, Zwei-Minuten-Verstärkung, zwölf Beamte und Rückkehr aller Fahrzeuge. Für die reine Timerprüfung werden sichtbare, nicht festnehmbare Testziele fixiert; Verfolgung und Traversierung werden in den anderen Tests real simuliert.
- `tools/capture-police.mjs`: Spielaufnahmen der Wache, Streife und Modelldetails unter `artifacts/police/`.

Die Wache hat fünf Kollisionskörper und zwei Parkour-Deckflächen. Bestehende Levelgeometrie wird nicht verändert. Der Stand bleibt auf `feat/factory-visual-character-preview`.

Validierung am 01.10.2026: Produktionsbuild und neun gezielte Smoke-Tests bestanden (`smoke-police`, `smoke-police-ai`, `smoke-police-reinforcements`, `smoke-city`, `smoke-split`, `smoke-shadow-stability`, `smoke-city-look`, `smoke-contacts`, `smoke-modes`). Die beiden Bewegungs-/Einsatztests wurden nach der abschließenden Korrektur der Kollisionsgruppen erneut erfolgreich ausgeführt. Der Belastungstest umfasst zwölf Minuten simulierte Verfolgung, sechs Wagen, zwölf Beamte und die Rückkehr aller Fahrzeuge. Die neuen Modelle wurden anhand von Spielaufnahmen visuell geprüft.

Ergänzende Validierung am 01.10.2026: Nach der Änderung auf Sprinttempo und Festnahme beider Spieler bestehen der Produktionsbuild sowie alle drei Polizeitests erneut. Gemessene freie Laufgeschwindigkeit: 8,97 bzw. 10,76 m/s einschließlich Startphase; die Verstärkung schließt einen anfänglichen Abstand von 6 m zu einem mit 9 m/s laufenden Ziel innerhalb von 2,8 s auf Festnahmedistanz. Der vollständige Verstärkungstest bestätigt fortgesetzte Suche nach dem ersten Fang und Rückkehr aller sechs Wagen nach dem zweiten. `smoke-police` besteht auch über die aktualisierte öffentliche Testvorschau.
