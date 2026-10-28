import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cityFromTimeZone,
  clearFormatterCache,
  dayDifferenceLabel,
  formatDate,
  formatGreeting,
  formatterCacheSize,
  formatTime,
  formatTimeParts,
  getGreeting,
  getTimeZoneChoices,
  hourIn,
  isValidTimeZone,
} from './clockLogic.js';

// 26 octobre 2026, 13:05:09 UTC = 14:05:09 à Paris (heure d'hiver), 08:05:09 à New York.
const AFTERNOON = new Date('2026-10-26T13:05:09Z');
const h24 = { timeFormat: /** @type {const} */ ('24h'), showSeconds: true };
const h12 = { timeFormat: /** @type {const} */ ('12h'), showSeconds: true };

test('formatTime 24 h avec secondes', () => {
  assert.equal(formatTime(AFTERNOON, 'Europe/Paris', h24), '14:05:09');
});

test('formatTime 24 h sans secondes', () => {
  assert.equal(formatTime(AFTERNOON, 'Europe/Paris', { ...h24, showSeconds: false }), '14:05');
});

test('formatTime 12 h : AM / PM, minuit = 12:xx AM, midi = 12:xx PM', () => {
  assert.equal(formatTime(AFTERNOON, 'Europe/Paris', h12), '02:05:09 PM');
  assert.equal(formatTime(new Date('2026-10-26T23:30:00Z'), 'UTC', { ...h12, showSeconds: false }), '11:30 PM');
  assert.equal(formatTime(new Date('2026-10-26T00:30:00Z'), 'UTC', { ...h12, showSeconds: false }), '12:30 AM');
  assert.equal(formatTime(new Date('2026-10-26T12:00:00Z'), 'UTC', { ...h12, showSeconds: false }), '12:00 PM');
});

test('formatTime 24 h : minuit s\'écrit 00:xx, jamais 24:xx', () => {
  assert.equal(formatTime(new Date('2026-10-26T00:05:00Z'), 'UTC', { ...h24, showSeconds: false }), '00:05');
});

test('l\'espace avant AM / PM est une espace ordinaire', () => {
  assert.ok(!/[  ]/.test(formatTime(AFTERNOON, 'UTC', h12)));
});

test('fuseaux différents', () => {
  assert.equal(formatTime(AFTERNOON, 'America/New_York', h24), '09:05:09'); // 26 oct. : New York est encore à l'heure d'été (UTC−4)
  assert.equal(formatTime(AFTERNOON, 'Asia/Tokyo', h24), '22:05:09');
  assert.equal(formatTime(AFTERNOON, 'UTC', h24), '13:05:09');
});

test('formatTimeParts : l\'heure découpée', () => {
  assert.deepEqual(formatTimeParts(AFTERNOON, 'Europe/Paris', h12), { main: '02:05', seconds: ':09', period: 'PM' });
  assert.deepEqual(formatTimeParts(AFTERNOON, 'Europe/Paris', { ...h24, showSeconds: false }), { main: '14:05', seconds: '', period: '' });
});

test('formatDate en français', () => {
  assert.equal(formatDate(AFTERNOON, 'Europe/Paris'), 'lundi 26 octobre');
  assert.equal(formatDate(new Date('2026-10-27T01:00:00Z'), 'America/New_York'), 'lundi 26 octobre');
});

test('fuseau invalide refusé, fuseaux valides acceptés', () => {
  assert.equal(isValidTimeZone('Europe/Paris'), true);
  assert.equal(isValidTimeZone('America/New_York'), true);
  assert.equal(isValidTimeZone('UTC'), true);
  for (const bad of ['', ' ', 'Mars/Olympus', 'Paris', ' Europe/Paris', 42, null, undefined]) {
    assert.equal(isValidTimeZone(bad), false, String(bad));
  }
});

test('salutation aux bornes : Bonjour de 5 h à 17 h 59, Bonsoir sinon', () => {
  assert.equal(getGreeting(4), 'Bonsoir');
  assert.equal(getGreeting(5), 'Bonjour');
  assert.equal(getGreeting(12), 'Bonjour');
  assert.equal(getGreeting(17), 'Bonjour');
  assert.equal(getGreeting(18), 'Bonsoir');
  assert.equal(getGreeting(0), 'Bonsoir');
  assert.equal(getGreeting(23), 'Bonsoir');
});

test('salutation avec le prénom, sans espaces superflus', () => {
  assert.equal(formatGreeting(9, 'Camille'), 'Bonjour Camille');
  assert.equal(formatGreeting(20, '  Camille '), 'Bonsoir Camille');
  assert.equal(formatGreeting(9, '   '), 'Bonjour');
});

test('hourIn : l\'heure (0–23) dans un fuseau', () => {
  assert.equal(hourIn(AFTERNOON, 'Europe/Paris'), 14);
  assert.equal(hourIn(new Date('2026-10-26T22:30:00Z'), 'Europe/Paris'), 23);
  assert.equal(hourIn(new Date('2026-10-25T23:30:00Z'), 'Europe/Paris'), 0);
});

test('changement d\'heure : 02:30 s\'affiche deux fois à une heure d\'écart à Paris', () => {
  const first = new Date('2026-10-25T00:30:00Z'); // 02:30 heure d'été (UTC+2)
  const second = new Date('2026-10-25T01:30:00Z'); // 02:30 heure d'hiver (UTC+1)
  const options = { timeFormat: /** @type {const} */ ('24h'), showSeconds: false };
  assert.equal(formatTime(first, 'Europe/Paris', options), '02:30');
  assert.equal(formatTime(second, 'Europe/Paris', options), '02:30');
  assert.equal(second.getTime() - first.getTime(), 3_600_000);
});

test('écart de date avec le fuseau principal', () => {
  const lateParis = new Date('2026-10-26T22:30:00Z'); // 23:30 à Paris, 07:30 le 27 à Tokyo, 18:30 le 26 à New York
  assert.equal(dayDifferenceLabel(lateParis, 'Asia/Tokyo', 'Europe/Paris'), '+1 j');
  assert.equal(dayDifferenceLabel(lateParis, 'America/New_York', 'Europe/Paris'), '');
  const earlyParis = new Date('2026-10-26T05:30:00Z'); // 06:30 à Paris, 01:30 le 26 à New York
  assert.equal(dayDifferenceLabel(earlyParis, 'America/New_York', 'Europe/Paris'), '');
  const justAfterMidnight = new Date('2026-10-25T23:30:00Z'); // 00:30 le 26 à Paris, 19:30 le 25 à New York
  assert.equal(dayDifferenceLabel(justAfterMidnight, 'America/New_York', 'Europe/Paris'), '−1 j');
  assert.equal(dayDifferenceLabel(justAfterMidnight, 'Europe/Paris', 'Europe/Paris'), '');
});

test('écart de date : fin de mois et d\'année', () => {
  const newYear = new Date('2026-12-31T20:00:00Z'); // 21:00 le 31 à Paris, 05:00 le 1er janvier à Tokyo
  assert.equal(dayDifferenceLabel(newYear, 'Asia/Tokyo', 'Europe/Paris'), '+1 j');
});

test('cityFromTimeZone', () => {
  assert.equal(cityFromTimeZone('America/New_York'), 'New York');
  assert.equal(cityFromTimeZone('America/Argentina/Buenos_Aires'), 'Buenos Aires');
  assert.equal(cityFromTimeZone('UTC'), 'UTC');
});

test('getTimeZoneChoices : liste triée, sans doublon, avec Europe/Paris et UTC', () => {
  const choices = getTimeZoneChoices();
  assert.ok(choices.includes('Europe/Paris'));
  assert.ok(choices.includes('UTC'));
  assert.equal(new Set(choices).size, choices.length);
  assert.ok(choices.every(isValidTimeZone));
});

test('getTimeZoneChoices : repli sur une courte liste si Intl ne sait pas énumérer', (t) => {
  t.mock.method(Intl, 'supportedValuesOf', () => {
    throw new RangeError('indisponible');
  });
  const choices = getTimeZoneChoices();
  assert.ok(choices.length >= 10 && choices.length < 100);
  assert.ok(choices.includes('Europe/Paris') && choices.includes('America/New_York'));
  assert.ok(choices.every(isValidTimeZone));
});

test('les formateurs sont mis en cache par combinaison (fuseau, options)', () => {
  clearFormatterCache();
  formatTime(AFTERNOON, 'Europe/Paris', h24);
  formatTime(new Date(AFTERNOON.getTime() + 1000), 'Europe/Paris', h24);
  const afterTwoCalls = formatterCacheSize();
  assert.equal(afterTwoCalls, 1, 'deux appels identiques : un seul formateur');
  formatTime(AFTERNOON, 'Asia/Tokyo', h24);
  assert.equal(formatterCacheSize(), 2, 'autre fuseau : un nouveau formateur');
  formatTime(AFTERNOON, 'Asia/Tokyo', { ...h24, showSeconds: false });
  assert.equal(formatterCacheSize(), 3, 'autres options : un nouveau formateur');
});
