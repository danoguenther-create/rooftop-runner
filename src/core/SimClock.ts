/**
 * Simulationsuhr — die Zeitbasis für alles, was das Spielverhalten steuert.
 *
 * Zählt ausschließlich tatsächlich simulierte Zeit: pro festem Physikschritt
 * kommt FIXED_DT dazu, sonst nichts. Damit sind Eingabefenster, Cooldowns und
 * Schonfristen unabhängig von der Bildrate — bei einbrechenden fps läuft das
 * Spiel in Zeitlupe (der Akkumulator im Game-Loop deckelt das Nachholen), und
 * mit `performance.now()` gemessene Fenster wären dann in Spielzeit kürzer als
 * gedacht: ein Sprungpuffer von 120 ms wäre bei 12 fps effektiv nur noch ~45 ms.
 *
 * Einheit ist wie bei performance.now() die Millisekunde, damit die Werte in
 * tuning.ts unverändert bleiben.
 *
 * Nicht hierher gehört alles rein Darstellende — HUD-Einblendungen, das
 * Schweben der Sammelobjekte, das Stats-Overlay. Das läuft weiter im Bildtakt
 * über performance.now(), und das ist richtig so.
 */

// Start nicht bei 0: sonst lägen Zeitstempel, die mit 0 initialisiert sind
// („noch nie passiert"), innerhalb des ersten Cooldown-Fensters und würden
// gleich zu Beginn fälschlich blocken.
const EPOCH_MS = 60_000;

let simMs = EPOCH_MS;

/** Aktuelle Simulationszeit in Millisekunden. */
export const simNow = (): number => simMs;

/** Einen Physikschritt weiterzählen (dt in Sekunden). */
export const advanceSim = (dt: number): void => {
  simMs += dt * 1000;
};

/** Für Tests/Neustarts: Uhr zurück auf den Startwert. */
export const resetSim = (): void => {
  simMs = EPOCH_MS;
};
