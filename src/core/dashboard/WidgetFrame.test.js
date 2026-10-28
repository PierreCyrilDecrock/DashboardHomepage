import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describePlacement } from './WidgetFrame.js';

test('describePlacement : colonne et ligne comptées depuis 1, taille en colonnes et lignes', () => {
  assert.equal(describePlacement('Todo', { x: 2, y: 0, w: 4, h: 2 }), 'Todo : colonne 3, ligne 1, 4 colonnes sur 2 lignes');
});

test('describePlacement : singulier pour une colonne ou une ligne', () => {
  assert.equal(describePlacement('Horloge', { x: 0, y: 4, w: 1, h: 1 }), 'Horloge : colonne 1, ligne 5, 1 colonne sur 1 ligne');
});

test('describePlacement : sans position (affichage une colonne), phrase explicite', () => {
  assert.match(describePlacement('Todo', null), /^Todo : la disposition ne peut pas être modifiée/);
});
