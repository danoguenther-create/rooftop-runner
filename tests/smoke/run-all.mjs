/**
 * Physik-Regressionssuite: führt alle Headless-Smoke-Tests nacheinander aus.
 *
 * Die Tests smoke-m3 … smoke-16d laufen gegen das Graybox-Testlevel
 * (?level=testlevel) — die dauerhafte Physik-Testumgebung. smoke-city
 * prüft das City-Level. Nach jeder Physik-Änderung zuerst diese Suite
 * fahren, erst danach im City-Level testen.
 *
 * Aufruf:  npm run test:smoke                 (baut nicht — vorher npm run build!)
 *          npm run test:smoke -- <Live-URL>   (gegen das Deployment)
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TESTS = [
  'smoke-m3',
  'smoke-15b',
  'smoke-15c',
  'smoke-16b',
  'smoke-16c',
  'smoke-16d',
  'smoke-city',
  'smoke-m4',
];

const url = process.argv[2] ?? 'http://localhost:4173/rooftop-runner/';
let preview = null;

if (url.includes('localhost')) {
  preview = spawn('npx', ['vite', 'preview', '--port', '4173'], {
    stdio: 'ignore',
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
  });
  await new Promise((r) => setTimeout(r, 2500));
}

const failed = [];
for (const test of TESTS) {
  console.log(`\n========== ${test} ==========`);
  const file = fileURLToPath(new URL(`${test}.mjs`, import.meta.url));
  const code = await new Promise((resolve) =>
    spawn(process.execPath, [file, url], { stdio: 'inherit' }).on('exit', resolve),
  );
  if (code !== 0) failed.push(test);
}

preview?.kill();
console.log(
  failed.length
    ? `\nFEHLGESCHLAGEN: ${failed.join(', ')}`
    : '\nALLE SMOKE-TESTS OK — Physik-Regression sauber.',
);
process.exit(failed.length ? 1 : 0);
