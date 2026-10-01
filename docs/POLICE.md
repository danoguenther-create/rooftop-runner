# Polizeistreife am Lost Place

Die City-Karte besitzt eine Polizeiwache südwestlich der Fabrik (103 / 89). Eine gemeinsame Streife mit zwei Beamten reagiert auf beide Spieler im Splitscreen.

- Nach 90 durchgehenden Sekunden auf dem Fabrikgelände fährt der Streifenwagen von der Wache zur versteckten westlichen Zaunöffnung. Verlassen des Geländes vor dem Alarm setzt den eigenen Countdown zurück.
- Die Beamten steigen aus und verfolgen die gesuchten Spieler zu Fuß. Bei zwei gesuchten Spielern teilen sie sich auf. Später hinzukommende Spieler auf dem Gelände werden ebenfalls verfolgt.
- Bodenkontakt, Sichtkontakt und weniger als 1,15 m Abstand lösen eine Festnahme aus. Der Spieler wird für drei Sekunden angehalten und anschließend vor der Wache freigelassen. Die aktuelle Trick-Kombo verfällt; bereits gesicherte Punkte bleiben erhalten.
- Wer sechs Sekunden lang mehr als 45 m Abstand zu beiden Beamten hält, entkommt. Auch 25 Sekunden ohne Sichtkontakt beenden die Suche nach diesem Spieler.
- Sobald niemand mehr gesucht wird, laufen beide Beamten zum Auto zurück, steigen ein und fahren zur Wache. Nach 15 Sekunden Pause kann ein neuer Einsatz ausgelöst werden.

Die Simulation pausiert mit dem Spiel. Jeder Spieler sieht seinen eigenen Countdown und Verfolgungsstatus. Die Beamten nutzen eine gecachte Wegsuche mit Kapselprüfungen und echte Kollisionen; sie laufen um Hindernisse und durch die verwinkelte Zaunöffnung. Sie sind Bodenpatrouillen und beherrschen keine Parkourtechniken: Dach- und obere Gebäuderouten können zur Flucht genutzt werden. Der Streifenwagen folgt einer festen Zufahrtsroute und bremst bei Hindernissen. Auch die Beamten berücksichtigen das geparkte Auto in ihrer Wegsuche.

`tests/smoke/smoke-police.mjs` prüft den Timer einschließlich Zurücksetzen, Anfahrt, Aussteigen, zwei gesuchte Spieler, erfolgreiche Flucht von Spieler 1, Festnahme und Freilassung von Spieler 2 sowie Rückfahrt, Einsteigen, die Einsatzpause und einen erneuten Alarm desselben Spielers. `tools/capture-police.mjs` erzeugt Aufnahmen der Wache und der ausgestiegenen Streife unter `artifacts/police/`. Die Wache ergänzt fünf Kollisionskörper und zwei Parkour-Deckflächen; vorhandene Stadt- und Fabrikgeometrie bleibt bestehen.

Validierung am 01.10.2026: Produktionsbuild und alle 26 Smoke-Tests bestanden. Die Grafikprüfung wurde nach Korrektur der Deckflächen-Zählung separat erfolgreich wiederholt, einschließlich Textur-Fallback. Der vollständige Polizeitest besteht auch über die öffentliche Splitscreen-Vorschau. Wache, Streife und die neue Dive-Landepose wurden anhand von Spielaufnahmen visuell geprüft.
