#!/usr/bin/env node
// Archives de livraison.
//
//   node tools/package.mjs [--out dossier]
//
// Produit deux archives dans le dossier de sortie (par défaut : le dossier courant) :
//   dashboard-homepage.zip           l'arbre COMPLET du dépôt (sans node_modules, site/, .git, dossiers temporaires) ;
//   dashboard-homepage-envoi-web.zip la même chose découpée en lots de moins de 100 fichiers, pour l'envoi par
//                                    glisser-déposer sur la page web de GitHub (qui refuse plus de 100 fichiers à la fois).
//                                    Chaque lot reproduit l'arborescence du dépôt : on glisse son CONTENU à la racine.
// Nécessite la commande `zip` du système.

import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const MAX_FILES_PER_UPLOAD = 100;

const EXCLUDED_DIRS = new Set(['node_modules', 'site', 'dist', '.git', '.cache', 'tmp', 'coverage']);
const EXCLUDED_FILES = new Set(['.DS_Store', 'Thumbs.db']);

/**
 * Fichiers du dépôt (chemins relatifs, avec des « / »), triés.
 * @param {string} [root]
 * @returns {Promise<string[]>}
 */
export async function listProjectFiles(root = ROOT) {
  const out = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry.name)) await walk(join(dir, entry.name));
      } else if (!EXCLUDED_FILES.has(entry.name) && !/\.(zip|log)$/.test(entry.name)) {
        out.push(relative(root, join(dir, entry.name)).split(sep).join('/'));
      }
    }
  };
  await walk(root);
  return out.sort();
}

/**
 * Répartit les fichiers en lots d'au plus `max` fichiers, chaque lot étant un ensemble de dossiers entiers :
 * lot 1 = la racine et les petits dossiers, puis `src/core`, puis le reste de `src`, puis `.github`.
 * @param {string[]} files
 * @param {number} [max]
 * @returns {{ name: string, files: string[] }[]}
 */
export function planLots(files, max = MAX_FILES_PER_UPLOAD) {
  const groups = [
    { name: 'lot-1', test: (f) => !f.startsWith('src/') && !f.startsWith('.github/') },
    { name: 'lot-2', test: (f) => f.startsWith('src/core/') },
    { name: 'lot-3', test: (f) => f.startsWith('src/') && !f.startsWith('src/core/') },
    { name: 'lot-4', test: (f) => f.startsWith('.github/') },
  ];
  const lots = groups.map((g) => ({ name: g.name, files: files.filter(g.test) })).filter((l) => l.files.length > 0);
  for (const lot of lots) {
    if (lot.files.length > max) throw new Error(`${lot.name} contient ${lot.files.length} fichiers (plus de ${max}) : revoir le découpage de tools/package.mjs.`);
  }
  const placed = lots.reduce((n, l) => n + l.files.length, 0);
  if (placed !== files.length) throw new Error('Des fichiers ne sont dans aucun lot.');
  return lots;
}

function zip(cwd, archive, entries) {
  const run = spawnSync('zip', ['-r', '-X', '-q', archive, ...entries], { cwd, encoding: 'utf8' });
  if (run.error || run.status !== 0) throw new Error(`zip a échoué : ${run.error?.message ?? run.stderr}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf('--out');
  const out = resolve(at >= 0 ? process.argv[at + 1] : '.');
  await mkdir(out, { recursive: true });
  const files = await listProjectFiles();
  const lots = planLots(files);

  const stage = await mkdtemp(join(tmpdir(), 'dash-package-'));
  try {
    // 1. Arbre complet, dans un dossier « dashboard-homepage ».
    const full = join(stage, 'dashboard-homepage');
    for (const f of files) {
      await mkdir(dirname(join(full, f)), { recursive: true });
      await cp(join(ROOT, f), join(full, f));
    }
    await rm(join(out, 'dashboard-homepage.zip'), { force: true });
    zip(stage, join(out, 'dashboard-homepage.zip'), ['dashboard-homepage']);

    // 2. Lots pour le glisser-déposer.
    const web = join(stage, 'envoi-web');
    for (const lot of lots) {
      for (const f of lot.files) {
        await mkdir(dirname(join(web, lot.name, f)), { recursive: true });
        await cp(join(ROOT, f), join(web, lot.name, f));
      }
    }
    await rm(join(out, 'dashboard-homepage-envoi-web.zip'), { force: true });
    zip(web, join(out, 'dashboard-homepage-envoi-web.zip'), lots.map((l) => l.name));
    console.log(`dashboard-homepage.zip : ${files.length} fichiers`);
    for (const lot of lots) console.log(`  ${lot.name} : ${lot.files.length} fichiers`);
    console.log(`Archives dans ${out}`);
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
