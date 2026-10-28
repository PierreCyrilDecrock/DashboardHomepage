import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_PRESETS,
  MAX_PRESETS,
  addPreset,
  formatFinishedAt,
  formatPresetLabel,
  isPresetSelected,
  parsePresetMinutes,
  permissionHelp,
  permissionLabel,
  progressRatio,
  removePreset,
  timeEmWidth,
  updatePreset,
} from './timerLogic.js';

test('parsePresetMinutes : entiers de 1 à 600', () => {
  assert.equal(parsePresetMinutes('5'), 5);
  assert.equal(parsePresetMinutes(' 45 '), 45);
  assert.equal(parsePresetMinutes(600), 600);
  assert.equal(parsePresetMinutes('1'), 1);
  for (const bad of ['0', '601', '-1', '2.5', '', ' ', 'abc', '5 min', '1e2', null, undefined, '00000']) assert.equal(parsePresetMinutes(bad), null, String(bad));
});

test('updatePreset : remplace une valeur valide, ignore le reste', () => {
  const presets = [1, 5, 10, 15];
  assert.deepEqual(updatePreset(presets, 1, '7'), [1, 7, 10, 15]);
  assert.equal(updatePreset(presets, 1, '5'), presets, 'inchangé : même tableau');
  assert.equal(updatePreset(presets, 1, '0'), presets);
  assert.equal(updatePreset(presets, 9, '7'), presets);
  assert.equal(updatePreset(presets, -1, '7'), presets);
  assert.deepEqual(presets, [1, 5, 10, 15], 'l\'original n\'est jamais modifié');
});

test('addPreset : au plus 4 durées, une valeur nouvelle', () => {
  assert.deepEqual(addPreset([1, 5]), [1, 5, 30]);
  assert.deepEqual(addPreset([30]), [30, 20]);
  const full = [1, 5, 10, 15];
  assert.equal(addPreset(full), full);
  assert.equal(MAX_PRESETS, 4);
  assert.ok(!addPreset([1, 5, 30]).slice(0, 3).includes(addPreset([1, 5, 30])[3]));
});

test('removePreset : on en garde toujours au moins une', () => {
  assert.deepEqual(removePreset([1, 5, 10], 1), [1, 10]);
  const one = [5];
  assert.equal(removePreset(one, 0), one);
  const two = [1, 5];
  assert.equal(removePreset(two, 5), two);
});

test('les durées par défaut sont 1, 5, 10 et 15 minutes', () => {
  assert.deepEqual(DEFAULT_PRESETS, [1, 5, 10, 15]);
});

test('formatPresetLabel : minutes, heures', () => {
  assert.equal(formatPresetLabel(1), '1 min');
  assert.equal(formatPresetLabel(59), '59 min');
  assert.equal(formatPresetLabel(60), '1 h');
  assert.equal(formatPresetLabel(90), '1 h 30');
  assert.equal(formatPresetLabel(125), '2 h 05');
  assert.equal(formatPresetLabel(600), '10 h');
});

test('isPresetSelected : compare la durée choisie en millisecondes', () => {
  assert.equal(isPresetSelected(300_000, 5), true);
  assert.equal(isPresetSelected(300_000, 10), false);
  assert.equal(isPresetSelected(330_000, 5), false);
});

test('formatFinishedAt : HH:MM sur 24 h, dans le fuseau demandé', () => {
  const t = Date.UTC(2026, 9, 26, 13, 32, 59); // 14:32 à Paris (heure d'été terminée le 25 oct. : UTC+1)
  assert.equal(formatFinishedAt(t, 'Europe/Paris'), '14:32');
  assert.equal(formatFinishedAt(t, 'UTC'), '13:32');
  assert.equal(formatFinishedAt(Date.UTC(2026, 0, 5, 0, 5), 'UTC'), '00:05', 'minuit : 00, pas 24');
  assert.equal(formatFinishedAt(Date.UTC(2026, 0, 5, 9, 5), 'UTC'), '09:05');
});

test('timeEmWidth : largeur du texte en em', () => {
  assert.equal(timeEmWidth('05:00'), 3.15);
  assert.equal(timeEmWidth('1:00:00'), 4.41);
});

test('progressRatio', () => {
  assert.equal(progressRatio('idle', 60_000, 60_000), 0);
  assert.equal(progressRatio('running', 45_000, 60_000), 0.25);
  assert.equal(progressRatio('paused', 30_000, 60_000), 0.5);
  assert.equal(progressRatio('done', 0, 60_000), 1);
  assert.equal(progressRatio('running', 99_000, 60_000), 0);
  assert.equal(progressRatio('running', -5, 60_000), 1);
});

test('permissionLabel et permissionHelp : un texte pour chaque état', () => {
  assert.equal(permissionLabel('granted'), 'autorisées');
  assert.equal(permissionLabel('denied'), 'refusées');
  assert.equal(permissionLabel('default'), 'non demandées');
  assert.equal(permissionLabel('unsupported'), 'non disponibles ici');
  assert.match(permissionHelp('denied'), /cadenas/);
  assert.match(permissionHelp('denied'), /recharge/);
  assert.match(permissionHelp('unsupported'), /Terminé à/);
  assert.match(permissionHelp('default'), /bouton/);
  for (const state of ['granted', 'denied', 'default', 'unsupported']) assert.ok(permissionHelp(state).length > 20);
});
