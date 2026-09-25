# Bewegungsfluss und größere Ironworks

Stand: 23.09.2026. Auf Wunsch direkt auf `main` umgesetzt.

Aktualisierung: Die automatische Abrollgrenze beträgt inzwischen 12 m; siehe [Dive Roll](DIVE_ROLL.md) für die neue Doppeltipp-Bewegung und aktuelle Landeregeln. Die folgenden Angaben dokumentieren den ursprünglichen Ausbau.

## Steuerung und Bewegung

- **Mittelhohe Landung:** Bei 2,4 bis einschließlich 6 Metern Fallhöhe rollt die Figur automatisch ab. Die kurze Laufrolle erhält das Tempo; gehaltene Lauftasten wirken weiter. Normale Sprünge lösen keine Rolle aus. Für höhere Stürze bleibt die rechtzeitig ausgelöste Rolle nötig. Unfertige Flips und abgebrochene Dives behalten ihre bisherigen Konsequenzen.
- **Spieler 2 sprintet mit `#`.** Die deutsche #-Taste wird über ihren physischen Tastencode und zusätzlich über das eingegebene Zeichen erkannt. Loslassen und Fokusverlust beenden den Sprint. Rechts-Shift ist nicht mehr belegt; Spieler 1 behält Links-Shift.
- **Schwingen:** Vorwärts (P1 W, P2 Pfeil hoch) baut Schwung auf, rückwärts bremst. Pumpen funktioniert auch nach vollständigen Umdrehungen. Die Winkelgeschwindigkeit ist begrenzt, erlaubt aber Riesenfelgen. Abspringen auf der aufsteigenden Seite übernimmt das Tangentialtempo und gibt zusätzlichen Auftrieb. Dadurch bleibt Zeit für Flips; ungünstiges Absprungtiming wird nicht automatisch korrigiert.

## Gelände und Zugänge

Das umzäunte Gelände wächst von etwa 86 × 88 auf **144 × 125 Meter**. Neben Haupthalle und Werkstatt gibt es eine Turbinenhalle, ein Kesselhaus, zusätzliche Lagercontainer und einen Kran mit Kabine, Gegengewicht, Haken und begehbarem Ausleger. Die neuen Hallen enthalten Maschinen, erhöhte Laufstege, erreichbare Zwischenstufen und Schwingstangen.

Tore und Türen sind sichtbar mit Brettern verriegelt und physisch geschlossen. Die Gebäude werden ausschließlich durch ausgewählte Fenster betreten; frühere Dachöffnungen sind abgedeckt. Die Außentür der Haupthalle und die Werkstatttür sind keine Abkürzungen mehr.

Zwei geprüfte Wege durch den Zaun:

1. Ein verdeckter Spalt zwischen abgestellten Kisten, knapp breit genug für die Spielfigur. Kein Kriechen erforderlich.
2. Vom Boden über niedrige Vorräte, zwei gestapelte Container und das Krandeck auf den schmalen Ausleger oberhalb des Zauns, dann hinunter in den Hof.

Testkoordinaten (Spoiler): Spalt x=126/z≈27,65, lichte Breite 1,1 m und Höhe 2,05 m. Kranroute beginnt x=109/z=-40 und führt über x=112/115/119/124,5 bis x=135. Fenster der Haupthalle x=164/z=10, Werkstatt x=186,5/z=38, Turbinenhalle x=238/z=-6, Kesselhaus x=237/z=50.

## Prüfungen

Abschluss: Produktionsbuild erfolgreich; der vollständige Lauf aller 19 Smoke-Tests ist ohne Fehler abgeschlossen. Alle vier Außentreppen wurden gehend, sprintend und abwärts geprüft.

`smoke-flow-upgrades` prüft die neue Sprintbelegung, automatisches Abrollen und Weiterlaufen beider Spieler, kleine/hohe Landungen, vollständige Stangenumdrehung mit Handkontakt und einen anschließenden hohen, weiten Absprung mit Flip. Der gemessene Testabsprung erreicht etwa 10,8 m/s aufwärts, steigt um 2,85 m und legt in 0,75 Sekunden 4,7 m horizontal zurück.

`smoke-factory-routes` spielt die Container-/Kranstrecke ohne Versetzen zwischen den Hindernissen durch, prüft alle vier Fensterzugänge und die blockierten Türen. `smoke-factory` prüft zusätzlich den schmalen Zaunspalt sowie die bestehenden Stadt-Fensterbänke und die Marina-Rail. Beide neuen Tests sind in die Smoke-Suite aufgenommen (19 Tests insgesamt).

Die gerenderten Nahaufnahmen für Rolle/Riesenfelge sowie Ansichten von Gelände/Kran liegen nach Ausführen der Capture-Skripte unter `artifacts/`. Das VPS-Software-Rendering ist kein FPS-Benchmark für den Spielrechner.
