# Palm Quay — Review der Stadt- und Bewegungsüberarbeitung

Entwicklungsbranch: `feat/coastal-city-motion`. Der Produktionsbranch `main` und sein GitHub-Pages-Deployment bleiben unverändert.

## Spielbare Änderungen

- Küstenviertel mit vier Fassadenvarianten, räumlichen Fensterrahmen, Ladenfronten, Balkonen, Dachgesimsen, Regenrohren, Solarpaneelen und Lüftungsgittern.
- Fahrzeuge mit gerundeter Karosserie, Scheiben, Rädern, Felgen, Spiegeln und Leuchten; Palmen und Laubbäume; gebogene Straßenlaternen.
- Physikalisch basierte Materialien, Oberflächenkörnung, Himmel, Sonnenlicht, Reflexionen und mitlaufender Schattenbereich.
- Zusätzlicher Uferpark südlich der ursprünglichen Stadt: Präzisionslinie, vier Schwungstangen, drei begehbare Pavillons und Balance-Rails. Insgesamt 68 Rails; die ursprünglichen 33 Sammelobjekte bleiben erhalten.
- Speed Vault für schmale Hindernisse, Kong Vault für tiefe Hindernisse. Die Hindernistiefe bestimmt Flugstrecke und Dauer; der Endpunkt liegt hinter der Rückkante.
- Kantenabhängige Handkontakte, Hochziehen mit Zug-/Stütz-/Aufstehphase, Stangengriffe und Fußausrichtung beim Balancieren und auf Bodenflächen. Die Kontaktkorrektur ist auf die realen Knochenlängen begrenzt.
- Laufanimationen folgen dem Bewegungstempo; Sprungclips werden am Scheitel nicht mehr sofort abgebrochen. Charakterproportionen und Materialdarstellung wurden verfeinert.

## Für das Review

[Spielbare Vorschau: Palm Quay](https://replace-temporary-idle-smaller.trycloudflare.com/rooftop-runner/?level=city01&play=1). Der temporäre Cloudflare-Link bleibt erreichbar, solange die tmux-Session `rooftop-preview` auf dem VPS läuft.

`?level=city01&play=1` startet direkt in Palm Quay. `?level=testlevel&play=1` öffnet das Trainingsgelände. Im Pausemenü lassen sich die vorhandenen Spielmodi auswählen. F3 blendet die technischen Messwerte ein, F4 den Physikkörper.

Die Uferpromenade liegt südlich des Stadtparks. Die vier bestehenden Außentreppen führen zurück zu den Dachrouten. Neue Balkon- und Vordachflächen sind physisch registriert; die Treppenseiten bleiben frei.

## Reproduktion und Prüfungen

- `node tools/gen-city01.mjs`: reproduziert den Stadtplan.
- `npm run build`: TypeScript und Produktionsbuild.
- `npm run test:smoke`: komplette Suite, einschließlich `smoke-contacts`.
- `node tests/smoke/smoke-contacts.mjs <URL>`: echtes Charaktermodell, Hände an Kanten aus vier Richtungen, Hochziehen, Stangenschwingen, komplette Speed-/Kong-Überquerung mit Landung.
- `node tools/export-character.mjs`: bei laufendem Vite auf Port 5173 das gemeinsame GLB aus den vorhandenen FBX-Quelldateien neu erzeugen.

## Bewegungsreferenzen

Die Umsetzung orientiert sich an den beschriebenen Bewegungsphasen; sie übernimmt keine fremden Modelle, Texturen oder Spielassets.

- [American Parkour: Speed Vault](https://americanparkour.com/resources/speed-vault-tutorial/) — Anlaufmomentum und Handstütz bei der seitlichen Überquerung.
- [Swiss Parkour Association: Coaching Library](https://www.spka.ch/en/js/parkour-coaching-library/) — Speed Vault und Kong/Cat Pass mit Beinen zwischen den Armen.
- [Apex Movement: Climb-up](https://apexmovement.com/climb-up-intro) — Übergang vom Cat Hang zum Stütz und auf die Mauer.

Die Stadt ist eine eigene Küstenarchitektur mit Art-déco-Anleihen. Die vorhandenen Mixamo-Quelldateien bleiben im Repository; für die Laufzeit wird ein daraus erzeugtes GLB verwendet.

## Verifizierter Stand vom 22.09.2026

- Produktionsbuild erfolgreich; Vite weist weiterhin auf das große JavaScript-Bundle hin.
- Öffentliche Vorschau im Chromium geladen, 15 Animationsclips vorhanden, Bewegung per Tastatureingabe geprüft, keine Konsolenfehler.
- Stadtansicht am Spawn: 61 Draw Calls ohne Charakter, 64 mit Charakter. Gegenüber dem ersten Detail-Build (91/94) reduziert; keine Aussage über die Bildrate auf dem Spielrechner. Der VPS rendert per Software.
- Das Charakter-GLB enthält Modell, Texturen und alle 15 verwendeten Clips in rund 6 MB. Originale FBX-Dateien bleiben als Quellen und Fallback erhalten.
- Regressionen für Kantenkontakte, Hochziehen, Stangenschwingen und vollständige Speed-/Kong-Vaults bestanden; alle vier Außentreppen aufwärts, sprintend und abwärts geprüft.
- Im ersten Gesamtlauf fielen HUD-Timing, das Zeichenbudget und ein Start-Timeout auf. Alle drei sind nach Korrektur separat erfolgreich nachgeprüft. Beim Modus-Test wurde die Playwright-Timeout-Option bisher als Funktionsargument statt als Option übergeben; Singleplayer, Zeitrennen, Splitscreen und Game of PARK bestehen nun. Damit liegen für alle 14 Smoke-Tests erfolgreiche Ergebnisse vor (Gesamtlauf plus gezielte Nachprüfungen).

Die Darstellung ist stilisiert mit detaillierterer Küstenarchitektur und PBR-Materialien. Sie erreicht keine fotorealistische AAA-Grafik. Die Bewegungen nutzen die vorhandenen Clips mit prozeduralen Kontaktkorrekturen, keine komplett neu aufgenommenen Animationen.
