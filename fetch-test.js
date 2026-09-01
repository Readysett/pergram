#!/usr/bin/env node
/* Per Gram — API-based classifier test.
 *
 * The 9 GB dump is overkill. This pulls a few thousand protein-relevant
 * products straight from the Open Food Facts API and runs them through
 * the classifier, producing the same report.
 *
 *   node fetch-test.js
 *   node fetch-test.js --pages 40        (more products, slower)
 *   node fetch-test.js --country us      (US products only)
 *
 * Pages are cached in ./off-cache, so a second run costs nothing and you
 * can iterate on classifier rules for free.
 *
 * Needs Node 18 or newer for built-in fetch. Check with: node -v
 */

const fs = require('fs');
const path = require('path');
const { classifyProduct, SOURCES, TIERS, MIN_PROTEIN_100G } = require('./classifier.js');

const args    = process.argv.slice(2);
const argOf   = (n, d) => { const i = args.indexOf('--' + n); return i > -1 ? args[i + 1] : d; };
const PAGES   = parseInt(argOf('pages', '20'), 10);
const COUNTRY = argOf('country', '');
const CACHE   = './off-cache';

/* Categories where protein is plausibly the point. Searching these beats
   random sampling: it concentrates on the products the app will actually
   see, and it exercises every rule rather than a thousand biscuits. */
const CATEGORIES = [
  'protein-powders', 'protein-bars',
  'cheeses', 'yogurts',
  'canned-tuna', 'poultry', 'beef', 'jerky',
  'tofu', 'legumes', 'nut-butters', 'eggs',
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Open Food Facts allows roughly 10 search requests a minute, and the
   category .json pages are a discouraged, heavier endpoint. Use the
   documented search API, stay under the limit, and back off on refusal
   rather than hammering through 29 failures. */
const DELAY_MS = 7000;

async function getJSON(url, tries = 3){
  for (let i = 0; i < tries; i++){
    const res = await fetch(url, {
      headers: { 'User-Agent': 'PerGram-classifier-test/1.0 - contact via github.com/Readysett' }
    });
    if (res.ok) return res.json();
    if (res.status === 429 || res.status === 503){
      const wait = DELAY_MS * (i + 2);            // 14s, 21s, then give up
      console.error('    ' + res.status + ', waiting ' + (wait/1000) + 's …');
      await sleep(wait);
      continue;
    }
    throw new Error('HTTP ' + res.status);
  }
  throw new Error('still refused after ' + tries + ' tries');
}

async function getPage(category, page){
  if (!fs.existsSync(CACHE)) fs.mkdirSync(CACHE);
  const key = path.join(CACHE, (COUNTRY || 'world') + '_' + category + '_' + page + '.json');
  if (fs.existsSync(key)) return JSON.parse(fs.readFileSync(key, 'utf8'));

  const host = COUNTRY ? COUNTRY + '.openfoodfacts.org' : 'world.openfoodfacts.org';
  const url  = 'https://' + host + '/api/v2/search'
             + '?categories_tags_en=' + encodeURIComponent(category)
             + '&fields=product_name,brands,ingredients_text,categories,nutriments,labels_tags'
             + '&page_size=100&page=' + page;

  const j = await getJSON(url);
  fs.writeFileSync(key, JSON.stringify(j));
  await sleep(DELAY_MS);
  return j;
}

(async () => {
  const counts = {}, samples = {}, suspicious = [], unresolved = [];
  let seen = 0, inScope = 0, noProtein = 0, failed = 0;

  const perCat = Math.max(1, Math.ceil(PAGES / CATEGORIES.length));
  const est = Math.ceil(perCat * CATEGORIES.length * DELAY_MS / 1000);
  console.error('Fetching up to ' + perCat + ' page(s) from each of '
    + CATEGORIES.length + ' categories' + (COUNTRY ? ' (' + COUNTRY + ')' : '') + '.');
  console.error('Their API allows ~10 requests a minute, so this takes about '
    + Math.ceil(est / 60) + ' minute(s). Cached afterwards.\n');

  for (const cat of CATEGORIES){
    for (let page = 1; page <= perCat; page++){
      let data;
      try { data = await getPage(cat, page); }
      catch(e){ console.error('  skip ' + e.message); failed++; continue; }

      const products = data.products || [];
      if (!products.length) break;
      process.stderr.write('  ' + cat + ' p' + page + ': ' + products.length + '\n');

      for (const p of products){
        seen++;
        const name = p.product_name || '';
        if (!name) continue;

        const protein = p.nutriments && (p.nutriments.proteins_100g ?? p.nutriments.proteins);
        if (!(protein >= MIN_PROTEIN_100G)){ noProtein++; continue; }
        inScope++;

        const tags0  = (p.labels_tags || []).join(' ');
        const isVegan = /\bvegan\b/i.test(tags0) && !/non-vegan|maybe-vegan/i.test(tags0);
        const key = classifyProduct({
          name: name, ingredients: p.ingredients_text || '',
          categories: p.categories || '', vegan: isVegan,
        }).key || 'UNRESOLVED';

        counts[key] = (counts[key] || 0) + 1;
        (samples[key] = samples[key] || []).length < 6 && samples[key].push(name.slice(0, 62));

        const animal = ['beef','pork','chicken','fish','egg','whey','dairy','cheese'].includes(key);
        if (isVegan && animal && suspicious.length < 40) suspicious.push(key + '  ' + name.slice(0,54));
        if (key === 'UNRESOLVED' && unresolved.length < 40) unresolved.push(name.slice(0, 62));
      }
    }
  }

  const pct = n => (100 * n / Math.max(1, inScope)).toFixed(1).padStart(5) + '%';

  console.log('\n' + '='.repeat(64));
  console.log('PER GRAM — classifier report (via API)');
  console.log('='.repeat(64));
  console.log('products seen          ' + seen.toLocaleString());
  console.log('  under ' + MIN_PROTEIN_100G + 'g protein    ' + noProtein.toLocaleString());
  console.log('in scope               ' + inScope.toLocaleString());
  if (failed) console.log('failed requests        ' + failed);

  if (!inScope){
    console.log('\nNothing came back. Check the connection, and that node -v is 18 or newer.');
    return;
  }

  console.log('\n--- classified as ---');
  const rows = Object.entries(counts).sort((a,b) => b[1] - a[1]);
  for (const [k, n] of rows){
    const s = SOURCES[k];
    console.log(k.padEnd(12) + String(n).padStart(7) + '  ' + pct(n) + '   '
      + (s ? 't' + s.tier + ' ' + TIERS[s.tier].mult.toFixed(2) + '×' : 't3 0.25× (fallback)'));
  }

  const unres = counts.UNRESOLVED || 0;
  console.log('\nunresolved rate        ' + pct(unres));
  console.log(unres / inScope > 0.25
    ? '  → over a quarter unmatched. Add rules before this pays anyone.'
    : '  → acceptable. Unresolved falls to tier 3, so it under-pays rather than over-pays.');

  console.log('\n--- samples per class (eyeball these) ---');
  for (const [k] of rows){
    console.log('\n' + k);
    for (const s of samples[k] || []) console.log('   ' + s);
  }

  console.log(suspicious.length
    ? '\n--- LIKELY WRONG: labelled vegan, classified animal ---\n   ' + suspicious.join('\n   ')
    : '\nNo vegan/animal contradictions found.');

  if (unresolved.length){
    console.log('\n--- unresolved samples (each suggests a missing rule) ---');
    for (const s of unresolved) console.log('   ' + s);
  }
  console.log('\nCached in ' + CACHE + ' — rerun after editing classifier.js and it costs nothing.\n');
})();
