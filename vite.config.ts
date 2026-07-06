import { defineConfig } from 'vite';

// base muss dem GitHub-Repo-Namen entsprechen, sonst sind Asset-Pfade
// auf GitHub Pages kaputt. Für Capacitor-Builds (Task 29) wird ein
// eigener Mode mit base './' ergänzt.
export default defineConfig({
  base: '/rooftop-runner/',
});
