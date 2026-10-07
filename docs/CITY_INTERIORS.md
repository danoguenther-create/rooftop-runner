# Begehbare Häuser

Alle Gebäude der Stadt sind innen begehbar: die 32 Häuser des Rasters, die fünf Lückenbauten dazwischen, die vier Landmarken-Türme, die Polizeiwache sowie 14 Dachräume (Staffelgeschosse und Treppenhäuschen). Die Fabrik hatte ihre Innenräume schon vorher. Erzeugt werden sie in `tools/city-interiors.mjs`, aufgerufen aus `tools/gen-city01.mjs` im Abschnitt „Innenräume“, nachdem alles auf den Dächern steht. Die Wache entsteht zur Laufzeit in `PoliceModels.ts` mit demselben Modul (`buildHouse`, Typen in `city-interiors.d.mts`).

## Aufbau

- **Hülle:** 30 cm starke Außenwände statt eines massiven Blocks. Echte Löcher gibt es nur an offenen Fenstern und Türen. Der 1,4-m-Sockel ist ein Ring um die Hülle.
- **Geschosse:** Decken auf 3,3 m und dann alle 3,2 m, passend zu den gezeichneten Fensterreihen. Ein Geschoss braucht mindestens 2,4 m bis zum Dach.
- **Treppenhaus:** gegenläufige Treppe in einer Ecke (zwei Läufe à 1,3 m Breite und 4 m Lauflänge, Podeste 1,3 m). Stufen sind dünne Platten (Steigung höchstens 0,27 m, Autostep-Grenze 0,4 m). Der Lauf darüber lässt mindestens 2,3 m Kopfhöhe. Decken haben über Läufen und Zwischenpodest eine Öffnung. Der Kern steht 1 m von der Seitenwand ab: Wer an dieser Fassade hochklettert, landet auf Dach und fällt nicht direkt in die Luke.
- **Einrichtung:** pro Geschoss drei einfache Möbel (Regal, Tisch, Sofa oder Kiste) als Hindernisse. Sie stehen nie im Treppenkern oder vor einer Öffnung.
- **Kletterbänder:** umlaufend außen an der Hülle, an offenen Fenstern unterbrochen. Wo ein Lückenbau eine Seitenwand verdeckt, entfallen dort Bänder, Seitenfenster und Fallrohr.

## Zugänge

Man muss einen Weg hinein finden:

- **Offene Fenster** (21) in den Obergeschossen, nie zwei an derselben Fassade. Von außen greift man die Fensterbank und zieht sich hinein. Innen hilft eine niedrige Bank beim Hinaussteigen. Offene Fenster haben Rahmen und einen nach innen geöffneten Flügel, aber kein Glas.
- **Dachluken** (24 Häuser, alle Lückenbauten und Türme) über dem Treppenhaus, mit niedriger Aufkantung an drei Seiten. Eine Luke wird nur dort geschnitten, wo nichts auf dem Dach darüber steht, und nur, wenn das oberste Geschoss mindestens 2,5 m hoch ist.
- **Offene Haustür** nur an zwei Häusern (Index 5 und 29).
- **Dachräume:** Staffelgeschosse und Dachhäuschen sind hohle Räume mit einer offenen Tür zur Dachfläche (`buildRoom`). Lüftungskästen, die früher im massiven Staffelgeschoss steckten, entfallen dort.

Jedes Gebäude hat mindestens einen Zugang. Der Generator meldet die Zahlen beim Lauf („Interiors …“). Lückenbauten, Türme und die Wache haben keine passenden gezeichneten Fenster und sind deshalb nur über das Dach zugänglich.

Die Lage von Kern, Luke und Öffnungen steht in `scenery.buildings[i].interior` (bzw. `infills`, `towers`). `CityScenery` richtet danach Glas, Rahmen, Flügel, Türblatt und die Kiesflächen auf dem Dach aus.

## Prüfung

- `tests/smoke/smoke-interiors.mjs` (in der Suite) läuft in jedem Gebäude das ganze Treppenhaus hoch, wo eine Luke ist bis aufs Dach, auch in der Wache. Jedes offene Fenster wird von einem Griff an der Fensterbank aus betreten und zu Fuß wieder verlassen, jede offene Tür von der Straße aus durchlaufen, jeder Dachraum vom Dach aus betreten. `INTERIOR_ONLY=3,infill-1,tower-0,room-2,station` beschränkt den Test.
- `tools/audit-climb-map.mjs` prüft die Außenaufstiege, jetzt einschließlich Lückenbauten, Türme und Dachräume (`CLIMB_LIMIT=60` für alle Gebäude, `CLIMB_FROM=60` für die übrigen Baukörper). Offene Fenster und Türen gelten dort als Eingänge: Der Anstieg weicht seitlich zur Mauer aus.
- `tools/capture-interiors.mjs` erzeugt Ansichten von Fenster, Raum, Treppenhaus, Dachluke und Tür unter `artifacts/interiors/`.

### Stand 6. Oktober 2026

- Innenräume: 42 Treppenhäuser (32 Häuser, 5 Lückenbauten, 4 Türme, Wache) bis oben begehbar, 21 offene Fenster hinein und hinaus, 2 Türen, 14 Dachräume.
- Kletter-Audit im 1,4-m-Raster: Gebäude 2758/2762 im Gesamtlauf, die vier Fehlstellen bestehen im Nachtest nach Korrekturen am Audit-Start (Startpunkt durch eine Luke im Lückenbau). Dachräume 292/292 nach der Anhebung ihrer Kletterbänder, weitere Baukörper 627/627 (eine Stelle ohne Anlaufboden), Wache 50/50.
- Das Raster ist eine Stichprobe, kein Beweis für jeden Punkt.

## Offen

- Die Räume sind schlicht (Großraum, einfache Möbel, keine Innenbeleuchtung).
- Wie sich die Polizei-Verfolgung verhält, wenn Spieler in ein Gebäude flüchten, ist noch nicht geprüft.
