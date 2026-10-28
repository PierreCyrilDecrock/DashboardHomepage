#!/usr/bin/env node
// Couverture de tests : lance `node --test --experimental-test-coverage` et vérifie que chaque
// fichier de LOGIQUE PURE atteint 80 % de lignes couvertes.
//
//   node tools/coverage.mjs [--threshold 80]
//
// Fichiers concernés : src/lib (dont platform/), src/core/storage, src/core/backup,
// src/core/shortcuts et les fichiers *Logic.js des widgets. Sont exclus les fichiers qui dessinent
// de l'interface (gabarit html) et les deux hooks d'horloge (useNow, useCountdown) : leur
// comportement est vérifié dans le navigateur par les parcours tests/e2e/, pas par node:test.
// Un fichier concerné que les tests ne chargent jamais compte pour 0 %.

import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_THRESHOLD = 80;

/** Dossiers dont tous les fichiers de logique sont concernés. */
const FOLDERS = ['src/lib', 'src/core/storage', 'src/core/backup', 'src/core/shortcuts'];
/** Hooks d'horloge, couverts par les parcours navigateur. */
const BROWSER_COVERED = new Set(['src/lib/useNow.js', 'src/lib/useCountdown.js']);

/**
 * Dit si un fichier est de la logique pure à couvrir.
 * @param {string} rel chemin relatif au projet, avec des « / »
 * @param {string} source contenu du fichier
 */
export function isLogicFile(rel, source) {
  if (!rel.endsWith('.js') || /\.test\.js$/.test(rel)) return false;
  if (BROWSER_COVERED.has(rel)) return false;
  const inScope = FOLDERS.some((f) => rel.startsWith(f + '/')) || /^src\/widgets\/[^/]+\/[^/]+Logic\.js$/.test(rel);
  if (!inScope) return false;
  return !/\bhtml`/.test(source); // un composant (gabarit html) n'est pas de la logique pure
}

/**
 * Lit un rapport lcov : lignes couvertes et totales par fichier.
 * @param {string} lcov
 * @returns {Map<string, { found: number, hit: number }>}
 */
export function parseLcov(lcov) {
  const files = new Map();
  let current = null;
  for (const line of lcov.split('\n')) {
    if (line.startsWith('SF:')) current = { name: line.slice(3).trim().split(sep).join('/'), found: 0, hit: 0 };
    else if (line.startsWith('LF:') && current) current.found = Number(line.slice(3));
    else if (line.startsWith('LH:') && current) current.hit = Number(line.slice(3));
    else if (line.startsWith('end_of_record') && current) {
      files.set(current.name, { found: current.found, hit: current.hit });
      current = null;
    }
  }
  return files;
}

/**
 * @param {Map<string, { found: number, hit: number }>} lcovFiles
 * @param {{ rel: string, lines: number }[]} logicFiles fichiers concernés et leur nombre de lignes de code (0 si inconnu)
 * @param {number} threshold
 * @returns {{ rows: { file: string, percent: number, loaded: boolean }[], failing: string[], total: number }}
 */
export function evaluate(lcovFiles, logicFiles, threshold) {
  const rows = logicFiles.map(({ rel }) => {
    const entry = lcovFiles.get(rel);
    if (!entry) return { file: rel, percent: 0, loaded: false };
    return { file: rel, percent: entry.found === 0 ? 100 : (entry.hit / entry.found) * 100, loaded: true };
  });
  const failing = rows.filter((r) => r.percent < threshold).map((r) => r.file);
  const found = logicFiles.reduce((n, { rel }) => n + (lcovFiles.get(rel)?.found ?? 0), 0);
  const hit = logicFiles.reduce((n, { rel }) => n + (lcovFiles.get(rel)?.hit ?? 0), 0);
  return { rows, failing, total: found === 0 ? 100 : (hit / found) * 100 };
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

async function listLogicFiles(root = ROOT) {
  const result = [];
  for (const abs of await walk(join(root, 'src'))) {
    const rel = relative(root, abs).split(sep).join('/');
    if (isLogicFile(rel, await readFile(abs, 'utf8'))) result.push({ rel, lines: 0 });
  }
  return result.sort((a, b) => a.rel.localeCompare(b.rel));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--threshold');
  const threshold = at >= 0 ? Number(args[at + 1]) : DEFAULT_THRESHOLD;
  const dir = await mkdtemp(join(tmpdir(), 'dash-cov-'));
  const lcovPath = join(dir, 'coverage.lcov');
  try {
    const run = spawnSync(process.execPath, ['--test', '--experimental-test-coverage', '--test-reporter=spec', '--test-reporter-destination=stdout', '--test-reporter=lcov', `--test-reporter-destination=${lcovPath}`], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, NODE_TEST_CONTEXT: undefined },
    });
    if (run.status !== 0) {
      process.stderr.write(run.stdout.split('\n').filter((l) => /✖|fail|Error/.test(l)).slice(0, 40).join('\n') + '\n');
      console.error('Des tests échouent : la couverture n\'est pas évaluée.');
      process.exit(1);
    }
    const lcov = parseLcov(await readFile(lcovPath, 'utf8'));
    const result = evaluate(lcov, await listLogicFiles(), threshold);
    for (const r of result.rows) console.log(`${r.percent.toFixed(1).padStart(6)} %  ${r.file}${r.loaded ? '' : '  (jamais chargé par les tests)'}`);
    console.log(`\nLogique pure : ${result.rows.length} fichiers, ${result.total.toFixed(1)} % des lignes couvertes (seuil ${threshold} % par fichier).`);
    if (result.failing.length > 0) {
      console.error(`Sous le seuil :\n  ${result.failing.join('\n  ')}`);
      process.exit(1);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
