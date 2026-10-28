#!/usr/bin/env node
// Exporte le projet en site statique complet (GitHub Pages, et plus tard l'extension).
//
//   node tools/export.mjs [dossier] [--out dossier] [--no-csp] [--no-preload]
//
// index.html est un FRAGMENT (celui de l'artefact : pas de doctype, de head ni de
// body). L'export en fait un document complet :
//   - doctype, <html lang="fr">, charset, viewport, color-scheme ;
//   - la balise meta de politique de sécurité (retirée par --no-csp) ;
//   - le <title>, les <meta>, les <link> et les scripts classiques externes du
//     fragment (theme-init.js) dans le <head>, le reste dans le <body>.
//     Les <meta name="claude:…"> ne concernent que l'artefact et ne sont pas copiées.
//
// Les modules du premier affichage reçoivent chacun un <link rel="modulepreload"> (voir tools/graph.mjs).
//
// Sont copiés : index.html (transformé), theme-init.js, favicon.svg, styles/, src/, vendor/.
// RIEN d'autre : ni tests, ni tools, ni docs, ni .github, ni RULES.md. Les fichiers
// *.test.js de src/ ne sont pas copiés non plus.
//
// L'export échoue si un fichier copié contient une adresse absolue commençant par
// « / » (src, href, import, url()) : le site est servi sous un sous-dossier.

import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { firstDisplayGraph } from './graph.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: https://www.google.com https://*.gstatic.com; font-src 'self'; connect-src 'self'; " +
  "base-uri 'self'; form-action 'self'";

const COPIED = ['theme-init.js', 'favicon.svg', 'styles', 'src', 'vendor'];
const TEXT_EXT = /\.(html|js|mjs|css)$/i;

/** Motifs d'adresses absolues (commençant par « / »), y compris « // » (protocole relatif). */
const ABSOLUTE_PATTERNS = [
  /\b(?:src|href|action|poster)\s*=\s*["'`]\//g,
  /\bfrom\s*["']\//g,
  /\bimport\s*\(\s*["'`]\//g,
  /\bimport\s*["']\//g,
  /url\(\s*["']?\//g,
  /@import\s+["']\//g,
];

/**
 * Renvoie les adresses absolues trouvées dans un texte (html, js ou css).
 * @param {string} text
 * @returns {{ line: number, excerpt: string }[]}
 */
export function findAbsoluteAddresses(text) {
  const found = [];
  for (const re of ABSOLUTE_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const line = text.slice(0, m.index).split('\n').length;
      found.push({ line, excerpt: m[0] });
    }
  }
  return found;
}

/**
 * Transforme le fragment index.html en document complet.
 * @param {string} fragment
 * @param {{ csp?: boolean, preload?: string[] }} [options]  preload : modules (chemins relatifs) à pré-charger
 * @returns {string}
 */
export function buildDocument(fragment, { csp = true, preload = [] } = {}) {
  if (/<script\b(?![^>]*\bsrc\s*=)/i.test(fragment)) {
    throw new Error('index.html contient un <script> en ligne : interdit (politique de sécurité).');
  }
  let body = fragment;
  const head = [];

  const take = (re, keep = () => true) => {
    body = body.replace(re, (m) => {
      if (keep(m)) head.push(m.trim());
      return '';
    });
  };

  take(/<title\b[^>]*>[\s\S]*?<\/title>/gi);
  take(/<meta\b[^>]*>/gi, (m) => !/\bname\s*=\s*["'](?:claude:|viewport|color-scheme)/i.test(m) && !/\bcharset\s*=/i.test(m));
  take(/<link\b[^>]*>/gi);
  // Scripts classiques externes (theme-init.js) : dans le head, pour s'exécuter avant l'affichage.
  take(/<script\b(?![^>]*\btype\s*=\s*["']module["'])[^>]*\bsrc\s*=[^>]*>\s*<\/script>/gi);

  const lines = [
    '<!doctype html>',
    '<html lang="fr">',
    '<head>',
    '<meta charset="utf-8">',
  ];
  if (csp) lines.push(`<meta http-equiv="Content-Security-Policy" content="${CSP}">`);
  lines.push(
    '<meta name="referrer" content="no-referrer">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light dark">',
    ...head,
    // Les modules du premier affichage sont demandés tous ensemble, au lieu d'être découverts d'import en import.
    ...preload.map((href) => `<link rel="modulepreload" href="./${href}">`),
    '</head>',
    '<body>',
    body.trim(),
    '</body>',
    '</html>',
    '',
  );
  return lines.join('\n');
}

/** Liste récursive des fichiers d'un dossier (chemins absolus). */
async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

const isExcluded = (name) => /\.test\.m?js$/.test(name) || name === '.gitkeep' || name === '.DS_Store';

/**
 * Exporte le projet.
 * @param {{ root?: string, out?: string, csp?: boolean, preload?: boolean }} [options]  preload : false = sans <link rel="modulepreload"> (mesures)
 * @returns {Promise<{ out: string, files: string[], bytes: number }>}
 */
export async function exportSite({ root = ROOT, out = 'site', csp = true, preload: withPreload = true } = {}) {
  root = resolve(root);
  const outDir = resolve(root, out);
  if (outDir === root || root.startsWith(outDir + sep)) {
    throw new Error(`Dossier de sortie refusé : ${outDir}`);
  }

  const fragment = await readFile(join(root, 'index.html'), 'utf8');

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  for (const item of COPIED) {
    const from = join(root, item);
    const info = await stat(from).catch(() => null);
    if (!info) throw new Error(`Fichier ou dossier manquant : ${item}`);
    await cp(from, join(outDir, item), {
      recursive: true,
      filter: (src) => !isExcluded(src.split(sep).pop() || ''),
    });
  }

  // Document final : pré-chargement des modules du premier affichage (calculés sur le site copié).
  const graph = await firstDisplayGraph(outDir);
  const preload = withPreload ? graph.modules.filter((m) => m !== 'src/main.js') : [];
  await writeFile(join(outDir, 'index.html'), buildDocument(fragment, { csp, preload }));

  // Contrôle des adresses absolues dans tout ce qui a été copié.
  const files = (await walk(outDir)).map((f) => relative(outDir, f).split(sep).join('/')).sort();
  const problems = [];
  let bytes = 0;
  for (const rel of files) {
    const abs = join(outDir, rel);
    bytes += (await stat(abs)).size;
    if (!TEXT_EXT.test(rel)) continue;
    const text = await readFile(abs, 'utf8');
    for (const f of findAbsoluteAddresses(text)) problems.push(`${rel}:${f.line} adresse absolue (${f.excerpt.trim()})`);
  }
  if (problems.length > 0) {
    throw new Error(
      `Adresses absolues interdites (le site est servi sous un sous-dossier) :\n  ${problems.join('\n  ')}`,
    );
  }
  return { out: outDir, files, bytes };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let out = 'site';
  let csp = true;
  let preload = true;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--no-csp') csp = false;
    else if (args[i] === '--no-preload') preload = false;
    else if (args[i] === '--out') out = args[++i];
    else if (!args[i].startsWith('--')) out = args[i];
    else {
      console.error(`Option inconnue : ${args[i]}`);
      process.exit(2);
    }
  }
  try {
    const r = await exportSite({ out, csp, preload });
    console.log(`Export : ${r.files.length} fichiers, ${(r.bytes / 1024).toFixed(0)} Ko dans ${r.out}${csp ? '' : ' (sans politique de sécurité)'}`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
