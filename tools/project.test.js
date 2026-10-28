// Test de structure : le projet de la phase 0 est complet et ses bibliothèques se chargent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const exists = (rel) => stat(join(ROOT, rel)).then(() => true, () => false);

test('les fichiers et dossiers de la phase 0 existent', async () => {
  const required = [
    'index.html', 'theme-init.js', 'favicon.svg', 'package.json', 'RULES.md', 'README.md', 'CHANGELOG.md',
    'styles/theme.css', 'styles/base.css', 'styles/ui.css',
    'src/main.js', 'src/App.js', 'src/lib/vendor.js', 'src/ui/icons.js',
    'src/core/storage', 'src/core/store', 'src/core/dashboard', 'src/core/catalog',
    'src/core/settings', 'src/core/backup', 'src/core/shortcuts',
    'src/widgets', 'src/lib/platform', 'tests/e2e', 'docs',
    'tools/serve.mjs', 'tools/export.mjs', 'tools/check.mjs', 'tools/vendor.mjs', 'tools/vendor-package.json',
    'vendor/preact.js', 'vendor/zod.js', 'vendor/gridstack.js', 'vendor/gridstack.css', 'vendor/sortable.js', 'vendor/LICENSES.md',
    'vendor/fonts/instrument-sans-latin-400-normal.woff2', 'vendor/fonts/instrument-sans-latin-500-normal.woff2',
    'vendor/fonts/instrument-sans-latin-600-normal.woff2', 'vendor/fonts/dm-mono-latin-400-normal.woff2',
    'vendor/fonts/dm-mono-latin-500-normal.woff2',
  ];
  for (const rel of required) assert.ok(await exists(rel), `manquant : ${rel}`);
});

test('index.html : fragment sans script en ligne ni doctype', async () => {
  const html = await readFile(join(ROOT, 'index.html'), 'utf8');
  assert.ok(!/<!doctype|<html|<head|<body/i.test(html));
  assert.ok(!/<script\b(?![^>]*\bsrc\s*=)/i.test(html));
  assert.match(html, /^<title>Dashboard Homepage<\/title>/);
  assert.match(html, /<meta name="claude:viewport-fit-sides" content="cover">/);
  assert.match(html, /<div id="app"><\/div>/);
});

test('package.json : modules ES, scripts, aucune dépendance', async () => {
  const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.scripts.test, 'node --test');
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
});

test('vendor/preact.js exporte ce que le contrat promet, et html fonctionne', async () => {
  const p = await import(pathToFileURL(join(ROOT, 'vendor/preact.js')).href);
  for (const name of ['h', 'render', 'Fragment', 'Component', 'createContext', 'useState', 'useEffect',
    'useLayoutEffect', 'useRef', 'useMemo', 'useCallback', 'useReducer', 'html']) {
    assert.ok(name in p, `export manquant : ${name}`);
  }
  const v = p.html`<p class="a">${'x'}</p>`;
  assert.equal(v.type, 'p');
});

test('vendor/zod.js valide', async () => {
  const { z } = await import(pathToFileURL(join(ROOT, 'vendor/zod.js')).href);
  const schema = z.object({ n: z.number() });
  assert.equal(schema.safeParse({ n: 1 }).success, true);
  assert.equal(schema.safeParse({ n: 'a' }).success, false);
});

test('vendor/zod.js : compilation JIT désactivée (aucun new Function, interdit par la politique de sécurité)', async () => {
  const { z } = await import(pathToFileURL(join(ROOT, 'vendor/zod.js')).href);
  assert.equal(z.core.globalConfig.jitless, true);
});

test('aucun fichier du projet ne charge quoi que ce soit depuis un CDN', async () => {
  for (const rel of ['index.html', 'theme-init.js', 'styles/theme.css', 'styles/base.css', 'styles/ui.css', 'src/main.js', 'src/App.js', 'src/lib/vendor.js']) {
    const text = await readFile(join(ROOT, rel), 'utf8');
    assert.ok(!/https?:\/\//.test(text), `adresse distante dans ${rel}`);
  }
});

async function listFiles(dir) {
  const { readdir } = await import('node:fs/promises');
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(p)));
    else out.push(p);
  }
  return out;
}

test('polices : auto-hébergées, latines, une seule déclaration par graisse utilisée, aucun appel à Google Fonts', async () => {
  const css = await readFile(join(ROOT, 'styles/base.css'), 'utf8');
  const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]);
  assert.equal(faces.length, 5, 'trois graisses de la police de texte, deux de la police à chasse fixe');
  const used = new Set();
  for (const face of faces) {
    const family = /font-family:\s*"([^"]+)"/.exec(face)?.[1];
    const weight = /font-weight:\s*(\d+)/.exec(face)?.[1];
    const url = /url\("([^"]+)"\)/.exec(face)?.[1];
    assert.ok(family && weight && url, face);
    assert.match(url, /^\.\.\/vendor\/fonts\/[a-z-]+-latin-\d+-normal\.woff2$/, 'fichier local, jeu de caractères latin');
    assert.ok(await exists(join('styles', url)), `${url} existe`);
    assert.match(face, /font-display:\s*swap/);
    used.add(`${family}|${weight}`);
  }
  assert.equal(used.size, 5, 'pas de doublon');
  const fonts = (await listFiles(join(ROOT, 'vendor/fonts'))).map((f) => f.split('/').pop()).sort();
  assert.deepEqual(fonts, [
    'dm-mono-latin-400-normal.woff2', 'dm-mono-latin-500-normal.woff2',
    'instrument-sans-latin-400-normal.woff2', 'instrument-sans-latin-500-normal.woff2', 'instrument-sans-latin-600-normal.woff2',
  ], 'aucune police inutilisée dans vendor/fonts');
  for (const abs of [...(await listFiles(join(ROOT, 'src'))), ...(await listFiles(join(ROOT, 'styles'))), join(ROOT, 'index.html')]) {
    const text = await readFile(abs, 'utf8');
    assert.ok(!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(text), `${abs} appelle Google Fonts`);
  }
});

test('aucun script en ligne ni script fabriqué : index.html, code source et document exporté', async () => {
  const { buildDocument } = await import('./export.mjs');
  const html = await readFile(join(ROOT, 'index.html'), 'utf8');
  const doc = buildDocument(html, { preload: ['src/a.js'] });
  for (const text of [html, doc]) assert.ok(!/<script\b(?![^>]*\bsrc\s*=)/i.test(text), 'script en ligne');
  assert.ok(!/\son[a-z]+\s*=\s*["']/i.test(doc), 'gestionnaire d\'événement en ligne (onclick=…)');
  assert.match(doc, /<script src="\.\/theme-init\.js"><\/script>/);
  for (const abs of await listFiles(join(ROOT, 'src'))) {
    if (!abs.endsWith('.js') || abs.endsWith('.test.js')) continue;
    const text = await readFile(abs, 'utf8');
    assert.ok(!/createElement\(\s*['"]script['"]\s*\)|document\.write\s*\(|insertAdjacentHTML|\.innerHTML\s*=/.test(text), `${abs} fabrique du code ou du HTML à l'exécution`);
  }
});
