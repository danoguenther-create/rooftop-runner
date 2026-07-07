/**
 * Alle Movement-Tuning-Zahlen an einem Ort. Hier drehen, nicht im Code
 * suchen — das ist die Datei fürs Feeling-Tuning.
 */

/** Normale Laufgeschwindigkeit (m/s) */
export const RUN_SPEED = 6;
/** Sprint-Geschwindigkeit (m/s) */
export const SPRINT_SPEED = 9;
/** Horizontale Beschleunigung am Boden (m/s²) */
export const ACCEL = 40;
/** Horizontales Abbremsen ohne Input (m/s²) */
export const DECEL = 30;
/** Anteil der Steuerwirkung in der Luft (0..1) */
export const AIR_CONTROL = 0.4;
/** Vertikale Absprunggeschwindigkeit (m/s) */
export const JUMP_VELOCITY = 8;
/** Spieler-Gravitation (m/s²) — bewusst > 9.81 für knackiges Gefühl */
export const GRAVITY = 20;
/** Sprung nach Verlassen einer Kante noch erlaubt (ms) */
export const COYOTE_MS = 120;
/** Sprung-Eingabe vor der Landung wird gespeichert (ms) */
export const JUMP_BUFFER_MS = 120;

/** Kapsel-Collider: Radius (m) */
export const CAPSULE_RADIUS = 0.35;
/** Kapsel-Collider: halbe Zylinderhöhe (m) — Gesamthöhe = 2*(halfHeight+radius) = 1.8 */
export const CAPSULE_HALFHEIGHT = 0.55;

/** Landung: ab dieser Fallhöhe (m) ist eine Reaktion nötig */
export const LANDING_SOFT_M = 3;
/** Landung: ab dieser Fallhöhe (m) ohne Roll -> Bail */
export const LANDING_BAIL_M = 6;
/** Roll-Taste zählt, wenn max. so viele ms VOR der Landung gedrückt */
export const ROLL_BEFORE_MS = 200;
/** ... oder so viele ms NACH der Landung */
export const ROLL_AFTER_MS = 100;
/** Roll: Speed-Bonus-Faktor */
export const ROLL_BOOST = 1.2;
/** Roll: Bonus-Dauer (s) */
export const ROLL_BOOST_S = 0.5;
/** Harte Landung: keine Beschleunigung für (s) */
export const HARD_LANDING_LOCK_S = 0.3;
/** Bail: Dauer der Aufsteh-Phase (s) */
export const BAIL_S = 1.5;
