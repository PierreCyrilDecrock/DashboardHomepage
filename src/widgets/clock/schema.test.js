import assert from 'node:assert/strict';
import test from 'node:test';
import { definition } from './index.js';
import { dataSchema, defaultData, defaultSettings, settingsSchema } from './schema.js';
import { resolveTimeZone } from './ClockSettings.js';
import { getTimeZoneChoices } from './clockLogic.js';
import { timeEmWidth } from './ClockWidget.js';

test('la définition respecte le contrat', () => {
  assert.equal(definition.type, 'clock');
  assert.equal(definition.name, 'Heure');
  assert.equal(definition.category, 'temps');
  assert.equal(definition.icon, 'clock');
  assert.deepEqual(definition.defaultSize, { w: 3, h: 3 });
  assert.deepEqual(definition.minSize, { w: 2, h: 2 });
  assert.equal(definition.version, 1);
});

test('réglages par défaut', () => {
  assert.deepEqual(defaultSettings, { timeFormat: '24h', showSeconds: true, showDate: true, showGreeting: false, userName: '', secondaryZones: [] });
  assert.equal(settingsSchema.safeParse(defaultSettings).success, true);
  assert.equal(dataSchema.safeParse(defaultData).success, true);
});

test('réglages : valeurs invalides refusées', () => {
  const bad = (/** @type {object} */ patch) => settingsSchema.safeParse({ ...defaultSettings, ...patch }).success;
  assert.equal(bad({ timeFormat: '13h' }), false);
  assert.equal(bad({ showSeconds: 'oui' }), false);
  assert.equal(bad({ userName: 'x'.repeat(41) }), false);
  assert.equal(bad({ userName: 'x'.repeat(40) }), true);
  assert.equal(bad({ secondaryZones: [{ timeZone: 'Mars/Olympus', label: '' }] }), false);
  assert.equal(bad({ secondaryZones: [{ timeZone: 'Asia/Tokyo', label: 'x'.repeat(41) }] }), false);
  assert.equal(bad({ secondaryZones: [{ timeZone: 'Asia/Tokyo', label: 'Tokyo' }] }), true);
});

test('au plus 4 fuseaux secondaires', () => {
  const zone = (/** @type {string} */ timeZone) => ({ timeZone, label: '' });
  const four = ['Asia/Tokyo', 'UTC', 'Europe/London', 'America/New_York'].map(zone);
  assert.equal(settingsSchema.safeParse({ ...defaultSettings, secondaryZones: four }).success, true);
  assert.equal(settingsSchema.safeParse({ ...defaultSettings, secondaryZones: [...four, zone('Asia/Dubai')] }).success, false);
});

test('resolveTimeZone : identifiant, casse, nom de ville', () => {
  const choices = getTimeZoneChoices();
  assert.equal(resolveTimeZone('Europe/Paris', choices), 'Europe/Paris');
  assert.equal(resolveTimeZone('  europe/paris ', choices), 'Europe/Paris');
  assert.equal(resolveTimeZone('New York', choices), 'America/New_York');
  assert.equal(resolveTimeZone('tokyo', choices), 'Asia/Tokyo');
  assert.equal(resolveTimeZone('Mars/Olympus', choices), null);
  assert.equal(resolveTimeZone('', choices), null);
});

test('timeEmWidth : plus large avec secondes et AM/PM', () => {
  const short = timeEmWidth({ main: '14:05', seconds: '', period: '' });
  const withSeconds = timeEmWidth({ main: '14:05', seconds: ':09', period: '' });
  const twelve = timeEmWidth({ main: '02:05', seconds: ':09', period: 'PM' });
  assert.ok(short < withSeconds && withSeconds < twelve);
});
