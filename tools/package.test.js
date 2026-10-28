import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listProjectFiles, planLots } from './package.mjs';

test('planLots : des dossiers entiers, moins de 100 fichiers par lot, rien d\'oublié', () => {
  const files = [
    'index.html', 'README.md', 'docs/PUBLISH.md', 'vendor/zod.js', '.github/workflows/pages.yml',
    'src/main.js', 'src/App.js', 'src/core/a.js', 'src/core/store/b.js', 'src/lib/c.js', 'src/widgets/todo/d.js',
  ];
  const lots = planLots(files);
  assert.deepEqual(lots.map((l) => l.name), ['lot-1', 'lot-2', 'lot-3', 'lot-4']);
  assert.deepEqual(lots[0].files, ['index.html', 'README.md', 'docs/PUBLISH.md', 'vendor/zod.js']);
  assert.deepEqual(lots[1].files, ['src/core/a.js', 'src/core/store/b.js']);
  assert.deepEqual(lots[2].files, ['src/main.js', 'src/App.js', 'src/lib/c.js', 'src/widgets/todo/d.js']);
  assert.deepEqual(lots[3].files, ['.github/workflows/pages.yml']);
  assert.deepEqual(lots.flatMap((l) => l.files).sort(), [...files].sort());
});

test('planLots : refuse un lot de plus de 100 fichiers', () => {
  const many = Array.from({ length: 101 }, (_, i) => `docs/f${i}.md`);
  assert.throws(() => planLots(many), /101 fichiers/);
});

test('le dépôt réel se découpe en lots acceptables, sans site/ ni node_modules', async () => {
  const files = await listProjectFiles();
  assert.ok(files.includes('index.html') && files.includes('.github/workflows/pages.yml') && files.includes('docs/PUBLISH.md'));
  assert.ok(!files.some((f) => f.startsWith('site/') || f.includes('node_modules') || f.endsWith('.zip')));
  const lots = planLots(files);
  for (const lot of lots) assert.ok(lot.files.length <= 100, lot.name);
});
