import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GRID_COLUMNS, fromGridNodes, moveBy, resizeBy, toGridItems } from './layoutUtils.js';

const inst = (id, type, layout) => ({ id, type, layout, settings: {}, version: 1 });
const defs = { todo: { minSize: { w: 3, h: 2 } }, clock: { minSize: { w: 2, h: 1 } } };
const getDefinition = (type) => defs[type];

test('toGridItems : id, position, taille et minimum de la définition', () => {
  const items = toGridItems([inst('a', 'todo', { x: 4, y: 2, w: 5, h: 3 })], getDefinition);
  assert.deepEqual(items, [{ id: 'a', x: 4, y: 2, w: 5, h: 3, minW: 3, minH: 2 }]);
});

test('toGridItems : type inconnu → minimum 2×2', () => {
  const [item] = toGridItems([inst('a', 'inconnu', { x: 0, y: 0, w: 1, h: 1 })], getDefinition);
  assert.deepEqual([item.minW, item.minH, item.w, item.h], [2, 2, 2, 2]);
});

test('toGridItems : une taille enregistrée sous le minimum est relevée', () => {
  const [item] = toGridItems([inst('a', 'todo', { x: 0, y: 0, w: 1, h: 1 })], getDefinition);
  assert.deepEqual([item.w, item.h], [3, 2]);
});

test('toGridItems : reste dans les 12 colonnes (largeur trop grande, x trop à droite)', () => {
  const [wide] = toGridItems([inst('a', 'todo', { x: 0, y: 0, w: 30, h: 2 })], getDefinition);
  assert.equal(wide.w, GRID_COLUMNS);
  const [right] = toGridItems([inst('a', 'todo', { x: 11, y: 0, w: 4, h: 2 })], getDefinition);
  assert.equal(right.x + right.w, GRID_COLUMNS);
  const [one] = toGridItems([inst('a', 'todo', { x: 5, y: 0, w: 4, h: 2 })], getDefinition, 1);
  assert.deepEqual([one.x, one.w, one.minW], [0, 1, 1]);
});

test('toGridItems : conserve l\'ordre, accepte une liste vide, garde la position très basse', () => {
  assert.deepEqual(toGridItems([], getDefinition), []);
  const items = toGridItems([inst('b', 'clock', { x: 0, y: 1000, w: 2, h: 1 }), inst('a', 'clock', { x: 2, y: 0, w: 2, h: 1 })], getDefinition);
  assert.deepEqual(items.map((i) => i.id), ['b', 'a']);
  assert.equal(items[0].y, 1000);
});

test('fromGridNodes : id → { x, y, w, h }, les champs en plus sont ignorés', () => {
  const layout = fromGridNodes([
    { id: 'a', x: 1, y: 2, w: 3, h: 4, el: {}, minW: 2 },
    { id: 'b', x: 0, y: 0, w: 2, h: 2 },
  ]);
  assert.deepEqual(layout, { a: { x: 1, y: 2, w: 3, h: 4 }, b: { x: 0, y: 0, w: 2, h: 2 } });
});

test('fromGridNodes : ignore les nœuds sans identifiant ou à position invalide', () => {
  const layout = fromGridNodes([
    { x: 0, y: 0, w: 1, h: 1 },
    { id: '', x: 0, y: 0, w: 1, h: 1 },
    { id: 3, x: 0, y: 0, w: 1, h: 1 },
    { id: 'frac', x: 0.5, y: 0, w: 1, h: 1 },
    { id: 'nul', x: null, y: 0, w: 1, h: 1 },
    { id: 'ok', x: 0, y: 0, w: 1, h: 1 },
  ]);
  assert.deepEqual(Object.keys(layout), ['ok']);
  assert.deepEqual(fromGridNodes([]), {});
});

const layout = { a: { x: 2, y: 1, w: 4, h: 3 } };

test('moveBy : déplace d\'une case', () => {
  assert.deepEqual(moveBy(layout, 'a', 1, 0), { x: 3, y: 1, w: 4, h: 3 });
  assert.deepEqual(moveBy(layout, 'a', 0, -1), { x: 2, y: 0, w: 4, h: 3 });
  assert.deepEqual(moveBy(layout, 'a', -1, 1), { x: 1, y: 2, w: 4, h: 3 });
});

test('moveBy : borné à gauche, à droite (x + w ≤ cols) et en haut ; vers le bas sans limite', () => {
  assert.equal(moveBy(layout, 'a', -10, 0).x, 0);
  assert.equal(moveBy(layout, 'a', 10, 0).x, 8);
  assert.equal(moveBy(layout, 'a', 0, -10).y, 0);
  assert.equal(moveBy(layout, 'a', 0, 40).y, 41);
  assert.equal(moveBy(layout, 'a', 10, 0, 6).x, 2);
});

test('moveBy : instance absente → null ; la disposition d\'origine n\'est pas modifiée', () => {
  assert.equal(moveBy(layout, 'zzz', 1, 1), null);
  assert.equal(moveBy(layout, 'toString', 1, 1), null);
  moveBy(layout, 'a', 3, 3);
  assert.deepEqual(layout.a, { x: 2, y: 1, w: 4, h: 3 });
});

test('resizeBy : agrandit et réduit d\'une case', () => {
  assert.deepEqual(resizeBy(layout, 'a', 1, 1), { x: 2, y: 1, w: 5, h: 4 });
  assert.deepEqual(resizeBy(layout, 'a', -1, -1), { x: 2, y: 1, w: 3, h: 2 });
});

test('resizeBy : jamais sous la taille minimale', () => {
  const r = resizeBy(layout, 'a', -9, -9, GRID_COLUMNS, { w: 3, h: 2 });
  assert.deepEqual([r.w, r.h], [3, 2]);
  const d = resizeBy(layout, 'a', -9, -9);
  assert.deepEqual([d.w, d.h], [2, 2]);
});

test('resizeBy : ne sort pas de la grille à droite', () => {
  assert.equal(resizeBy(layout, 'a', 99, 0).w, 10);
  assert.equal(resizeBy({ a: { x: 10, y: 0, w: 2, h: 2 } }, 'a', 5, 0).w, 2);
  assert.equal(resizeBy({ a: { x: 11, y: 0, w: 1, h: 2 } }, 'a', -1, 0, 12, { w: 2, h: 2 }).w, 1);
});

test('resizeBy : hauteur sans limite haute ; instance absente → null', () => {
  assert.equal(resizeBy(layout, 'a', 0, 50).h, 53);
  assert.equal(resizeBy(layout, 'zzz', 1, 1), null);
});
