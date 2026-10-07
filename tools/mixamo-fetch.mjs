/**
 * Bulk download of Mixamo motions for review (public/models/incoming/).
 * Reads a short-lived Mixamo session token from ~/.mixamo-token (never from
 * the repo). Every search query keeps its best LIMIT hits; already present
 * files are skipped, so the script can be re-run after a token expires.
 *
 *   node tools/mixamo-fetch.mjs            all queries below
 *   MIXAMO_QUERY="wall run" LIMIT=8 node tools/mixamo-fetch.mjs
 */
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { homedir } from 'node:os';

const QUERIES = [
  'standing jump', 'running jump', 'long jump', 'jumping down', 'jump over',
  'landing', 'hard landing', 'falling to roll', 'roll',
  'flip', 'backflip', 'side flip',
  'braced hang', 'freehang', 'shimmy', 'climbing', 'hanging',
  'vault', 'parkour', 'slide', 'wall run', 'wall jump', 'run to stop',
];
const LIMIT = Number(process.env.LIMIT ?? 12);
// Character variants that are no use for a runner.
const SKIP = /injur|zombie|drunk|old man|female|girl|crouch walk|sword|rifle|pistol|gun|box|boxing|swim|dance|mma|kick|punch|sitting|fight|ninja/i;
const OUT = new URL('../public/models/incoming/', import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const token = (await readFile(`${homedir()}/.mixamo-token`, 'utf8')).trim();
const headers = { Authorization: `Bearer ${token}`, 'X-Api-Key': 'mixamo2', 'Content-Type': 'application/json', Accept: 'application/json' };
const api = async (path, init = {}) => {
  // Mixamo throttles exports (429): back off and try again.
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://www.mixamo.com/api/v1/${path}`, { headers, ...init });
    if (res.status === 429 && attempt < 8) { await sleep(30000 * (attempt + 1)); continue; }
    if (!res.ok) throw new Error(`${res.status} ${path}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }
};
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

await mkdir(OUT, { recursive: true });
const character = (await api('characters/primary')).primary_character_id;
const seen = new Set();
const manifest = [];
for (const query of process.env.MIXAMO_QUERY ? [process.env.MIXAMO_QUERY] : QUERIES) {
  const list = await api(`products?page=1&limit=${LIMIT}&order=&type=Motion&query=${encodeURIComponent(query)}`);
  for (const item of list.results ?? []) {
    if (seen.has(item.id) || SKIP.test(item.name)) continue;
    seen.add(item.id);
    const file = `${slug(item.name)}-${item.id.slice(0, 6)}.fbx`;
    manifest.push({ query, name: item.name, description: item.description, id: item.id, file });
    try { await access(new URL(file, OUT)); continue; } catch {}
    const product = await api(`products/${item.id}?similar=0&character_id=${character}`);
    const gms = product.details.gms_hash;
    // In place where the motion offers it; the game moves the body itself.
    const params = gms.params.map((p) => p[1]).join(',');
    await api('animations/export', {
      method: 'POST',
      body: JSON.stringify({
        character_id: character,
        gms_hash: [{ 'model-id': gms['model-id'], mirror: false, trim: gms.trim, overdrive: 0, params, 'arm-space': gms['arm-space'] ?? 0, inplace: !!gms.inplace }],
        preferences: { format: 'fbx7_2019', skin: 'false', fps: '30', reducekf: '0' },
        product_name: item.name,
        type: 'Motion',
      }),
    });
    let url = null;
    for (let k = 0; k < 60 && !url; k++) {
      await sleep(2000);
      const job = await api(`characters/${character}/monitor`);
      if (job.status === 'completed') url = job.job_result;
      else if (job.status === 'failed') throw new Error(`export failed: ${item.name}`);
    }
    if (!url) throw new Error(`export timed out: ${item.name}`);
    await writeFile(new URL(file, OUT), Buffer.from(await (await fetch(url)).arrayBuffer()));
    console.log('saved', file, '—', item.name);
    await sleep(1500);
  }
}
await writeFile(new URL('manifest.json', OUT), JSON.stringify(manifest, null, 1) + '\n');
console.log(`${manifest.length} motions listed in public/models/incoming/manifest.json`);
