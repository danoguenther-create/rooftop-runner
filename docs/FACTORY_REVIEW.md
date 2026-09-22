# Fabrik und Bewegungskorrekturen

Stand: 22.09.2026, Branch `feat/factory-parkour-polish`.

## Änderungen

- Balancieren: Füße setzen abwechselnd auf der tatsächlichen Rail auf; angehobener Fuß und gebeugte Knie ersetzen die starren Fußpositionen.
- Fensterbänke: tiefere, physische Auflageflächen und registrierte Griffkanten. Überdeckte Kanten und versperrte Standflächen werden beim Greifen/Hochziehen abgewiesen.
- Marina Studio: vorderes Geländer mit Kollision, Stützen und Balance-Kurve.
- Vault: kurzer, einhändiger Speed Vault statt Kong. Dauer richtet sich nach Hindernistiefe und Anlauftempo (0,32–0,72 Sekunden); seitliche Beinführung und zeitlich begrenzter Handkontakt.
- Kollisionen: Gebäudedetails, Straßenmöbel, Balkone, Stangen, Autos und Baumstämme bekommen zur sichtbaren Geometrie passende physische Formen. Dach-/Treppenwege bleiben frei von vorspringenden Sonnenschutzelementen. Blattwerk und flache Bodenflecken bleiben Dekoration.
- Kleidung: gewichtete Hosen-Geometrie wird beim Laden erweitert, mit schmaleren Bündchen. Beide Spieler verwenden die Baggy-Hose; ihre Skelette bleiben unabhängig.
- Schnelle Griffe: korrigierte Koordinatentransformation an gedrehten Boxen, Prüfung der realen Kollisionskante und des freien Ausstiegs. Die bestehenden Tests prüfen auch schnelle schräge Anläufe und Handkontakt ab dem ersten Hänge-Frame.
- Wallrun: laufende Beinbewegung mit wechselnden Fußkontakten zur Wand und Abstand des Oberkörpers. Ausstieg und Landung bleiben durch Regressionstests abgesichert.
- Neuer Fabrikbezirk: umzäuntes Gelände, verschlossenes Tor, beschädigter Zaun, begehbare Haupthalle und Werkstatt, offenes Fenster/Tür, Maschinen, Rohrleitungen, Laufstege, Balance- und Schwingstangen sowie teilweise eingestürztes Dach.

Alle Änderungen verwenden die gemeinsame Level- und Spielerlogik und gelten dadurch auch im Splitscreen.

## Fabrik finden und erkunden

Die Fabrik liegt östlich der Stadt, hinter dem Turm, unter dem Namen **QUAY IRONWORKS**. Das Haupttor ist geschlossen. Am Zaun entlang suchen; der Zugang liegt hinter abgestellten Kisten. Im Inneren führen unterschiedliche Wege über Maschinen, Stangen und Zwischenebenen nach oben. Eine Werkstatt erweitert den Hof.

Koordinaten für gezielte Tests (Spoiler): Gelände x=126–212/z=-44–44; Zaunloch x=126/z≈27,6; offenes Hallenfenster x=164/z=10; offene Tür x=192/z=-21. Das Fenster ist mit Anlauf/Sprung von der Kiste davor erreichbar. Die Werkstatt hat einen offenen Eingang an ihrer Westseite.

## Validierung

Produktionsbuild mit TypeScript und Vite erfolgreich. Für alle 17 Smoke-Tests liegen erfolgreiche Ergebnisse vor (Gesamtlauf plus gezielte Nachprüfungen der Korrekturen). Alle vier Außentreppen wurden gehend, sprintend und abwärts geprüft; die Stadtprüfung bestätigt auch Dachlückensprung, Rail, Stange, Kletterhäuschen, Feuerleiter, Brücke und Auto-Vault. Smoke-Suite um `smoke-factory` und `smoke-geometry` erweitert (17 Tests insgesamt). Neue Prüfungen umfassen Tor/Zaunloch/Tür/Fenster, Hochziehen auf einer echten Stadtfensterbank, abwechselnde Schritte auf der Marina-Rail, gedrehte Griffkanten, blockierte Ausstiege, Phantomkanten sowie Baggy-Geometrie und unabhängige Skelette beider Spieler. `smoke-motion-flow` prüft zusätzlich den Abstand von Füßen und Oberkörper zur Wand.

Die Browserprüfung läuft auf dem VPS mit Software-Rendering; sie liefert keine belastbare Aussage zur Bildrate auf eurem Spielrechner. Die neuen Bewegungen kombinieren vorhandene Clips mit prozeduralen Kontaktposen. Visuelle Aufnahmen lassen sich mit `tools/capture-factory.mjs` und `tools/capture-motion.mjs` erzeugen.
