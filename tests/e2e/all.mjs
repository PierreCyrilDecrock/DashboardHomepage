// Lance tous les parcours navigateur, l'un après l'autre (npm run e2e).
//
//   node tests/e2e/all.mjs [phase0 phase5 …]     (sans argument : tous)
//
// Prérequis hors du projet : Playwright et Chromium (PLAYWRIGHT_MODULES), axe-core pour
// phase11-a11y (AXE_MODULES). Rien de tout cela n'est une dépendance du dépôt.

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Ordre : phase0, phase1, … phase10, puis les parcours de la phase 11. */
export function orderJourneys(names) {
  const rank = (n) => {
    const m = /^phase(\d+)(?:-(.+))?$/.exec(n);
    return m ? Number(m[1]) * 100 + (m[2] ? 1 : 0) : Number.MAX_SAFE_INTEGER;
  };
  return [...names].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const available = readdirSync(HERE).filter((f) => /^phase\d+(-[a-z0-9]+)?\.mjs$/.test(f)).map((f) => f.replace(/\.mjs$/, ''));
  const wanted = process.argv.slice(2);
  const journeys = orderJourneys(wanted.length > 0 ? wanted : available);
  const unknown = journeys.filter((j) => !available.includes(j));
  if (unknown.length > 0) {
    console.error(`Parcours inconnu : ${unknown.join(', ')}`);
    process.exit(2);
  }
  const failed = [];
  const started = Date.now();
  for (const name of journeys) {
    console.log(`\n=== ${name} ===`);
    const run = spawnSync(process.execPath, [join(HERE, `${name}.mjs`)], { stdio: 'inherit', cwd: resolve(HERE, '..', '..') });
    if (run.status !== 0) failed.push(name);
  }
  const seconds = Math.round((Date.now() - started) / 1000);
  console.log(`\n${journeys.length - failed.length} / ${journeys.length} parcours réussis en ${seconds} s.`);
  if (failed.length > 0) {
    console.error(`Échecs : ${failed.join(', ')}`);
    process.exit(1);
  }
}
