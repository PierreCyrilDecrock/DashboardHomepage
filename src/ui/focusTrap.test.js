import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextTrapIndex } from './focusTrap.js';
import { nextMenuIndex } from './menuNav.js';

test('nextTrapIndex : Tab avance et boucle, Maj + Tab recule et boucle', () => {
  assert.equal(nextTrapIndex(3, 0, false), 1);
  assert.equal(nextTrapIndex(3, 2, false), 0);
  assert.equal(nextTrapIndex(3, 0, true), 2);
  assert.equal(nextTrapIndex(3, 2, true), 1);
});

test('nextTrapIndex : focus hors de la liste → premier (Tab) ou dernier (Maj + Tab) ; liste vide → -1 ; un seul élément', () => {
  assert.equal(nextTrapIndex(3, -1, false), 0);
  assert.equal(nextTrapIndex(3, -1, true), 2);
  assert.equal(nextTrapIndex(0, -1, false), -1);
  assert.equal(nextTrapIndex(1, 0, false), 0);
  assert.equal(nextTrapIndex(1, 0, true), 0);
});

test('nextMenuIndex : flèches avec bouclage, Début et Fin', () => {
  assert.equal(nextMenuIndex('ArrowDown', -1, 4), 0);
  assert.equal(nextMenuIndex('ArrowDown', 3, 4), 0);
  assert.equal(nextMenuIndex('ArrowUp', -1, 4), 3);
  assert.equal(nextMenuIndex('ArrowUp', 0, 4), 3);
  assert.equal(nextMenuIndex('ArrowUp', 2, 4), 1);
  assert.equal(nextMenuIndex('Home', 2, 4), 0);
  assert.equal(nextMenuIndex('End', 0, 4), 3);
});

test('nextMenuIndex : touche inconnue ou menu vide → -1', () => {
  assert.equal(nextMenuIndex('a', 0, 4), -1);
  assert.equal(nextMenuIndex('ArrowDown', -1, 0), -1);
});
