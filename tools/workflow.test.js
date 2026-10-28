// Le workflow de publication (.github/workflows/pages.yml) respecte ce que la phase 11 demande.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFile(join(ROOT, rel), 'utf8');

test('pages.yml : déclencheurs, permissions, concurrence, environnement', async () => {
  const yml = await read('.github/workflows/pages.yml');
  assert.match(yml, /^on:\n {2}push:\n {4}branches: \[main\]\n {2}workflow_dispatch:/m);
  assert.match(yml, /^permissions:\n {2}contents: read\n {2}pages: write\n {2}id-token: write/m);
  assert.match(yml, /^concurrency:\n {2}group: pages/m);
  assert.match(yml, /environment:\n {6}name: github-pages\n {6}url: \$\{\{ steps\.deployment\.outputs\.page_url \}\}/);
  assert.match(yml, /needs: build/);
});

test('pages.yml : étapes dans l\'ordre, sans test de navigateur', async () => {
  const yml = (await read('.github/workflows/pages.yml')).replace(/^\s*#.*$/gm, ''); // sans les commentaires
  const order = [
    'actions/checkout@',
    'actions/setup-node@',
    'run: node --test',
    'run: node tools/check.mjs',
    'run: node tools/export.mjs --out site',
    'actions/configure-pages@',
    'actions/upload-pages-artifact@',
    'actions/deploy-pages@',
  ];
  let at = -1;
  for (const marker of order) {
    const found = yml.indexOf(marker);
    assert.ok(found > at, `${marker} manque ou n'est pas à sa place`);
    at = found;
  }
  assert.match(yml, /node-version: lts\/\*/);
  assert.match(yml, /path: site/);
  assert.ok(!/playwright|e2e|chromium/i.test(yml), 'les parcours de navigateur ne tournent pas dans le workflow');
  // Versions épinglées sur une version majeure (pas de @main ni @master).
  for (const m of yml.matchAll(/uses: (actions\/[a-z-]+)@(\S+)/g)) assert.match(m[2], /^v\d+$/, `${m[1]} doit être épinglée à une version majeure`);
});

test('package.json : version 0.1.0 et scripts de la phase 11', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.version, '0.1.0');
  for (const script of ['test', 'test:coverage', 'check', 'export', 'serve', 'e2e']) assert.ok(pkg.scripts[script], script);
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
});

test('les documents de publication existent et se répondent', async () => {
  for (const rel of ['docs/PUBLISH.md', 'docs/POST_PUBLISH_CHECKLIST.md', 'docs/ACCESSIBILITY_CHECKLIST.md', 'docs/ADDING_A_WIDGET.md']) {
    assert.ok((await read(rel)).length > 500, rel);
  }
  const publish = await read('docs/PUBLISH.md');
  assert.match(publish, /Source[^\n]*GitHub Actions/);
  assert.match(publish, /POST_PUBLISH_CHECKLIST/);
  assert.match(publish, /https:\/\/<utilisateur>\.github\.io\/<dépôt>\//);
});
