import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EMPTY_TITLE,
  MAX_CONTENT_LENGTH,
  createNote,
  deleteNote,
  deriveTitle,
  formatModified,
  getActiveNote,
  getDisplayTitle,
  nextTabIndex,
  renameNote,
  restoreNote,
  shouldShowCounter,
  updateContent,
} from './notesLogic.js';

let n = 0;
const nextId = () => `id-${++n}`;
const note = (id, content = '', title = null, updatedAt = 1) => ({ id, title, content, format: 'text', updatedAt });
const ids = (notes) => notes.map((x) => x.id).join(',');
const abc = () => [note('a', 'Alpha'), note('b', 'Bravo'), note('c', 'Charlie')];

test('deriveTitle : première ligne non vide, coupée à 40 caractères', () => {
  assert.equal(deriveTitle('Courses\nlait\npain'), 'Courses');
  assert.equal(deriveTitle('\n\n   \n  Idées de projet  \nsuite'), 'Idées de projet');
  assert.equal(deriveTitle('x'.repeat(100)), 'x'.repeat(40));
  assert.equal(deriveTitle('a'.repeat(39) + ' bcdef'), 'a'.repeat(39), 'pas d\'espace en fin après la coupure');
  assert.equal(deriveTitle('a'.repeat(39) + '😀'), 'a'.repeat(39), 'une paire de substitution n\'est jamais coupée en deux');
  assert.equal(deriveTitle('première\r\nseconde'), 'première');
});

test('deriveTitle : contenu vide', () => {
  assert.equal(deriveTitle(''), EMPTY_TITLE);
  assert.equal(deriveTitle('   \n\t\n'), 'Note sans titre');
  assert.equal(deriveTitle(undefined), 'Note sans titre');
});

test('getDisplayTitle : le titre choisi, sinon le titre déduit', () => {
  assert.equal(getDisplayTitle(note('a', 'Contenu', 'Mon titre')), 'Mon titre');
  assert.equal(getDisplayTitle(note('a', 'Contenu\nsuite', null)), 'Contenu');
  assert.equal(getDisplayTitle(note('a', '', null)), 'Note sans titre');
  assert.equal(getDisplayTitle(note('a', 'Contenu', '   ')), 'Contenu', 'un titre d\'espaces compte pour vide');
});

test('createNote : ajoute une note vide à la fin et la rend active', () => {
  const start = abc();
  const result = createNote(start, 1234, nextId);
  assert.equal(result.notes.length, 4);
  assert.equal(result.activeId, result.notes[3].id);
  assert.deepEqual({ ...result.notes[3], id: 'x' }, { id: 'x', title: null, content: '', format: 'text', updatedAt: 1234 });
  assert.equal(start.length, 3, 'le tableau d\'origine n\'est pas modifié');
  assert.deepEqual(createNote([], 1, nextId).notes.length, 1);
});

test('createNote : identifiants distincts, au format UUID par défaut', () => {
  const one = createNote([], 1);
  const two = createNote(one.notes, 1);
  assert.notEqual(two.notes[0].id, two.notes[1].id);
  assert.match(one.activeId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('updateContent : remplace le contenu et date la modification', () => {
  const next = updateContent(abc(), 'b', 'Nouveau', 999);
  assert.equal(next[1].content, 'Nouveau');
  assert.equal(next[1].updatedAt, 999);
  assert.equal(next[0].updatedAt, 1, 'les autres notes ne changent pas');
});

test('updateContent : coupé à 50 000 caractères', () => {
  const next = updateContent(abc(), 'a', 'x'.repeat(MAX_CONTENT_LENGTH + 500), 5);
  assert.equal(next[0].content.length, MAX_CONTENT_LENGTH);
  const emoji = updateContent(abc(), 'a', 'x'.repeat(MAX_CONTENT_LENGTH - 1) + '😀', 5);
  assert.equal(emoji[0].content.length, MAX_CONTENT_LENGTH - 1, 'paire de substitution jamais coupée');
});

test('updateContent : contenu identique ou note inconnue, tableau rendu tel quel', () => {
  const notes = abc();
  assert.equal(updateContent(notes, 'a', 'Alpha', 9), notes);
  assert.equal(updateContent(notes, 'zzz', 'x', 9), notes);
});

test('updateContent : le texte est conservé tel quel (sauts de ligne, espaces, HTML)', () => {
  const text = '  <b>gras</b>\n\n\tligne indentée  \n';
  assert.equal(updateContent(abc(), 'a', text, 2)[0].content, text);
});

test('renameNote : titre choisi, nettoyé ; vide = retour au titre déduit', () => {
  const renamed = renameNote(abc(), 'a', '  Mon titre  ');
  assert.equal(renamed[0].title, 'Mon titre');
  assert.equal(getDisplayTitle(renamed[0]), 'Mon titre');
  const back = renameNote(renamed, 'a', '   ');
  assert.equal(back[0].title, null);
  assert.equal(getDisplayTitle(back[0]), 'Alpha');
  assert.equal(renameNote(abc(), 'a', 'x'.repeat(200))[0].title.length, 60);
});

test('renameNote : sans effet si rien ne change', () => {
  const notes = abc();
  assert.equal(renameNote(notes, 'a', ''), notes, 'déjà sans titre propre');
  assert.equal(renameNote(notes, 'zzz', 'x'), notes);
  const named = renameNote(notes, 'a', 'T');
  assert.equal(renameNote(named, 'a', ' T '), named);
});

test('deleteNote : la note active devient la suivante, sinon la précédente', () => {
  const middle = deleteNote(abc(), 'b', 'b');
  assert.equal(ids(middle.notes), 'a,c');
  assert.equal(middle.activeId, 'c');
  assert.equal(middle.removed.id, 'b');
  assert.equal(middle.index, 1);
  const last = deleteNote(abc(), 'c', 'c');
  assert.equal(last.activeId, 'b');
  const first = deleteNote(abc(), 'a', 'a');
  assert.equal(first.activeId, 'b');
});

test('deleteNote : supprimer une autre note garde la note active ; dernière note → null', () => {
  const other = deleteNote(abc(), 'a', 'c');
  assert.equal(other.activeId, 'a');
  assert.equal(ids(other.notes), 'a,b');
  const only = deleteNote([note('a')], 'a', 'a');
  assert.deepEqual([only.notes.length, only.activeId], [0, null]);
});

test('deleteNote : activeId incohérent corrigé ; identifiant inconnu sans effet', () => {
  assert.equal(deleteNote(abc(), 'fantôme', 'a').activeId, 'b');
  const notes = abc();
  const none = deleteNote(notes, 'a', 'zzz');
  assert.deepEqual([none.notes === notes, none.activeId, none.removed, none.index], [true, 'a', null, -1]);
});

test('restoreNote : la note revient à sa place ; index borné ; jamais de doublon', () => {
  const { notes, removed, index } = deleteNote(abc(), 'b', 'b');
  assert.equal(ids(restoreNote(notes, removed, index)), 'a,b,c');
  assert.equal(ids(restoreNote([note('a')], note('z'), 99)), 'a,z');
  assert.equal(ids(restoreNote([note('a')], note('z'), -3)), 'z,a');
  const same = [note('a')];
  assert.equal(restoreNote(same, note('a'), 0), same);
  assert.equal(restoreNote(same, null, 0), same);
});

test('getActiveNote : la note active, sinon la première, sinon null', () => {
  assert.equal(getActiveNote({ activeId: 'b', notes: abc() }).id, 'b');
  assert.equal(getActiveNote({ activeId: 'fantôme', notes: abc() }).id, 'a');
  assert.equal(getActiveNote({ activeId: null, notes: abc() }).id, 'a');
  assert.equal(getActiveNote({ activeId: null, notes: [] }), null);
});

test('nextTabIndex : flèches (avec retour au bout), Début, Fin', () => {
  assert.equal(nextTabIndex('ArrowRight', 0, 3), 1);
  assert.equal(nextTabIndex('ArrowRight', 2, 3), 0);
  assert.equal(nextTabIndex('ArrowLeft', 0, 3), 2);
  assert.equal(nextTabIndex('ArrowLeft', 2, 3), 1);
  assert.equal(nextTabIndex('Home', 2, 3), 0);
  assert.equal(nextTabIndex('End', 0, 3), 2);
  assert.equal(nextTabIndex('a', 0, 3), -1);
  assert.equal(nextTabIndex('ArrowRight', 0, 0), -1);
});

test('shouldShowCounter : à partir de 90 % de la limite', () => {
  assert.equal(shouldShowCounter(0), false);
  assert.equal(shouldShowCounter(44_999), false);
  assert.equal(shouldShowCounter(45_000), true);
  assert.equal(shouldShowCounter(50_000), true);
});

test('formatModified : « Modifiée à HH:MM »', () => {
  assert.equal(formatModified(Date.UTC(2026, 9, 26, 13, 32), 'Europe/Paris'), 'Modifiée à 14:32');
  assert.equal(formatModified(Date.UTC(2026, 9, 26, 22, 5), 'UTC'), 'Modifiée à 22:05');
  assert.equal(formatModified(Date.UTC(2026, 9, 26, 0, 5), 'UTC'), 'Modifiée à 00:05');
});
