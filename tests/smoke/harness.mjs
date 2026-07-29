/**
 * Gemeinsame Helfer für die Smoke-Tests.
 *
 * Die Tests takten die Simulation selbst (window.game.stepFixed) statt in
 * Echtzeit zu warten. Grund: der Game-Loop holt pro Bild höchstens MAX_STEPS
 * Physikschritte nach — unter ~20 fps (headless mit Software-GL der Normalfall)
 * läuft die Simulation deshalb langsamer als die Wanduhr. Ein
 * `waitForTimeout(350)` trifft dann je nach Maschine und Last ein völlig
 * anderes Spielgeschehen. Mit festen Schrittzahlen ist der Ablauf überall
 * identisch — und deutlich schneller, weil keine echten Sekunden verstreichen.
 *
 * Echtzeit-Warten bleibt nur dort richtig, wo außerhalb der Simulation etwas
 * passiert: Seitenaufbau, RAPIER-Init, Laden der Charakter-Assets.
 */

/**
 * Warten, bis start() durch ist (RAPIER-Init, Level geladen, state = PLAYING).
 * Ersetzt das Raten mit festen Sekunden nach page.goto().
 */
export const waitForPlaying = (page) =>
  page.waitForFunction(() => window.game?.state === 'PLAYING' && window.game.players.length > 0, {
    timeout: 60000,
  });

/**
 * Wie waitForPlaying, zusätzlich bis der Spieler nach dem Spawn Boden unter den
 * Füßen hatte. Wichtig für alles, was Lufttricks prüft: die werden erst nach
 * dem ersten Bodenkontakt gequeued (everGrounded), sonst verfällt der erste
 * Flip lautlos.
 */
export const waitForGrounded = async (page) => {
  await waitForPlaying(page);
  await stepUntil(page, () => window.game.player.fsm.current === 'RUN', 300);
};

/** Dauer eines festen Physikschritts in Millisekunden (FIXED_DT = 1/60 s). */
export const STEP_MS = 1000 / 60;

/** n feste Physikschritte ausführen. */
export const step = (page, n) => page.evaluate((n) => window.game.stepFixed(n), n);

/** Simulierte Dauer in Millisekunden, auf ganze Schritte gerundet. */
export const stepMs = (page, ms) => step(page, Math.max(1, Math.round(ms / STEP_MS)));

/**
 * Simulieren, bis die Bedingung im Spiel erfüllt ist — höchstens maxSteps.
 * Ersatz für page.waitForFunction: das wartet in Echtzeit und käme bei
 * manuellem Takt nie ans Ziel, weil ohne stepFixed nichts weiterläuft.
 * Gibt zurück, ob die Bedingung eingetreten ist.
 */
export const stepUntil = async (page, predicate, maxSteps = 900) => {
  const batch = 6;
  for (let done = 0; done < maxSteps; done += batch) {
    if (await page.evaluate(predicate)) return true;
    await step(page, batch);
  }
  return page.evaluate(predicate);
};

/** Taste für die Dauer von n Schritten halten. */
export const hold = async (page, key, n) => {
  await page.keyboard.down(key);
  await step(page, n);
  await page.keyboard.up(key);
};

/** Taste für eine simulierte Dauer halten. */
export const holdMs = (page, key, ms) => hold(page, key, Math.max(1, Math.round(ms / STEP_MS)));
