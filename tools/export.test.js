import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { CSP, buildDocument, exportSite, findAbsoluteAddresses } from './export.mjs';

const FRAGMENT = `<title>Mon site</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="Une description">
<script src="./theme-init.js"></script>
<link rel="icon" type="image/svg+xml" href="./favicon.svg">
<link rel="stylesheet" href="./styles/theme.css">
<div id="app"></div>
<script type="module" src="./src/main.js"></script>
`;

test('buildDocument : document complet, head et body', () => {
  const doc = buildDocument(FRAGMENT);
  assert.match(doc, /^<!doctype html>\n<html lang="fr">/);
  const [head, body] = doc.split('<body>');
  assert.match(head, /<meta charset="utf-8">/);
  assert.match(head, /name="viewport"/);
  assert.match(head, /<meta name="referrer" content="no-referrer">/);
  assert.match(head, /<title>Mon site<\/title>/);
  assert.match(head, /name="description"/);
  assert.match(head, /<link rel="stylesheet" href=".\/styles\/theme.css">/);
  assert.match(head, /<script src=".\/theme-init.js"><\/script>/);
  assert.match(head, /<link rel="icon" type="image\/svg\+xml" href=".\/favicon.svg">/);
  assert.ok(head.indexOf('theme-init.js') !== -1 && !head.includes('href="/'), 'adresses relatives');
  assert.ok(!head.includes('claude:'), 'les meta claude: ne sont pas exportées');
  assert.match(body, /<div id="app"><\/div>/);
  assert.match(body, /<script type="module" src=".\/src\/main.js"><\/script>/);
  assert.ok(!body.includes('theme-init'), 'theme-init.js est dans le head');
});

test('buildDocument : modulepreload pour chaque module demandé', () => {
  const doc = buildDocument(FRAGMENT, { preload: ['src/a.js', 'vendor/preact.js'] });
  assert.match(doc, /<link rel="modulepreload" href="\.\/src\/a\.js">/);
  assert.match(doc, /<link rel="modulepreload" href="\.\/vendor\/preact\.js">/);
  assert.ok(doc.indexOf('modulepreload') < doc.indexOf('</head>'));
  assert.ok(!buildDocument(FRAGMENT).includes('modulepreload'));
});

test('buildDocument : politique de sécurité en meta, retirée par csp:false', () => {
  const doc = buildDocument(FRAGMENT);
  assert.ok(doc.includes(`http-equiv="Content-Security-Policy" content="${CSP}"`));
  assert.ok(CSP.includes("script-src 'self'") && CSP.includes('img-src \'self\' data: https://www.google.com https://*.gstatic.com'));
  assert.ok(!CSP.includes('frame-ancestors'));
  assert.ok(!buildDocument(FRAGMENT, { csp: false }).includes('Content-Security-Policy'));
});

test('buildDocument : refuse un script en ligne', () => {
  assert.throws(() => buildDocument('<title>x</title><script>1</script>'), /en ligne/);
});

test('findAbsoluteAddresses : repère les adresses commençant par /', () => {
  assert.equal(findAbsoluteAddresses('<script src="/a.js"></script>').length, 1);
  assert.equal(findAbsoluteAddresses("import x from '/a.js'").length, 1);
  assert.equal(findAbsoluteAddresses('a { background: url(/img.png) }').length, 1);
  assert.equal(findAbsoluteAddresses('<script src="//cdn.x/a.js"></script>').length, 1);
  assert.equal(findAbsoluteAddresses('<script src="./a.js"></script> import x from "./a.js"; url("../f.woff2")').length, 0);
});

async function makeProject(extra = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'dash-export-'));
  const files = {
    'index.html': FRAGMENT,
    'theme-init.js': '(function(){})();',
    'favicon.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
    'styles/theme.css': ':root{--bg:#fff}',
    'src/main.js': "import { a } from './a.js';",
    'src/a.js': 'export const a = 1;',
    'src/a.test.js': "import { test } from 'node:test';",
    'src/widgets/.gitkeep': '',
    'vendor/preact.js': 'export const h = 1;',
    'RULES.md': 'règles',
    'tools/export.mjs': '//',
    'tests/e2e/x.mjs': '//',
    'docs/ADDING.md': 'doc',
    '.github/workflows/pages.yml': 'name: x',
    ...extra,
  };
  for (const [rel, text] of Object.entries(files)) {
    await mkdir(dirname(join(dir, rel)), { recursive: true });
    await writeFile(join(dir, rel), text);
  }
  return dir;
}
const exists = (p) => stat(p).then(() => true, () => false);

test('exportSite : copie index.html, theme-init.js, favicon.svg, styles, src, vendor et RIEN d\'autre', async () => {
  const dir = await makeProject();
  try {
    const r = await exportSite({ root: dir, out: 'site' });
    assert.deepEqual(r.files, ['favicon.svg', 'index.html', 'src/a.js', 'src/main.js', 'styles/theme.css', 'theme-init.js', 'vendor/preact.js']);
    for (const absent of ['RULES.md', 'tools', 'tests', 'docs', '.github', 'src/a.test.js']) {
      assert.equal(await exists(join(dir, 'site', absent)), false, `${absent} ne doit pas être exporté`);
    }
    const html = await readFile(join(dir, 'site', 'index.html'), 'utf8');
    assert.match(html, /<html lang="fr">/);
    assert.match(html, /<link rel="modulepreload" href="\.\/src\/a\.js">/, 'les modules importés par main.js sont pré-chargés');
    assert.ok(!html.includes('href="./src/main.js"'), 'main.js est déjà demandé par la balise script');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('exportSite : échoue si un fichier copié contient une adresse absolue', async () => {
  const dir = await makeProject({ 'src/main.js': "import { a } from '/src/a.js';" });
  try {
    await assert.rejects(exportSite({ root: dir, out: 'site' }), /Adresses absolues interdites[\s\S]*src\/main\.js:1/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('exportSite : option sans politique de sécurité et dossier de sortie refusé', async () => {
  const dir = await makeProject();
  try {
    await exportSite({ root: dir, out: 'dist', csp: false });
    assert.ok(!(await readFile(join(dir, 'dist', 'index.html'), 'utf8')).includes('Content-Security-Policy'));
    await assert.rejects(exportSite({ root: dir, out: '.' }), /refusé/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
