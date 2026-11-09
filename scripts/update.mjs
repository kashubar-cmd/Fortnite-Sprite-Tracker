// update.mjs: refreshes sprites.js and mirrors any new sprite images into ./img
//
// Runs on a schedule in GitHub Actions (see .github/workflows/update-sprites.yml)
// but also works locally:  node scripts/update.mjs
//
// Source: the server-rendered card list at https://fortnite.gg/sprites. Each card
// carries data-* attributes (id, rarity, variant, season, unreleased flag) plus the
// icon path in the <img> data-src/src attribute.
//
// Safety: if the page can't be fetched or parses to a suspiciously small list, the
// script exits non-zero WITHOUT touching sprites.js, so a site change or a block
// never wipes the existing list.
//
// Env:
//   FIXTURE=path/to/page.html   parse a saved copy of the page instead of fetching (testing)
//   SKIP_IMAGES=1               update the list only, don't download images

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = 'https://fortnite.gg/sprites';
const ORIGIN = 'https://fortnite.gg';
const MIN_EXPECTED = 100;            // refuse to overwrite the list with fewer entries than this
const UA = 'Mozilla/5.0 (compatible; sprite-tracker-mirror; personal friends-only use)';

// ---- small helpers -------------------------------------------------------
const decode = s => s
  .replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();
const attr = (tag, name) => {
  // fortnite.gg serves single-quoted attributes; accept either quote style
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`));
  return m ? decode(m[2]) : '';
};
const exists = p => access(p).then(() => true, () => false);

// ---- parse ---------------------------------------------------------------
function parse(html) {
  // Each card starts with <div class="sprite-card ...>; split on that marker.
  const chunks = html.split(/<div class=["']sprite-card\b/).slice(1);
  const sprites = [];
  for (const chunk of chunks) {
    const head = '<div class="sprite-card' + chunk.slice(0, chunk.indexOf('>') + 1);
    const id = Number(attr(head, 'data-sprite'));
    const rarity = attr(head, 'data-rarity');
    const variant = attr(head, 'data-variant');
    const season = Number(attr(head, 'data-season'));
    const unreleased = attr(head, 'data-unreleased') === '1' ? 1 : 0;
    const imgTag = (chunk.match(/<img\b[^>]*>/) || [''])[0];
    const src = attr(imgTag, 'data-src') || attr(imgTag, 'src');
    const nameM = chunk.match(/class=["']sprite-name["'][^>]*>([^<]+)</);
    const file = src.split('?')[0].split('/').pop();
    if (!id || !rarity || !variant || !nameM || !file) continue;     // skip malformed cards
    sprites.push({ id, name: decode(nameM[1]), rarity: rarity[0], variant, season, file, unreleased, src });
  }
  // Season labels come from the filter tabs: <div class="filter" data-sprite-season="41">C7 S3</div>
  const seasons = {};
  for (const m of html.matchAll(/data-sprite-season=["'](\d+)["'][^>]*>([^<]+)</g)) seasons[m[1]] = decode(m[2]);
  return { sprites, seasons };
}

// ---- main ----------------------------------------------------------------
async function main() {
  let html;
  if (process.env.FIXTURE) {
    html = await readFile(process.env.FIXTURE, 'utf8');
  } else {
    const res = await fetch(PAGE, { headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'en-US,en;q=0.9' } });
    html = await res.text();
    console.log(`GET ${PAGE} -> HTTP ${res.status}, ${html.length} bytes`);
    if (!res.ok) throw new Error(`Fetching ${PAGE} failed: HTTP ${res.status}: ${html.slice(0, 200).replace(/\s+/g, ' ')}`);
  }

  const { sprites, seasons } = parse(html);
  if (sprites.length < MIN_EXPECTED) {
    throw new Error(`Only parsed ${sprites.length} sprites (expected >= ${MIN_EXPECTED}). ` +
      'The page layout may have changed or the request was blocked. Leaving sprites.js untouched.');
  }

  // Fall back to existing season labels if the tabs weren't found
  let prevSeasons = {};
  try {
    const prev = await readFile(join(ROOT, 'sprites.js'), 'utf8');
    prevSeasons = JSON.parse(prev.match(/window\.SPRITE_DATA = (.*);\s*$/s)[1]).seasons || {};
  } catch { /* first run */ }
  const seasonMap = Object.keys(seasons).length ? seasons : prevSeasons;

  // Download any images we don't already have
  const imgDir = join(ROOT, 'img');
  await mkdir(imgDir, { recursive: true });
  let fetched = 0, failed = 0;
  if (!process.env.SKIP_IMAGES && !process.env.FIXTURE) {
    for (const s of sprites) {
      const dest = join(imgDir, s.file);
      if (await exists(dest)) continue;
      try {
        const url = s.src.startsWith('http') ? s.src : ORIGIN + s.src;
        const r = await fetch(url, { headers: { 'User-Agent': UA } });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        await writeFile(dest, Buffer.from(await r.arrayBuffer()));
        fetched++;
        await new Promise(ok => setTimeout(ok, 150));        // be polite: ~6 requests/sec max
      } catch (e) {
        failed++;
        console.warn(`image failed: ${s.file} (${e.message})`);   // page falls back to hotlinking
      }
    }
  }

  // Write sprites.js. Same shape the page expects (see index.html).
  const rows = sprites.map(s => [s.id, s.name, s.rarity, s.variant, s.season, s.file, s.unreleased]);
  const payload = {
    updated: new Date().toISOString().slice(0, 10),
    seasons: seasonMap,
    sprites: rows,
  };
  const out = '// Auto-generated by scripts/update.mjs. Do not edit by hand.\n' +
    '// sprites row: [id, name, rarity(r/e/l/m/s), variant, season, imageFile, unreleased(0/1)]\n' +
    'window.SPRITE_DATA = ' + JSON.stringify(payload) + ';\n';
  const target = process.env.FIXTURE ? join(ROOT, 'sprites.test.js') : join(ROOT, 'sprites.js');
  await writeFile(target, out);
  console.log(`parsed ${sprites.length} sprites, ${fetched} new images, ${failed} failed -> ${target}`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
