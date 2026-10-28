#!/usr/bin/env node
// Copie les bibliothèques tierces dans vendor/ (et les icônes dans src/ui/iconData.js).
//
// - Installe les versions EXACTES de tools/vendor-package.json dans un dossier
//   temporaire HORS du projet (rien n'est installé dans le projet).
// - Assemble avec esbuild des modules ES autonomes : vendor/preact.js,
//   vendor/zod.js, vendor/gridstack.js, vendor/sortable.js.
// - Copie gridstack.css, les polices woff2 (jeu latin) et note les versions et
//   licences dans vendor/LICENSES.md.
//
// À relancer seulement pour ajouter ou mettre à jour une bibliothèque :
//   node tools/vendor.mjs
// Aucune dépendance : Node seul.

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = join(ROOT, 'vendor');

/** Icônes Lucide copiées dans src/ui/iconData.js (nom de fichier sans .svg). */
export const ICONS = [
  'clock', 'square-check', 'file-text', 'link', 'hourglass', 'plus', 'x', 'settings',
  'grip-vertical', 'copy', 'trash-2', 'pencil', 'ellipsis', 'sun', 'moon', 'monitor',
  'download', 'upload', 'chevron-up', 'chevron-down', 'keyboard', 'layout-grid', 'undo-2',
];

/** Polices : paquet Fontsource, fichier woff2 du jeu latin, graisses utilisées. */
const FONTS = [
  { pkg: '@fontsource/instrument-sans', weights: [400, 500, 600] },
  { pkg: '@fontsource/dm-mono', weights: [400, 500] },
];

const PREACT_ENTRY = `
import { h, render, Fragment, Component, createContext } from 'preact';
import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, useReducer } from 'preact/hooks';
import htm from 'htm';
const html = htm.bind(h);
export { h, render, Fragment, Component, createContext, useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, useReducer, html };
`;

const BUNDLES = [
  { out: 'preact.js', contents: PREACT_ENTRY },
  {
    out: 'zod.js',
    // jitless : Zod 4 essaie sinon « new Function » à chaque chargement pour compiler ses
    // validateurs. La politique de sécurité (script-src 'self', sans unsafe-eval) le bloque et
    // signale une violation, et l'interdiction d'eval s'applique aussi aux extensions.
    // Sans compilation, la validation est un peu plus lente, sans conséquence à cette taille.
    contents: `import { z } from 'zod';\nz.config({ jitless: true });\nexport { z };\n`,
  },
  { out: 'gridstack.js', contents: `import { GridStack } from 'gridstack';\nexport { GridStack };\n` },
  { out: 'sortable.js', contents: `import Sortable from 'sortablejs';\nexport { Sortable };\nexport default Sortable;\n` },
];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function installInTemp() {
  const tmp = mkdtempSync(join(tmpdir(), 'dash-vendor-'));
  copyFileSync(join(ROOT, 'tools', 'vendor-package.json'), join(tmp, 'package.json'));
  console.log(`> npm install dans ${tmp}`);
  const r = spawnSync('npm', ['install', '--no-audit', '--no-fund'], {
    cwd: tmp,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (r.status !== 0) {
    throw new Error('npm install a échoué');
  }
  return tmp;
}

/** Extrait le contenu interne d'un fichier SVG de lucide-static. */
function svgInner(svg) {
  const m = svg.match(/<svg[^>]*>([\s\S]*?)<\/svg>/);
  if (!m) throw new Error('SVG illisible');
  return m[1].replace(/\s*\n\s*/g, '').replace(/\s*\/>/g, '/>').trim();
}

function writeIconData(tmp) {
  const lines = ICONS.map((name) => {
    const file = join(tmp, 'node_modules', 'lucide-static', 'icons', `${name}.svg`);
    if (!existsSync(file)) throw new Error(`Icône Lucide introuvable : ${name}`);
    return `  ${JSON.stringify(name)}: ${JSON.stringify(svgInner(readFileSync(file, 'utf8')))},`;
  });
  const version = readJson(join(tmp, 'node_modules', 'lucide-static', 'package.json')).version;
  const out = `// Fichier GÉNÉRÉ par tools/vendor.mjs : ne pas modifier à la main.
// Icônes Lucide (licence ISC) copiées depuis lucide-static ${version}.
// Contenu interne des SVG 24x24 ; l'enveloppe est dans icons.js.

/** @type {Record<string, string>} */
export const ICON_PATHS = {
${lines.join('\n')}
};
`;
  writeFileSync(join(ROOT, 'src', 'ui', 'iconData.js'), out);
  console.log(`> src/ui/iconData.js (${ICONS.length} icônes)`);
}

async function main() {
  const tmp = installInTemp();
  try {
    const esbuild = await import(pathToFileURL(join(tmp, 'node_modules', 'esbuild', 'lib', 'main.js')).href);
    mkdirSync(join(VENDOR, 'fonts'), { recursive: true });

    for (const b of BUNDLES) {
      await esbuild.build({
        stdin: { contents: b.contents, resolveDir: tmp, sourcefile: b.out + '.entry.js', loader: 'js' },
        bundle: true,
        format: 'esm',
        platform: 'browser',
        target: 'es2022',
        minify: true,
        legalComments: 'none',
        outfile: join(VENDOR, b.out),
        logLevel: 'warning',
      });
      console.log(`> vendor/${b.out}`);
    }

    copyFileSync(join(tmp, 'node_modules', 'gridstack', 'dist', 'gridstack.css'), join(VENDOR, 'gridstack.css'));
    console.log('> vendor/gridstack.css');

    // Polices : uniquement les woff2 du jeu latin pour les graisses utilisées.
    for (const f of FONTS) {
      const name = f.pkg.split('/')[1];
      for (const w of f.weights) {
        const file = `${name}-latin-${w}-normal.woff2`;
        copyFileSync(join(tmp, 'node_modules', f.pkg, 'files', file), join(VENDOR, 'fonts', file));
        console.log(`> vendor/fonts/${file}`);
      }
    }

    writeIconData(tmp);

    // Licences et versions.
    const pkgs = [
      ['preact', 'Interface (composants, hooks)'],
      ['htm', 'Gabarits html sans JSX'],
      ['zod', 'Validation des données'],
      ['gridstack', 'Grille, glisser-déposer, redimensionnement'],
      ['sortablejs', 'Listes triables'],
      ['@fontsource/instrument-sans', 'Police du texte (Instrument Sans)'],
      ['@fontsource/dm-mono', 'Police des chiffres (DM Mono)'],
      ['lucide-static', 'Icônes (copiées dans src/ui/iconData.js)'],
    ];
    const rows = pkgs.map(([name, role]) => {
      const p = readJson(join(tmp, 'node_modules', name, 'package.json'));
      return `| ${name} | ${p.version} | ${p.license} | ${role} |`;
    });
    const esbuildP = readJson(join(tmp, 'node_modules', 'esbuild', 'package.json'));
    const md = `# Bibliothèques copiées dans vendor/

Fichier généré par \`tools/vendor.mjs\`. Les versions sont celles de \`tools/vendor-package.json\`.
Aucune bibliothèque n'est chargée depuis un CDN.

| Paquet | Version | Licence | Rôle |
| --- | --- | --- | --- |
${rows.join('\n')}

Outil d'assemblage (non publié, utilisé seulement par le script) : esbuild ${esbuildP.version} (${esbuildP.license}).
`;
    writeFileSync(join(VENDOR, 'LICENSES.md'), md);
    console.log('> vendor/LICENSES.md');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
