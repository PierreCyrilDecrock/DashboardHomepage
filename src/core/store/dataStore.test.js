import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDataStore } from './dataStore.js';

const make = () => {
  let t = 1000;
  return createDataStore({ now: () => ++t });
};

test('setData : crée l\'entrée (version, données, date), puis la modifie', () => {
  const s = make();
  assert.equal(s.getData('a'), undefined);
  s.setData('a', { tasks: [] }, { version: 3 });
  assert.deepEqual(s.getData('a'), { version: 3, data: { tasks: [] }, updatedAt: 1001 });
  s.setData('a', (cur) => ({ tasks: [...cur.tasks, 'x'] }));
  assert.deepEqual(s.getData('a'), { version: 3, data: { tasks: ['x'] }, updatedAt: 1002 });
});

test('setData : sans version, la version 1 ; renvoyer la même référence ne change rien', () => {
  const s = make();
  s.setData('a', { n: 1 });
  assert.equal(s.getData('a').version, 1);
  let n = 0;
  s.subscribe(() => n++);
  s.setData('a', (cur) => cur);
  assert.equal(n, 0);
  assert.equal(s.getData('a').updatedAt, 1001);
});

test('deux instances du même type ont des données indépendantes', () => {
  const s = make();
  s.setData('a', { tasks: ['une'] });
  s.setData('b', { tasks: [] });
  s.setData('b', (cur) => ({ tasks: [...cur.tasks, 'deux'] }));
  assert.deepEqual(s.getData('a').data, { tasks: ['une'] });
  assert.deepEqual(s.getData('b').data, { tasks: ['deux'] });
});

test('modifier une instance ne change pas la référence de l\'entrée des autres', () => {
  const s = make();
  s.setData('a', { n: 1 });
  s.setData('b', { n: 1 });
  const a = s.getData('a');
  s.setData('b', { n: 2 });
  assert.equal(s.getData('a'), a);
});

test('removeData : retire l\'entrée et la renvoie (pour annuler) ; id inconnu : undefined, sans notification', () => {
  const s = make();
  s.setData('a', { n: 1 });
  s.setData('b', { n: 2 });
  let n = 0;
  s.subscribe(() => n++);
  const removed = s.removeData('a');
  assert.deepEqual(removed.data, { n: 1 });
  assert.equal(s.getData('a'), undefined);
  assert.deepEqual(s.getData('b').data, { n: 2 });
  assert.equal(n, 1);
  assert.equal(s.removeData('fantome'), undefined);
  assert.equal(n, 1);
});

test('cloneData : copie en profondeur ; modifier la copie ne change pas l\'original', () => {
  const s = make();
  s.setData('a', { tasks: [{ id: 1, text: 'x' }], nested: { deep: [1, 2] } }, { version: 2 });
  assert.equal(s.cloneData('a', 'b'), true);
  assert.deepEqual(s.getData('b').data, s.getData('a').data);
  assert.equal(s.getData('b').version, 2);
  assert.notEqual(s.getData('b').data, s.getData('a').data);
  assert.notEqual(s.getData('b').data.tasks, s.getData('a').data.tasks);
  s.setData('b', (cur) => ({ ...cur, tasks: [...cur.tasks, { id: 2, text: 'y' }] }));
  s.getData('b').data.nested.deep.push(3);
  assert.equal(s.getData('a').data.tasks.length, 1);
  assert.deepEqual(s.getData('a').data.nested.deep, [1, 2]);
});

test('cloneData : source sans données = faux, rien n\'est créé', () => {
  const s = make();
  assert.equal(s.cloneData('fantome', 'b'), false);
  assert.equal(s.getData('b'), undefined);
});

test('putEntry et replaceAll', () => {
  const s = make();
  s.putEntry('a', { version: 1, data: 'x', updatedAt: 5 });
  assert.deepEqual(s.getData('a'), { version: 1, data: 'x', updatedAt: 5 });
  s.replaceAll({ z: { version: 1, data: 1, updatedAt: 1 } });
  assert.equal(s.getData('a'), undefined);
  assert.deepEqual(Object.keys(s.getState().byId), ['z']);
});
