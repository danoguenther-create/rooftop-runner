# Stadtteile: Westufer, Altstadt-Landmarken, Präsidium

Seit Oktober 2026 ist die Karte nicht mehr nur ein Raster aus gleichartigen Häusern. Ein Fluss teilt die Stadt, westlich davon liegt ein neues Viertel mit anderen Haustypen. In der Altstadt brechen vier Landmarken das Raster auf, und die Polizeiwache ist zum Präsidium gewachsen. Alles Neue ist hohl, innen begehbar und von außen bekletterbar, nach denselben Regeln wie die übrigen Häuser (siehe `docs/CITY_INTERIORS.md`).

## Fluss

Erzeugt in `tools/west-bank.mjs` (`addWestBank`, aufgerufen aus `tools/gen-city01.mjs`).

- **Lage:** x −118 bis −96, von Norden bis ins Meer. Der Stadtboden endet an der Ostkaimauer, Küste und Strand sind an der Mündung geteilt.
- **Kaimauern:** Die Abdeckung steht 40 cm über das Wasser vor. Man kann an ihr hängen. Poller an der Promenade dienen als Vault- und Precision-Linie.
- **Wasser:** Wer hineinfällt, wird an der letzten Stelle festen Bodens außerhalb des Wassers wieder abgesetzt, nicht am Spawn (`scenery.water`, `PlayerController.checkWater`, HUD meldet „SPLASH!“). Kähne, Pfähle, Brücken und der Bogen zählen bewusst nicht als Rückkehrpunkt, weil man von dort sofort wieder abrutschen könnte.

### Querungen

- **Westbrücke** (Straße z −9): Fachwerkbrücke mit Gehwegen. Der Untergurt ist eine 1,1 m hohe Brüstung, der Obergurt auf 6,6 m ein begehbarer Balken. Die Portalpfeiler stehen auf dem Flussbett und haben Kletterbänder. Über der Fahrbahn hängen auf 3,4 m sechs Querstangen als Schwungkette über den Fluss.
- **Bogenbrücke** (Straße z 21): Fußgängerbrücke, deren Deck auf 2,4 m ansteigt. Die beiden Bogenrippen sind schräge Balken mit höchstens 37° (Laufgrenze 50°), also ein Balancierweg bis zum Scheitel auf 5,2 m.
- **Hafenbrücke** (Promenade z 94): flache Brücke mit Brüstungen, die die Strandpromenade über die Mündung fortsetzt.
- **Kähne:** Ein Lastkahn liegt an jeder Kaimauer, mit zwei Pfählen im Strom dazwischen. Von Deck zu Pfahl und von Pfahl zu Deck sind es je 3,25 m. Im Lauftempo ist der Pfahl das Zwischenziel. Ein Sprint-Sprung trägt fast über die ganze Lücke, reicht aber nicht ganz. Auf dem östlichen Kahn stehen zwei gestapelte Container und ein Steuerhaus, auf dem westlichen Schüttgut als Stufenhaufen.

## Westufer

- **Westturm** (x −172, z −52): 57,6 m, 18 Geschosse, Balkone an jeder zweiten Achse. Außen ist er wie jedes Haus über umlaufende Kletterbänder alle 1,6 m bekletterbar, der Audit braucht dafür rund 32 s Spielzeit. Auf dem Dach steht ein hohler Laternenraum mit Antenne. Davor liegt ein Platz mit Pflanzkübeln, Bänken und Brunnen.
- **Kontor West:** Bürohaus mit 25 m Höhe neben dem Turm.
- **Stadthausreihe** (z 6,5): acht schmale Häuser (7,5–10 m breit) mit Sprunglücken von 3–4,2 m. Die Höhen springen zwischen 8,6 und 19,2 m, die Dachroute geht also hoch und runter. Jedes Haus hat einen Treppengiebel aus drei kletterbaren Stufen über der Straßenfront.
- **Einzelhaus:** am Ende der Reihe, in einem ummauerten Garten. Es ist eines der seltenen Häuser mit offener Haustür, das Gartentor liegt davor.
- **Villen** (südlich der Bogenbrückenstraße): vier freistehende Villen mit 6,6–10,4 m in ummauerten Gärten mit Tor zur Straße und Hecke. Dazu kommen Pool mit Sprungturm, Pergola (Latten als Schwungstangen auf 2,8 m), Garage mit Kletterbändern und auf einer Villa ein Dachturm.

`CityScenery` kleidet die neuen Häuser über `kind` ein. Wohnhäuser (`villa`, `townhouse`, `lone`) bekommen im Erdgeschoss Wohnungsfenster und eine Haustür mit Vordach statt einer Ladenfront. Schilder tragen nur Turm und Kontor. Die Dachausstattung des alten Rasters (Solarfelder, Geländer, Lüfter) gibt es dort nicht.

## Altstadt-Landmarken

Nur Häuser ohne Straßenquerung und abseits der Zeitrennen-Route wurden verändert. Rails, Stangen, Slabs, Schilder und Marker hängen am Höhenraster `h(r,i)` und wandern mit.

- **A0** (Ecke am Fluss): 10 → 17 m, Ziegelputz, Eckturm mit gestuftem Dach (hohl, Tür zur Dachfläche).
- **B0** (Ecke am Fluss): 14 → 19 m, Backstein-Speicher (`look: 'brick'`, Wände in `mill-brick`).
- **B7** (Ostende): 9 → 18 m, Glashaus mit geschosshoher Verglasung (`look: 'glass'`).
- **C7:** 6 → 4,2 m, eingeschossiger Pavillon.

## Polizeipräsidium

Die Maße liegen in `tools/police-station.mjs` (Generator, `PoliceModels.ts`, Audit und Interiors-Test lesen sie von dort): 28 × 16 m, 12,6 m, vier Geschosse. Die Front bleibt auf der Vorplatzlinie z 83, die Streifenwagen rücken also unverändert aus.

- Fensterreihen rundum, Leuchtschrift „POLIZEIPRÄSIDIUM“ auf dem Dach.
- Hubschrauber-Landeplatz und Funkmast auf einem Technikhäuschen.
- Dachluke über dem Treppenhaus in der vorderen Ostecke.
- Die Promenadenlaterne, die bisher im Grundriss der (jetzt hohlen) Wache stand, entfällt.

Die Polizei-Navigation reicht jetzt bis x −280 und damit über den Fluss. Die Minikarte zeigt Westufer und Fluss.

## Prüfung

- `tests/smoke/smoke-west-bank.mjs` (in der Suite): alle drei Brücken zu Fuß, der Bogen bis über 5 m, der Wasser-Reset ans Ufer und die Sprungkette Kai – Kahn – Pfahl – Kahn.
- `tests/smoke/smoke-interiors.mjs` deckt die neuen Häuser und Dachräume mit ab (auch den 18-geschossigen Turm), `INTERIOR_ONLY=32,42,room-14` beschränkt ihn.
- `tools/audit-climb-map.mjs`: Der Rahmen pro Anstieg wächst mit der Gebäudehöhe (rund 1,25 s pro Meter, mindestens 30 s).
- `tools/capture-west-bank.mjs` erzeugt Ansichten unter `artifacts/west-bank/` (`SHOTS=westturm,barges` für einzelne).

### Stand 7. Oktober 2026

- Kletter-Audit (je Seite drei Startstellen): Westufer 289 Fälle. 19 davon haben keinen Anlaufboden und werden übersprungen (Pfeiler- und Kahnseiten zum Wasser, eine fassadenbündige Turmseite), alle übrigen bestehen. Geänderte Altstadthäuser, Lückenhaus, Dachräume und Präsidium: 133 Fälle bestanden, 6 Turmseiten fassadenbündig übersprungen.
- Zwei Funde aus dem Audit sind behoben: Der Dachturm einer Villa stand 20 cm an der Kante und ließ keinen Ausstieg zu, jetzt 1,7 m Abstand. Die Stufenkappe des Eckturms auf A0 ließ nur 40 cm Rand, jetzt 80 cm.
- Innenräume: alle 15 neuen Häuser (auch der Westturm bis aufs Dach), ihre offenen Fenster, die Tür des Einzelhauses und die neuen Dachräume bestehen `smoke-interiors`.
- Nebenbefund `smoke-stairs`: Im Sprint lehnte Rapiers Autostep an Treppe 1 eine 30-cm-Stufe gelegentlich ab, je nachdem, in welcher Phase der Spieler die Kante traf. Danach klemmte er dauerhaft davor. Das hing nicht an der neuen Geometrie: Mit den neuen Leveldaten startete der Lauf nur ein Bild versetzt. `PlayerController.stepUp` hebt den Läufer jetzt selbst auf Stufen bis 0,42 m, wenn er am Boden blockiert ist und der Körper oben frei steht.
- `smoke-factory-storeys` schaltet die Polizei ab wie schon `smoke-factory-sewers`: Beamte stellten den Läufer sonst mitten im Wegetest. Im Polizei-Routentest ist das westliche Ziel jetzt das Dach von A1, weil A0 als Kletterziel 6 m darüber liegt.
