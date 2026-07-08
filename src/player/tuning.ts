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

// ------------------------------------------------------------- Wall-Run
/** Gravitation im Wall-Run (Faktor auf GRAVITY) */
export const WALLRUN_GRAVITY_FACTOR = 0.25;
/** Maximale Wall-Run-Dauer (ms) */
export const WALLRUN_MAX_MS = 2000;
/** Mindestgeschwindigkeit für Start & Fortsetzung (m/s) */
export const WALLRUN_MIN_SPEED = 4;
/** Wall-Jump: Impuls entlang der Wandnormale (m/s) */
export const WALLJUMP_NORMAL_IMPULSE = 6;
/** Wall-Jump: Impuls nach oben (m/s) */
export const WALLJUMP_UP_IMPULSE = 5;
/** Kamera-Roll zur Wand im Wall-Run (Grad) */
export const WALLRUN_CAMERA_TILT_DEG = 10;
/** Raycast-Länge der Wanderkennung (m) */
export const WALLRUN_RAY_LEN = 0.8;

// ------------------------------------------------------------- Vault
/** Mindest-Speed für Vault (m/s) */
export const VAULT_MIN_SPEED = 3;
/** Hindernishöhe min/max (m, relativ zu den Füßen) */
export const VAULT_MIN_HEIGHT = 0.5;
export const VAULT_MAX_HEIGHT = 1.2;
/** Dauer der Vault-Bewegung (s) */
export const VAULT_DURATION_S = 0.4;
/** Frühestens alle (ms) erneut vaulten */
export const VAULT_COOLDOWN_MS = 500;

// ------------------------------------------------------------- Rail-Grind
/** Aufschnapp-Radius zur Rail (m) */
export const GRIND_SNAP_RADIUS = 0.8;
/** Mindest-Grind-Geschwindigkeit (m/s) */
export const GRIND_MIN_SPEED = 5;
/** Abbremsung auf der Rail (m/s²) */
export const GRIND_FRICTION = 0.4;
/** Absprung von der Rail: vertikale Geschwindigkeit (m/s) */
export const GRIND_JUMP_VELOCITY = 7;
/** Nach Verlassen: dieselbe Rail so lange nicht erneut fangen (ms) */
export const GRIND_RESNAP_MS = 300;

// ------------------------------------------------------------- Lufttricks (Task 15b)
/** Dauer einer Flip-Umdrehung (s) — jede weitere Umdrehung addiert dieselbe Zeit */
export const FLIP_DURATION_S = 0.55;
/** Maximal queuebare Umdrehungen (Triple) */
export const FLIP_MAX_COUNT = 3;
/** Fortschritt der letzten Umdrehung, ab dem die Landung als „gestanden" gilt */
export const FLIP_COMPLETE_MIN = 0.8;
/** Spin-Drehgeschwindigkeit (°/s) um die Hochachse */
export const SPIN_SPEED_DEG = 540;
/** Unvollendete Spins bis zu diesem Rest (°) werden bei der Landung verziehen */
export const SPIN_FORGIVE_DEG = 60;
/** Mindest-Horizontalgeschwindigkeit, ab der ein Backflip als Gainer zählt (m/s) */
export const GAINER_MIN_SPEED = 2;

// ------------------------------------------------------------- Diveroll + Kanten-Precision (Task 15c)
/** Gravitation im Steigflug bei gehaltenem Dive (flachere, weitere Flugbahn) */
export const DIVE_GRAVITY_FACTOR = 0.75;
/** Speed-Boost der Dive-Rolle (normale Rolle: ROLL_BOOST) */
export const ROLL_BOOST_DIVE = 1.35;
/** Max. Kantendistanz für Kanten-Precision (m) */
export const EDGE_PRECISION_DIST = 0.35;
/** Mindest-Fallhöhe, damit eine Kantenlandung als Precision zählt (m) */
export const EDGE_PRECISION_MIN_FALL_M = 2;
/** Zeitfenster, in dem der Sprung „gestanden" werden muss (s) */
export const EDGE_PRECISION_SETTLE_S = 0.3;
/** …und unter diese Geschwindigkeit (m/s) */
export const EDGE_PRECISION_SETTLE_SPEED = 2;
/** Cooldown pro Fläche (ms) */
export const EDGE_PRECISION_COOLDOWN_MS = 3000;

// ------------------------------------------------------------- Wandlauf + Hang/Climb (Task 16b)
/** Wandlauf setzt vy auf diesen Wert (m/s) — ~1.6 m Steighöhe */
export const WALLCLIMB_VY = 8;
/** Dauer der Wandlauf-Phase (ms) — danach leichter Push von der Wand */
export const WALLCLIMB_MAX_MS = 700;
/** Mindest-Horizontalgeschwindigkeit für den Wandlauf (m/s) */
export const WALLCLIMB_MIN_SPEED = 4;
/** Push von der Wand weg nach abgelaufenem Wandlauf (m/s) */
export const WALLCLIMB_PUSH = 1.5;
/** Frühestens danach erneut Wandlauf (ms) */
export const WALLCLIMB_COOLDOWN_MS = 1000;
/** Ledge-Grab: Kante muss zwischen Füße+MIN und Füße+MAX liegen (m) */
export const LEDGE_GRAB_HAND_MIN = 1.6;
export const LEDGE_GRAB_HAND_MAX = 2.1;
/** Max. horizontale Distanz zur Kante (m) */
export const LEDGE_GRAB_DIST = 0.5;
/** Nach Loslassen: so lange nicht erneut greifen (ms) */
export const LEDGE_REGRAB_MS = 300;
/** Kapselzentrum hängt so weit unter der Kante (m) */
export const HANG_CENTER_BELOW = 0.7;
/** Hochziehen auf die Fläche (s) */
export const MANTLE_S = 0.7;
/** Hangeln entlang der Kante (m/s) */
export const SHIMMY_SPEED = 1.5;
