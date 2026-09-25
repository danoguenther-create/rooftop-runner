# Dive Roll per Doppeltipp

Spieler 1 tippt **W zweimal**, Spieler 2 **Pfeil hoch zweimal**, innerhalb von 300 ms. Auf dem Boden startet das einen kräftigen Hechtsprung; keine zusätzliche Sprung- oder Rolltaste erforderlich. Gedrückthalten und Tastatur-Autorepeat zählen nicht als zweiter Tipp. Auch wenn der zweite Tipp sofort losgelassen wird, bleibt das Flugmomentum erhalten. Die bisherigen Luft-Flips bleiben außerhalb der neuen Dive-Roll-Sequenz verfügbar.

Die neue prozedurale Flugbewegung streckt beide Arme nach vorne, kippt den Körper in eine längliche Flugpose und führt bei der Landung in die vorhandene Landerollenanimation. Kontakte wie ein Kantengriff beenden die Flugpose. Die Bewegung gilt für beide unabhängig animierten Spieler.

Als Bewegungsreferenz dient die Beschreibung von [Ann Kaczka / Howcast: Dive & Landing Roll](https://howcast.com/videos/474714-how-to-do-a-dive-landing-roll-parkour/): ein Hindernis im Flug überwinden und anschließend diagonal von der Schulter zur gegenüberliegenden Hüfte rollen. Die Spielbewegung ist bewusst auf die Parkour-Hindernisse abgestimmt; das Tutorial wird nicht als Asset eingebunden.

Der Sprung erreicht auf ebenem Boden etwa 3,7 m Fußhöhe und überwindet im Physiktest eine 2 m hohe Kiste einschließlich deren hinterer Kante. Nach dem Sprung erfolgt die Dive Roll automatisch. Die bestehende C-Dive-Steuerung bleibt verfügbar.

Die obere Grenze für automatisches Abrollen ist von **6 auf 12 m** Fallhöhe verdoppelt; die untere Grenze bleibt 2,4 m. Oberhalb von 12 m bleibt rechtzeitiges manuelles Abrollen nötig. Unvollendete Flips werden nicht automatisch gerettet.

`smoke-dive-jump` prüft Einzel-/Doppeltipp, Autorepeat, beide Spieler, eine echte 2-m-Kollision, Freiflugpose, Loslassen nach dem Doppeltipp, Landerolle sowie Fallhöhen 6/9/11,9/13 m. Bilder der Bewegungsphasen erzeugt `tools/capture-dive.mjs` unter `artifacts/dive/`.

Validierung: TypeScript-/Produktionsbuild erfolgreich; alle 20 Smoke-Tests bestanden, einschließlich beider Dive-Roll-Spieler, Fabrikrouten, Kontaktanimationen, sämtlicher Spielmodi und aller vier Außentreppen. Flugpose anhand der erzeugten Aufnahme visuell geprüft.
