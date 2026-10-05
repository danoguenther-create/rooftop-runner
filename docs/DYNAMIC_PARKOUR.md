# Dynamic Parkour: Browser-Adaption

Branch: `feat/dynamic-parkour-browser`. Der vorherige Spielstand mit getrennten Polizei-Minikarten liegt auf `main` (a3655c8).

## Referenz und Umfang

Referenz ist [Dynamic Parkour System von Èric Canela](https://github.com/knela96/Dynamic-Parkour-System), untersuchter Commit `f1ca2c4c0bab9aba9596b4c45e28c2e8cfee9bf1` (MIT). Das Original verwendet Unity, C#, Cinemachine und das Unity Input System. Es lässt sich nicht direkt in unseren Three.js/Rapier-Browserclient laden.

Diese eigenständige TypeScript-Adaption übernimmt die Konzepte der situationsabhängigen Aktionswahl, geometrischen Zielanpassung und Sprungvorhersage. Sie ist kein vollständiger oder animationsidentischer Port. Unity-Szenen, Binärdateien und die im Referenzprojekt genannten Mixamo-Animationen wurden nicht übernommen. Unser Rig, die vorhandenen Clips und prozedurale Kontaktposen bleiben die Grundlage. Die Lizenz der Referenz liegt unter `public/licenses/Dynamic-Parkour-System-MIT.txt`.

## Verhalten

| Referenzkonzept | Browser-Umsetzung |
| --- | --- |
| Vault Fence / Box | Höhe und Tiefe des Hindernisses bestimmen einen kompakten Speed Vault oder das Erklettern seiner Oberseite. |
| Vault Down | Vorwärtsbewegung mit gehaltener Rolltaste erlaubt einen kontrollierten Abstieg auf eine geprüfte Fläche 0,8–3 m tiefer. |
| Slide | Mit gehaltener Rolltaste unter ausreichend hohen Balken durchrutschen; Boden, Durchgang und Platz zum Aufstehen werden geprüft. |
| Auto Step | Die vorhandene kleine Stufenhilfe des Rapier-Controllers bleibt erhalten. |
| Climb Obstacles / Ledges | Vorhandener Wandaufstieg und Kantengriff; Hochziehen hebt zuerst den Körper an und schiebt ihn dann über die Kante. |
| Ledge to Ledge / Drop to Ledges | Seitliche, höhere und tiefere erreichbare Kanten können aus dem Hängen angesteuert werden. Freie Außenecken lassen sich entlanghangeln. Automatisches Rückwärtshängen vom Dach ist nicht neu implementiert. |
| Braced / Free Hang | Eine Wandprobe unterscheidet abgestütztes Hängen und freies Hängen; die Beinpose passt sich an. |
| Jump Prediction | Normale Sprünge über Lücken erhalten eine begrenzte Zielhilfe auf erreichbare Flächen. Vorhandenes Balancieren und Stangenschwingen bleiben erhalten; kein separater Unity-Pole-Controller wurde importiert. |
| Motion Warping / IK | Körperpfade passen sich an echte Oberflächen an; Hände und Beine nutzen unsere Kontaktposen. |

## Steuerung

Die Grundbelegung beider Spieler ist unverändert, einschließlich Sprint auf `#` für Spieler 2, Flips, Spins und Dive Roll. Die folgenden Eingaben beziehen sich auf die jeweiligen Bewegungs-, Sprung- und Rolltasten des Spielers:

- Auf ein geeignetes Hindernis zulaufen: automatische Auswahl zwischen Speed Vault und Erklettern.
- Rolltaste beim Vorwärtslaufen halten: unter einem Balken rutschen oder eine passende Kante kontrolliert hinuntergehen.
- Beim Hängen links/rechts: entlanghangeln, an einer freien Ecke weiter um das Hindernis.
- Beim Hängen links/rechts + Sprung: auf eine seitliche Kante wechseln.
- Beim Hängen vorwärts + Sprung: höhere Kante wählen, falls erreichbar; ansonsten hochziehen wie bisher.
- Beim Hängen rückwärts: tiefere Kante wählen, falls erreichbar; ansonsten loslassen.
- Flips behalten die Sprunghilfe und das anvisierte Landeziel. Während eines Flips unterbrechen dessen Richtungseingaben die Hilfe nicht. Dive Roll und die Rolltaste beenden die Hilfe weiterhin; außerhalb eines Flips auch Loslassen der Vorwärtsbewegung oder deutliches Umlenken.

## Kollisionen und Grenzen

`DynamicParkour.ts` prüft Hindernishöhe, Tiefe, Boden und Landeraum. Geplante Pfade werden mit dem Körpervolumen abgetastet und während der Bewegung erneut geprüft. Ein nachträglich blockierter Vault bricht an einer sicheren Position ab; ein blockierter Kantenwechsel löst den Griff, statt durch das Hindernis zu fahren. Die normale Kollisionskapsel wird nach Vaults wiederhergestellt.

Das System schafft keine neuen Zugänge durch geschlossene Geometrie. Sehr schmale, verdeckte oder zu weit entfernte Ziele werden verworfen. Die Sprunghilfe verändert weder Schwerkraft noch die normale Sprunghöhe; sie korrigiert nur begrenzt die horizontale Bewegung. Jeder Spieler besitzt einen eigenen Planer und eigene Zustände.

## Prüfung

`tests/smoke/smoke-dynamic-parkour.mjs` prüft echte Rapier-Bewegungen für Speed Vault, Aufsteigen, Slide, blockierten Durchgang, kontrollierten Abstieg, Kantenwechsel oben/seitlich/unten, Außenecke, freies Hängen, Sprunglandung, unterstützte Flip-Landung und Spieler 2. Der Test ist in der vollständigen Smoke-Suite registriert.

`tools/capture-dynamic-parkour.mjs` erzeugt reproduzierbare Bilder der neuen Aufstiegs- und Slide-Posen mit dem echten Charakter. Bestehende Kontakt-, Dive-Roll-, Splitscreen- und Physiktests bleiben maßgeblich.
