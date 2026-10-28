import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyText, downloadTextFile, readFileText } from './files.js';

test('copyText : renvoie vrai si le presse-papiers accepte, faux s\'il refuse ou n\'existe pas', async () => {
  const written = [];
  assert.equal(await copyText('abc', { clipboard: { writeText: async (t) => void written.push(t) } }), true);
  assert.deepEqual(written, ['abc']);
  assert.equal(await copyText('abc', { clipboard: { writeText: async () => { throw new Error('refusé'); } } }), false);
  assert.equal(await copyText('abc', { clipboard: undefined }), false);
  assert.equal(await copyText('abc', { clipboard: {} }), false);
});

test('downloadTextFile : crée un lien de téléchargement nommé, le clique, puis le retire', () => {
  const clicked = [];
  const appended = [];
  const link = { click: () => clicked.push(link.download), remove: () => appended.pop() };
  const doc = { createElement: () => link, body: { append: (el) => appended.push(el) } };
  const created = URL.createObjectURL;
  const revoked = URL.revokeObjectURL;
  URL.createObjectURL = () => 'blob:test';
  URL.revokeObjectURL = () => {};
  try {
    assert.equal(downloadTextFile('sauvegarde.json', '{}', 'application/json', doc), true);
    assert.deepEqual(clicked, ['sauvegarde.json']);
    assert.equal(link.href, 'blob:test');
    assert.deepEqual(appended, [], 'lien retiré après le clic');
  } finally {
    URL.createObjectURL = created;
    URL.revokeObjectURL = revoked;
  }
});

test('downloadTextFile : renvoie faux si le navigateur refuse', () => {
  const doc = { createElement: () => { throw new Error('non'); }, body: {} };
  assert.equal(downloadTextFile('x.json', '{}', 'application/json', doc), false);
});

test('readFileText lit le texte du fichier', async () => {
  assert.equal(await readFileText({ text: async () => 'bonjour', size: 7, name: 'a.json' }), 'bonjour');
});
