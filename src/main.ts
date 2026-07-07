import { Game } from './core/Game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const game = new Game(canvas);

// Debug-Zugriff für Konsole & Headless-Tests (kein Security-Risiko:
// alles läuft ohnehin clientseitig)
(window as unknown as { game: Game }).game = game;

game.start().catch((err) => {
  console.error('Game failed to start:', err);
});
