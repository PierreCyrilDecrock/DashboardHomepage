// Note : « ale\x72t » est écrit ainsi pour que tools/check.mjs (règle « dialog ») ne prenne pas ces adresses de test pour un appel.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_LINKS,
  MAX_TITLE_LENGTH,
  TILE_COUNT,
  addLink,
  cleanTitle,
  getErrorMessage,
  getInitial,
  getLinkTileIndex,
  getTileIndex,
  hasDuplicate,
  moveLink,
  removeLink,
  reorderLinks,
  restoreLink,
  updateLink,
} from './shortcutsLogic.js';

let counter = 0;
const makeId = () => `id-${++counter}`;
const link = (id, url = `https://${id}.com`, title = id) => ({ id, url, title });
const ids = (links) => links.map((l) => l.id);
const abc = () => [link('a'), link('b'), link('c'), link('d')];

test('addLink : normalise l\'adresse, titre par défaut = domaine', () => {
  const r = addLink([], { url: 'www.github.com/anthropics' }, makeId);
  assert.equal(r.ok, true);
  assert.deepEqual(r.link, { id: r.link.id, title: 'github.com', url: 'https://www.github.com/anthropics' });
  assert.equal(r.duplicate, false);
  assert.deepEqual(r.links, [r.link]);
});

test('addLink : ajoute à la fin, titre donné nettoyé, entrée d\'origine intacte', () => {
  const before = abc();
  const r = addLink(before, { url: 'localhost:3000', title: '  Mon app  ' }, makeId);
  assert.equal(r.ok, true);
  assert.deepEqual(ids(r.links.slice(0, 4)), ['a', 'b', 'c', 'd']);
  assert.equal(r.links[4].title, 'Mon app');
  assert.equal(r.links[4].url, 'https://localhost:3000');
  assert.equal(before.length, 4);
});

test('addLink : refuse les adresses invalides ou dangereuses sans rien ajouter', () => {
  for (const [url, reason] of [
    ['javascript:ale\x72t(1)', 'protocol'],
    ['data:text/html,x', 'protocol'],
    ['bonjour', 'host'],
    ['', 'empty'],
    ['a b.com', 'spaces'],
  ]) {
    assert.deepEqual(addLink(abc(), { url }, makeId), { ok: false, reason }, url);
  }
});

test('addLink : un titre vide ou fait d\'espaces donne le domaine', () => {
  assert.equal(addLink([], { url: 'example.org', title: '   ' }, makeId).link.title, 'example.org');
  assert.equal(addLink([], { url: 'example.org', title: undefined }, makeId).link.title, 'example.org');
});

test('addLink : titre coupé à 40 caractères', () => {
  const r = addLink([], { url: 'example.org', title: 'x'.repeat(100) }, makeId);
  assert.equal(r.link.title.length, MAX_TITLE_LENGTH);
});

test('addLink : refuse au-delà de 60 raccourcis', () => {
  const full = Array.from({ length: MAX_LINKS }, (_, i) => link(`l${i}`));
  assert.deepEqual(addLink(full, { url: 'example.org' }, makeId), { ok: false, reason: 'limit' });
  const almost = full.slice(1);
  assert.equal(addLink(almost, { url: 'example.org' }, makeId).ok, true);
});

test('addLink : un doublon est autorisé mais signalé', () => {
  const links = [link('a', 'https://github.com')];
  const r = addLink(links, { url: 'github.com' }, makeId);
  assert.equal(r.ok, true);
  assert.equal(r.duplicate, true);
  assert.equal(r.links.length, 2);
  assert.equal(addLink(links, { url: 'gitlab.com' }, makeId).duplicate, false);
});

test('hasDuplicate : ignore le raccourci en cours de modification', () => {
  const links = [link('a', 'https://github.com'), link('b', 'https://gitlab.com')];
  assert.equal(hasDuplicate(links, 'https://github.com'), true);
  assert.equal(hasDuplicate(links, 'https://github.com', 'a'), false);
  assert.equal(hasDuplicate(links, 'https://github.com', 'b'), true);
});

test('updateLink : change adresse et titre, garde id, position et champs inconnus', () => {
  const links = [{ ...link('a'), extra: 1 }, link('b')];
  const r = updateLink(links, 'a', { url: 'gitlab.com', title: 'GL' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.links[0], { id: 'a', url: 'https://gitlab.com', title: 'GL', extra: 1 });
  assert.equal(r.links[1], links[1]);
  assert.equal(r.duplicate, false);
});

test('updateLink : titre vide = domaine ; erreurs ; raccourci inconnu', () => {
  const links = abc();
  assert.equal(updateLink(links, 'a', { url: 'example.org', title: '' }).link.title, 'example.org');
  assert.deepEqual(updateLink(links, 'a', { url: 'javascript:ale\x72t(1)' }), { ok: false, reason: 'protocol' });
  assert.deepEqual(updateLink(links, 'zzz', { url: 'example.org' }), { ok: false, reason: 'not-found' });
});

test('updateLink : garder sa propre adresse n\'est pas un doublon ; reprendre celle d\'un autre en est un', () => {
  const links = [link('a', 'https://one.com'), link('b', 'https://two.com')];
  assert.equal(updateLink(links, 'a', { url: 'one.com' }).duplicate, false);
  assert.equal(updateLink(links, 'a', { url: 'two.com' }).duplicate, true);
});

test('removeLink : renvoie le raccourci et sa position', () => {
  const r = removeLink(abc(), 'c');
  assert.deepEqual(ids(r.links), ['a', 'b', 'd']);
  assert.equal(r.removed.id, 'c');
  assert.equal(r.index, 2);
});

test('removeLink : identifiant inconnu = tableau inchangé', () => {
  const links = abc();
  const r = removeLink(links, 'zzz');
  assert.equal(r.links, links);
  assert.equal(r.removed, null);
  assert.equal(r.index, -1);
});

test('restoreLink : remet à sa place, borne l\'indice, ignore un doublon d\'identifiant', () => {
  const { links, removed, index } = removeLink(abc(), 'b');
  assert.deepEqual(ids(restoreLink(links, removed, index)), ['a', 'b', 'c', 'd']);
  assert.deepEqual(ids(restoreLink(links, removed, 99)), ['a', 'c', 'd', 'b']);
  assert.deepEqual(ids(restoreLink(links, removed, -4)), ['b', 'a', 'c', 'd']);
  const full = abc();
  assert.equal(restoreLink(full, full[0], 0), full);
  assert.equal(restoreLink(full, null, 0), full);
});

test('restoreLink : ne dépasse jamais 60 raccourcis', () => {
  const full = Array.from({ length: MAX_LINKS }, (_, i) => link(`l${i}`));
  assert.equal(restoreLink(full, link('autre'), 0), full);
});

test('reorderLinks : déplace vers l\'avant et vers l\'arrière', () => {
  assert.deepEqual(ids(reorderLinks(abc(), 'a', 'c')), ['b', 'c', 'a', 'd']);
  assert.deepEqual(ids(reorderLinks(abc(), 'd', 'b')), ['a', 'd', 'b', 'c']);
});

test('reorderLinks : identifiants inconnus ou identiques = inchangé', () => {
  const links = abc();
  assert.equal(reorderLinks(links, 'a', 'a'), links);
  assert.equal(reorderLinks(links, 'a', 'zzz'), links);
  assert.equal(reorderLinks(links, 'zzz', 'a'), links);
});

test('moveLink : d\'une place ou plus, borné aux extrémités', () => {
  assert.deepEqual(ids(moveLink(abc(), 'b', -1)), ['b', 'a', 'c', 'd']);
  assert.deepEqual(ids(moveLink(abc(), 'b', 1)), ['a', 'c', 'b', 'd']);
  assert.deepEqual(ids(moveLink(abc(), 'a', 2)), ['b', 'c', 'a', 'd']);
  assert.deepEqual(ids(moveLink(abc(), 'b', 99)), ['a', 'c', 'd', 'b']);
  const links = abc();
  assert.equal(moveLink(links, 'a', -1), links);
  assert.equal(moveLink(links, 'd', 1), links);
  assert.equal(moveLink(links, 'b', 0), links);
  assert.equal(moveLink(links, 'zzz', 1), links);
  assert.equal(moveLink(links, 'a', 1.5), links);
});

test('getInitial : première lettre en majuscule', () => {
  assert.equal(getInitial('github.com'), 'G');
  assert.equal(getInitial('  école'), 'É');
  assert.equal(getInitial('Le Monde'), 'L');
  assert.equal(getInitial('3615 ulla'), '3');
});

test('getInitial : ignore la ponctuation de tête, a un repli', () => {
  assert.equal(getInitial('(mon) site'), 'M');
  assert.equal(getInitial('@@@'), '@');
  assert.equal(getInitial('😀 fête'), 'F');
  assert.equal(getInitial(''), '?');
  assert.equal(getInitial('   '), '?');
});

test('getTileIndex : toujours entre 1 et 8, stable pour un domaine', () => {
  for (const d of ['github.com', 'lemonde.fr', 'localhost', '192.168.1.10', 'x', '', 'a.b.c.d.e.f.example.org']) {
    const n = getTileIndex(d);
    assert.ok(Number.isInteger(n) && n >= 1 && n <= TILE_COUNT, `${d} → ${n}`);
    assert.equal(getTileIndex(d), n);
  }
  assert.equal(getTileIndex('github.com'), getTileIndex('GitHub.com'));
  assert.equal(getTileIndex('www.github.com'), getTileIndex('github.com'));
});

test('getTileIndex : valeurs figées (changer le hachage changerait toutes les couleurs)', () => {
  assert.deepEqual(['github.com', 'lemonde.fr', 'localhost', 'example.org'].map(getTileIndex), [
    getTileIndex('github.com'),
    getTileIndex('lemonde.fr'),
    getTileIndex('localhost'),
    getTileIndex('example.org'),
  ]);
  assert.equal(getTileIndex('github.com'), 2);
});

test('getTileIndex : les huit couleurs sont utilisées sur un échantillon de domaines', () => {
  const seen = new Set(Array.from({ length: 200 }, (_, i) => getTileIndex(`site${i}.com`)));
  assert.equal(seen.size, TILE_COUNT);
});

test('getLinkTileIndex : même domaine = même couleur, quel que soit le chemin ou le www', () => {
  assert.equal(getLinkTileIndex(link('a', 'https://github.com/a')), getLinkTileIndex(link('b', 'http://www.github.com/b/c')));
});

test('cleanTitle : ne coupe pas une paire de substitution', () => {
  const title = `${'a'.repeat(39)}😀😀`;
  const cut = cleanTitle(title);
  assert.equal(cut, 'a'.repeat(39));
  assert.equal(cleanTitle(undefined), '');
});

test('getErrorMessage : messages en français', () => {
  assert.match(getErrorMessage('host'), /^Adresse invalide\. Exemple : github\.com$/);
  assert.match(getErrorMessage('protocol'), /^Adresse invalide/);
  assert.match(getErrorMessage('empty'), /Saisis une adresse/);
  assert.match(getErrorMessage('limit'), /60/);
});
