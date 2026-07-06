import { Game } from './core/Game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const game = new Game(canvas);

game.start().catch((err) => {
  console.error('Game failed to start:', err);
});
