#!/usr/bin/env node
// Rapport de poids et de profondeur d'imports.
//
//   node tools/report.mjs [--json]
//
//  - taille brute de src/, vendor/ et styles/ (sans les tests) ;
//  - JavaScript nécessaire au premier affichage (voir tools/graph.mjs) : nombre de modules, poids
//    brut et compressé (gzip niveau 9, ce que sert GitHub Pages à peu de chose près) ;
//  - profondeur : plus longue chaîne d'imports. Sans pré-chargement, chaque niveau coûte un aller-retour
//    réseau ; l'export ajoute des <link rel="modulepreload"> pour les supprimer ;
//  - modules chargés à la demande (import dynamique).

import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { firstDisplayGraph } from './graph.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

const kb = (n) => `${(n / 1024).toFixed(1)} Ko`;

async function sizeOf(root, dir, filter = () => true) {
  let bytes = 0;
  let count = 0;
  for (const f of await walk(join(root, dir))) {
    if (!filter(f)) continue;
    bytes += (await stat(f)).size;
    count++;
  }
  return { bytes, count };
}

export async function buildReport(root = ROOT) {
  const isShipped = (f) => !/\.test\.m?js$/.test(f) && !f.endsWith('.gitkeep');
  const sizes = {
    src: await sizeOf(root, 'src', isShipped),
    vendor: await sizeOf(root, 'vendor'),
    styles: await sizeOf(root, 'styles'),
  };
  const graph = await firstDisplayGraph(root);
  const rows = [];
  let raw = 0;
  let gzip = 0;
  for (const rel of graph.modules) {
    const buffer = await readFile(join(root, rel));
    const g = gzipSync(buffer, { level: 9 }).length;
    raw += buffer.length;
    gzip += g;
    rows.push({ file: rel, raw: buffer.length, gzip: g });
  }
  rows.sort((a, b) => b.gzip - a.gzip);
  return { sizes, firstDisplay: { files: rows.length, raw, gzip, rows }, depth: graph.longestChain.length, longestChain: graph.longestChain, onDemand: graph.onDemand };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = await buildReport();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const { sizes, firstDisplay } = report;
    console.log('Poids brut (sans les tests)');
    for (const [name, s] of Object.entries(sizes)) console.log(`  ${name.padEnd(8)} ${kb(s.bytes).padStart(10)}  (${s.count} fichiers)`);
    console.log(`\nJavaScript du premier affichage : ${firstDisplay.files} modules, ${kb(firstDisplay.raw)} bruts, ${kb(firstDisplay.gzip)} compressés (gzip).`);
    for (const r of firstDisplay.rows.slice(0, 10)) console.log(`  ${kb(r.gzip).padStart(10)} gzip  ${kb(r.raw).padStart(10)} bruts  ${r.file}`);
    console.log(`\nProfondeur d'imports : ${report.depth} niveaux (cascade sans pré-chargement).`);
    console.log(`Chaîne la plus longue : ${report.longestChain.join(' → ')}`);
    if (report.onDemand.length > 0) {
      console.log('\nChargés à la demande (import dynamique) :');
      for (const d of report.onDemand) console.log(`  ${d.module}  (depuis ${d.from})`);
    }
  }
}
