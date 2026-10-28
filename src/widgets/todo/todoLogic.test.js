import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addTask,
  cleanText,
  clearDone,
  editTask,
  getStats,
  getVisibleTasks,
  moveTask,
  removeTask,
  reorderTasks,
  restoreTask,
  toggleTask,
} from './todoLogic.js';

let n = 0;
const nextId = () => `id-${++n}`;
const task = (id, text = id, done = false) => ({ id, text, done, createdAt: 1, doneAt: done ? 2 : null });
const ids = (tasks) => tasks.map((t) => t.id).join(',');
const abc = () => [task('a'), task('b'), task('c')];

test('cleanText : espaces retirés, vide refusé, coupure à 200 caractères', () => {
  assert.equal(cleanText('  Acheter du pain \n'), 'Acheter du pain');
  assert.equal(cleanText('   '), '');
  assert.equal(cleanText(undefined), '');
  assert.equal(cleanText('x'.repeat(250)).length, 200);
  assert.equal(cleanText('x'.repeat(199) + '😀').length, 199, 'une paire de substitution n\'est jamais coupée en deux');
  assert.equal(cleanText('a'.repeat(199) + ' bcd'), 'a'.repeat(199), 'pas d\'espace en fin après la coupure');
});

test('addTask : ajoute à la fin, texte nettoyé, horodaté', () => {
  const start = abc();
  const result = addTask(start, '  Nouvelle  ', 1234, nextId);
  assert.equal(result.tasks.length, 4);
  assert.equal(result.tasks[3], result.task);
  assert.deepEqual({ ...result.task, id: 'x' }, { id: 'x', text: 'Nouvelle', done: false, createdAt: 1234, doneAt: null });
  assert.equal(start.length, 3, 'le tableau d\'origine n\'est pas modifié');
});

test('addTask : texte vide refusé, texte long coupé, identifiants distincts', () => {
  assert.equal(addTask(abc(), '   ', 1), null);
  assert.equal(addTask(abc(), '', 1), null);
  assert.equal(addTask([], 'y'.repeat(500), 1).task.text.length, 200);
  const one = addTask([], 'a', 1);
  const two = addTask(one.tasks, 'a', 1);
  assert.notEqual(two.tasks[0].id, two.tasks[1].id);
  assert.match(one.task.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('toggleTask : bascule done et renseigne puis efface doneAt', () => {
  const done = toggleTask(abc(), 'b', 500);
  assert.deepEqual([done[1].done, done[1].doneAt], [true, 500]);
  assert.equal(done[0].done, false);
  const reopened = toggleTask(done, 'b', 900);
  assert.deepEqual([reopened[1].done, reopened[1].doneAt], [false, null]);
});

test('toggleTask : identifiant inconnu, tableau rendu tel quel', () => {
  const tasks = abc();
  assert.equal(toggleTask(tasks, 'zzz', 1), tasks);
});

test('editTask : mêmes règles que l\'ajout', () => {
  const tasks = abc();
  assert.equal(editTask(tasks, 'b', '  Nouveau texte ')[1].text, 'Nouveau texte');
  assert.equal(editTask(tasks, 'b', 'z'.repeat(300))[1].text.length, 200);
  assert.equal(editTask(tasks, 'b', '   '), tasks, 'un texte vide laisse la tâche inchangée');
  assert.equal(editTask(tasks, 'zzz', 'x'), tasks);
  assert.equal(editTask(tasks, 'b', 'b'), tasks, 'texte identique : rien ne change');
  const edited = editTask([task('a', 'avant', true)], 'a', 'après');
  assert.deepEqual([edited[0].done, edited[0].doneAt], [true, 2], 'l\'état et les autres champs sont conservés');
});

test('removeTask / restoreTask : la tâche revient à sa place', () => {
  const tasks = abc();
  const { tasks: without, removed, index } = removeTask(tasks, 'b');
  assert.equal(ids(without), 'a,c');
  assert.equal(removed.id, 'b');
  assert.equal(index, 1);
  assert.equal(ids(restoreTask(without, removed, index)), 'a,b,c');
  assert.equal(ids(tasks), 'a,b,c', 'le tableau d\'origine n\'est pas modifié');
});

test('removeTask : première, dernière et inconnue', () => {
  assert.equal(ids(restoreTask(removeTask(abc(), 'a').tasks, task('a'), 0)), 'a,b,c');
  const last = removeTask(abc(), 'c');
  assert.equal(ids(restoreTask(last.tasks, last.removed, last.index)), 'a,b,c');
  const none = removeTask(abc(), 'zzz');
  assert.deepEqual([none.removed, none.index], [null, -1]);
});

test('restoreTask : index borné, jamais de doublon, rien sans tâche', () => {
  const tasks = [task('a')];
  assert.equal(ids(restoreTask(tasks, task('z'), 99)), 'a,z');
  assert.equal(ids(restoreTask(tasks, task('z'), -5)), 'z,a');
  assert.equal(restoreTask(tasks, task('a'), 0), tasks);
  assert.equal(restoreTask(tasks, null, 0), tasks);
  assert.equal(ids(restoreTask(tasks, task('z'), Number.NaN)), 'a,z');
});

test('reorderTasks : déplace vers le haut et vers le bas', () => {
  assert.equal(ids(reorderTasks(abc(), 'a', 'c')), 'b,c,a');
  assert.equal(ids(reorderTasks(abc(), 'c', 'a')), 'c,a,b');
  assert.equal(ids(reorderTasks(abc(), 'a', 'b')), 'b,a,c');
});

test('reorderTasks : cas sans effet', () => {
  const tasks = abc();
  assert.equal(reorderTasks(tasks, 'a', 'a'), tasks);
  assert.equal(reorderTasks(tasks, 'a', 'zzz'), tasks);
  assert.equal(reorderTasks(tasks, 'zzz', 'a'), tasks);
});

test('reorderTasks avec doneLast : pas de déplacement entre groupes', () => {
  const tasks = [task('a'), task('b', 'b', true), task('c'), task('d', 'd', true)];
  assert.equal(reorderTasks(tasks, 'a', 'b', { doneLast: true }), tasks);
  assert.equal(ids(reorderTasks(tasks, 'a', 'c', { doneLast: true })), 'b,c,a,d');
  assert.equal(ids(reorderTasks(tasks, 'b', 'd', { doneLast: true })), 'a,c,d,b');
});

test('moveTask : d\'une position, borné', () => {
  assert.equal(ids(moveTask(abc(), 'b', -1)), 'b,a,c');
  assert.equal(ids(moveTask(abc(), 'b', 1)), 'a,c,b');
  const tasks = abc();
  assert.equal(moveTask(tasks, 'a', -1), tasks, 'borné en haut');
  assert.equal(moveTask(tasks, 'c', 1), tasks, 'borné en bas');
  assert.equal(moveTask(tasks, 'zzz', 1), tasks);
  assert.equal(moveTask(tasks, 'a', 0), tasks);
  assert.equal(ids(moveTask(abc(), 'a', 5)), 'b,c,a', 'un grand delta reste dans les bornes');
});

test('moveTask avec doneLast : se déplace parmi les voisins visibles du même groupe', () => {
  const tasks = [task('a'), task('x', 'x', true), task('b'), task('y', 'y', true)];
  // Visibles : a, b, x, y. « b » monte au-dessus de « a » (même groupe), sans tenir compte de « x ».
  const visible = (list) => ids(getVisibleTasks(list, 'all', true));
  assert.equal(visible(moveTask(tasks, 'b', -1, { doneLast: true })), 'b,a,x,y');
  assert.equal(visible(moveTask(tasks, 'a', 1, { doneLast: true })), 'b,a,x,y');
  assert.equal(visible(moveTask(tasks, 'x', 1, { doneLast: true })), 'a,b,y,x');
  assert.equal(moveTask(tasks, 'a', -1, { doneLast: true }), tasks, 'déjà en tête de son groupe');
  assert.equal(moveTask(tasks, 'y', 1, { doneLast: true }), tasks, 'déjà en fin de son groupe');
});

test('clearDone : retire les terminées, sans toucher au reste', () => {
  const tasks = [task('a'), task('b', 'b', true), task('c', 'c', true), task('d')];
  assert.equal(ids(clearDone(tasks)), 'a,d');
  const none = abc();
  assert.equal(clearDone(none), none);
  assert.deepEqual(clearDone([]), []);
});

test('getVisibleTasks : filtres et terminées en bas', () => {
  const tasks = [task('a', 'a', true), task('b'), task('c', 'c', true), task('d')];
  assert.equal(ids(getVisibleTasks(tasks, 'all', false)), 'a,b,c,d');
  assert.equal(ids(getVisibleTasks(tasks, 'all', true)), 'b,d,a,c');
  assert.equal(ids(getVisibleTasks(tasks, 'todo', true)), 'b,d');
  assert.equal(ids(getVisibleTasks(tasks, 'done', true)), 'a,c');
  assert.equal(ids(getVisibleTasks(tasks, 'done', false)), 'a,c');
  assert.deepEqual(getVisibleTasks([], 'all', true), []);
  assert.equal(ids(tasks.map((t) => t)), 'a,b,c,d', 'le tableau d\'origine n\'est pas réordonné');
});

test('getStats', () => {
  assert.deepEqual(getStats([]), { done: 0, total: 0, ratio: 0 });
  assert.deepEqual(getStats([task('a', 'a', true), task('b'), task('c', 'c', true), task('d')]), { done: 2, total: 4, ratio: 0.5 });
  assert.deepEqual(getStats([task('a', 'a', true)]), { done: 1, total: 1, ratio: 1 });
});
