import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, isLogicFile, parseLcov } from './coverage.mjs';

test('isLogicFile : logique pure seulement', () => {
  assert.equal(isLogicFile('src/lib/url.js', 'export const a = 1;'), true);
  assert.equal(isLogicFile('src/core/storage/hydrate.js', ''), true);
  assert.equal(isLogicFile('src/widgets/todo/todoLogic.js', ''), true);
  assert.equal(isLogicFile('src/widgets/todo/TodoWidget.js', 'html`<p></p>`'), false, 'hors dossiers concernés');
  assert.equal(isLogicFile('src/core/backup/BackupDialog.js', 'return html`<p></p>`'), false, 'composant');
  assert.equal(isLogicFile('src/lib/url.test.js', ''), false, 'test');
  assert.equal(isLogicFile('src/lib/useNow.js', ''), false, 'hook couvert par le navigateur');
  assert.equal(isLogicFile('src/core/dashboard/actions.js', ''), false);
  assert.equal(isLogicFile('src/lib/style.css', ''), false);
});

test('parseLcov et evaluate : seuil par fichier, fichier jamais chargé = 0 %', () => {
  const lcov = 'TN:\nSF:src/lib/a.js\nLF:10\nLH:9\nend_of_record\nSF:src/lib/b.js\nLF:10\nLH:5\nend_of_record\n';
  const files = parseLcov(lcov);
  assert.deepEqual(files.get('src/lib/a.js'), { found: 10, hit: 9 });
  const r = evaluate(files, [{ rel: 'src/lib/a.js', lines: 0 }, { rel: 'src/lib/b.js', lines: 0 }, { rel: 'src/lib/c.js', lines: 0 }], 80);
  assert.deepEqual(r.failing, ['src/lib/b.js', 'src/lib/c.js']);
  assert.equal(r.rows[2].loaded, false);
  assert.equal(Math.round(r.total), 70);
  assert.deepEqual(evaluate(new Map(), [], 80).failing, []);
});
