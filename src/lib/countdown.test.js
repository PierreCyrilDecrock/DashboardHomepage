import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_DURATION_MS,
  advance,
  MAX_DURATION_MS,
  clampDuration,
  createIdle,
  formatDuration,
  getProgress,
  getRemainingMs,
  isLate,
  parseDurationInput,
  pause,
  reset,
  resume,
  settle,
  start,
  withDuration,
} from './countdown.js';

const T0 = 1_800_000_000_000;
const MIN = 60_000;

test('createIdle : durée par défaut de 5 minutes, bornée', () => {
  assert.deepEqual(createIdle(), { status: 'idle', durationMs: DEFAULT_DURATION_MS });
  assert.equal(createIdle(0).durationMs, 1000);
  assert.equal(createIdle(-5).durationMs, 1000);
  assert.equal(createIdle(10 * MAX_DURATION_MS).durationMs, MAX_DURATION_MS);
  assert.equal(createIdle(NaN).durationMs, DEFAULT_DURATION_MS);
  assert.equal(clampDuration('abc'), DEFAULT_DURATION_MS);
  assert.equal(createIdle(1234.6).durationMs, 1235);
});

test('start : idle → running avec endsAt = maintenant + durée ; sans effet ailleurs', () => {
  const idle = createIdle(MIN);
  assert.deepEqual(start(idle, T0), { status: 'running', durationMs: MIN, endsAt: T0 + MIN });
  const running = start(idle, T0);
  assert.equal(start(running, T0 + 5), running);
  const paused = pause(running, T0 + 10);
  assert.equal(start(paused, T0 + 20), paused);
  const done = settle(running, T0 + MIN);
  assert.equal(start(done, T0 + MIN), done);
});

test('le temps restant se calcule depuis endsAt, pas depuis un compteur', () => {
  const running = start(createIdle(MIN), T0);
  assert.equal(getRemainingMs(running, T0), MIN);
  assert.equal(getRemainingMs(running, T0 + 250), MIN - 250);
  assert.equal(getRemainingMs(running, T0 + 59_999), 1);
  assert.equal(getRemainingMs(running, T0 + MIN), 0);
  assert.equal(getRemainingMs(running, T0 + 10 * MIN), 0, 'jamais négatif');
  // Un « saut » d'horloge (veille) donne le bon résultat, sans passer par les secondes intermédiaires.
  assert.equal(getRemainingMs(running, T0 + 45_000), 15_000);
  assert.equal(getRemainingMs(createIdle(MIN), T0), MIN);
});

test('pause puis reprise conserve le temps restant, à la milliseconde près', () => {
  const running = start(createIdle(MIN), T0);
  const paused = pause(running, T0 + 20_250);
  assert.deepEqual(paused, { status: 'paused', durationMs: MIN, remainingMs: 39_750 });
  // Le temps passe pendant la pause : rien ne bouge.
  assert.equal(getRemainingMs(paused, T0 + 20_250), 39_750);
  assert.equal(getRemainingMs(paused, T0 + 999_999), 39_750);
  const resumed = resume(paused, T0 + 500_000);
  assert.deepEqual(resumed, { status: 'running', durationMs: MIN, endsAt: T0 + 500_000 + 39_750 });
  assert.equal(getRemainingMs(resumed, T0 + 500_000), 39_750);
  // Plusieurs pauses de suite : aucune dérive.
  let state = resumed;
  let now = T0 + 500_000;
  for (let i = 0; i < 10; i++) {
    now += 1000;
    state = pause(state, now);
    now += 7777;
    state = resume(state, now);
  }
  assert.equal(getRemainingMs(state, now), 39_750 - 10 * 1000);
});

test('pause sans effet hors running ; reprise sans effet hors paused', () => {
  const idle = createIdle(MIN);
  assert.equal(pause(idle, T0), idle);
  assert.equal(resume(idle, T0), idle);
  const running = start(idle, T0);
  assert.equal(resume(running, T0 + 1), running);
  const done = settle(running, T0 + MIN);
  assert.equal(pause(done, T0 + MIN), done);
  assert.equal(resume(done, T0 + MIN), done);
});

test('pause quand l\'heure de fin est déjà passée : la minuterie est terminée, pas en pause', () => {
  const running = start(createIdle(MIN), T0);
  assert.deepEqual(pause(running, T0 + MIN + 5), { status: 'done', durationMs: MIN, finishedAt: T0 + MIN });
  assert.equal(pause(running, T0 + MIN).status, 'done');
  assert.equal(pause(running, T0 + MIN - 1).status, 'paused');
});

test('reset : n\'importe quel état → idle, durée conservée', () => {
  const idle = createIdle(3 * MIN);
  const running = start(idle, T0);
  assert.equal(reset(idle), idle);
  assert.deepEqual(reset(running), idle);
  assert.deepEqual(reset(pause(running, T0 + 1000)), idle);
  assert.deepEqual(reset(settle(running, T0 + 10 * MIN)), idle);
});

test('settle : running échu → done, finishedAt = endsAt (déterministe)', () => {
  const running = start(createIdle(MIN), T0);
  assert.equal(settle(running, T0 + MIN - 1), running, 'pas encore');
  assert.deepEqual(settle(running, T0 + MIN), { status: 'done', durationMs: MIN, finishedAt: T0 + MIN });
  assert.deepEqual(settle(running, T0 + 99 * MIN), { status: 'done', durationMs: MIN, finishedAt: T0 + MIN }, 'pas l\'heure courante');
});

test('settle est idempotent et sans effet hors running', () => {
  const running = start(createIdle(MIN), T0);
  const once = settle(running, T0 + 5 * MIN);
  const twice = settle(once, T0 + 9 * MIN);
  assert.equal(twice, once, 'le même objet');
  for (const state of [createIdle(MIN), pause(running, T0 + 100)]) assert.equal(settle(state, T0 + 100 * MIN), state);
});

test('isLate : done depuis plus de 2 secondes', () => {
  const running = start(createIdle(MIN), T0);
  const done = settle(running, T0 + MIN);
  assert.equal(isLate(done, T0 + MIN), false);
  assert.equal(isLate(done, T0 + MIN + 2000), false, 'exactement 2 s : pas encore tardif');
  assert.equal(isLate(done, T0 + MIN + 2001), true);
  assert.equal(isLate(done, T0 + MIN + 500, 100), true, 'seuil personnalisé');
  assert.equal(isLate(running, T0 + 10 * MIN), false, 'seul done peut être tardif');
  assert.equal(isLate(createIdle(MIN), T0 + 10 * MIN), false);
});

test('withDuration : seulement en idle ou done (done repasse en idle)', () => {
  const idle = createIdle(MIN);
  assert.deepEqual(withDuration(idle, 10 * MIN), createIdle(10 * MIN));
  assert.equal(withDuration(idle, MIN), idle, 'même durée : même objet');
  const running = start(idle, T0);
  assert.equal(withDuration(running, 10 * MIN), running);
  const paused = pause(running, T0 + 10);
  assert.equal(withDuration(paused, 10 * MIN), paused);
  const done = settle(running, T0 + MIN);
  assert.deepEqual(withDuration(done, MIN), createIdle(MIN));
  assert.deepEqual(withDuration(done, 2 * MIN), createIdle(2 * MIN));
});

test('formatDuration : mm:ss, h:mm:ss à partir d\'une heure', () => {
  assert.equal(formatDuration(0), '00:00');
  assert.equal(formatDuration(1000), '00:01');
  assert.equal(formatDuration(59_000), '00:59');
  assert.equal(formatDuration(60_000), '01:00');
  assert.equal(formatDuration(5 * MIN), '05:00');
  assert.equal(formatDuration(59 * MIN + 59_000), '59:59');
  assert.equal(formatDuration(3_600_000), '1:00:00');
  assert.equal(formatDuration(3_600_000 + 5 * MIN + 7000), '1:05:07');
  assert.equal(formatDuration(24 * 3_600_000), '24:00:00');
  assert.equal(formatDuration(600 * MIN), '10:00:00');
});

test('formatDuration : arrondi à la seconde supérieure, 00:00 seulement à la fin', () => {
  assert.equal(formatDuration(1), '00:01');
  assert.equal(formatDuration(300), '00:01');
  assert.equal(formatDuration(999), '00:01');
  assert.equal(formatDuration(1001), '00:02');
  assert.equal(formatDuration(59_001), '01:00');
  assert.equal(formatDuration(3_599_001), '1:00:00');
});

test('formatDuration : valeurs absurdes', () => {
  assert.equal(formatDuration(-5000), '00:00');
  assert.equal(formatDuration(NaN), '00:00');
  assert.equal(formatDuration(Infinity), '00:00');
});

test('parseDurationInput : minutes, minutes:secondes, heures:minutes:secondes', () => {
  assert.equal(parseDurationInput('5'), 5 * MIN);
  assert.equal(parseDurationInput('90'), 90 * MIN);
  assert.equal(parseDurationInput('05'), 5 * MIN);
  assert.equal(parseDurationInput('5:30'), 5 * MIN + 30_000);
  assert.equal(parseDurationInput('0:45'), 45_000);
  assert.equal(parseDurationInput('00:01'), 1000);
  assert.equal(parseDurationInput('1:05:00'), 3_900_000);
  assert.equal(parseDurationInput('0:00:30'), 30_000);
  assert.equal(parseDurationInput('12:34:56'), 12 * 3_600_000 + 34 * MIN + 56_000);
  assert.equal(parseDurationInput('  7  '), 7 * MIN, 'espaces autour');
});

test('parseDurationInput : bornes de 1 seconde à 24 heures', () => {
  assert.equal(parseDurationInput('0'), null);
  assert.equal(parseDurationInput('0:00'), null);
  assert.equal(parseDurationInput('0:00:00'), null);
  assert.equal(parseDurationInput('0:01'), 1000);
  assert.equal(parseDurationInput('1440'), MAX_DURATION_MS);
  assert.equal(parseDurationInput('24:00:00'), MAX_DURATION_MS);
  assert.equal(parseDurationInput('1441'), null);
  assert.equal(parseDurationInput('24:00:01'), null);
  assert.equal(parseDurationInput('25:00:00'), null);
  assert.equal(parseDurationInput('99999'), null);
});

test('parseDurationInput : valeurs invalides', () => {
  for (const bad of ['', '   ', 'abc', '5 min', '-5', '+5', '5.5', '5,5', '1:2:3:4', ':30', '5:', '5::30', '5:60', '1:60:00', '1:00:60', '5:abc', '1e3', '0x10', ' ', '5:-1', '٣']) {
    assert.equal(parseDurationInput(bad), null, JSON.stringify(bad));
  }
  for (const bad of [null, undefined, 5, {}, []]) assert.equal(parseDurationInput(bad), null);
});

test('parseDurationInput et formatDuration se répondent', () => {
  for (const text of ['05:00', '25:30', '1:05:00', '00:01', '59:59', '24:00:00']) {
    assert.equal(formatDuration(parseDurationInput(text)), text);
  }
  assert.equal(formatDuration(parseDurationInput('5:00')), '05:00', 'forme canonique');
});

test('getProgress : part du temps écoulé', () => {
  const running = start(createIdle(10_000), T0);
  assert.equal(getProgress(createIdle(10_000), T0), 0);
  assert.equal(getProgress(running, T0), 0);
  assert.equal(getProgress(running, T0 + 2500), 0.25);
  assert.equal(getProgress(running, T0 + 10_000), 1);
  assert.equal(getProgress(running, T0 + 99_000), 1);
  assert.equal(getProgress(pause(running, T0 + 5000), T0 + 77_000), 0.5);
  assert.equal(getProgress(settle(running, T0 + 10_000), T0), 1);
});

test('advance : la fin est signalée une seule fois par valeur de endsAt', () => {
  const running = start(createIdle(MIN), T0);
  const before = advance(running, T0 + MIN - 1, null);
  assert.equal(before.state, running);
  assert.equal(before.completion, null);
  const first = advance(running, T0 + MIN, null);
  assert.equal(first.state.status, 'done');
  assert.deepEqual(first.completion, { finishedAt: T0 + MIN, late: false });
  assert.equal(first.completedFor, T0 + MIN);
  // Le même état « running » relu une seconde fois (second onglet, rendu en double) : plus de signal.
  const again = advance(running, T0 + MIN + 10, first.completedFor);
  assert.equal(again.state.status, 'done');
  assert.equal(again.completion, null);
  // Une nouvelle minuterie (autre endsAt) sonne de nouveau.
  const next = start(createIdle(MIN), T0 + 10 * MIN);
  const second = advance(next, T0 + 11 * MIN, first.completedFor);
  assert.deepEqual(second.completion, { finishedAt: T0 + 11 * MIN, late: false });
});

test('advance : un état running déjà écoulé au chargement est signalé comme tardif', () => {
  const running = start(createIdle(20_000), T0);
  const result = advance(running, T0 + 30_000, null);
  assert.deepEqual(result.completion, { finishedAt: T0 + 20_000, late: true });
  assert.equal(advance(running, T0 + 22_000, null).completion.late, false, '2 s ou moins : pas tardif');
  assert.equal(advance(running, T0 + 22_001, null).completion.late, true);
});

test('advance : sans effet hors running (done déjà enregistré, pause, idle)', () => {
  const running = start(createIdle(MIN), T0);
  const done = settle(running, T0 + MIN);
  for (const state of [createIdle(MIN), pause(running, T0 + 5), done]) {
    const result = advance(state, T0 + 99 * MIN, null);
    assert.equal(result.state, state);
    assert.equal(result.completion, null);
  }
});
