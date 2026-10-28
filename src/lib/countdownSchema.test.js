import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createIdle, pause, settle, start } from './countdown.js';
import { countdownSchema } from './countdownSchema.js';

const T0 = 1_800_000_000_000;
const ok = (value) => countdownSchema.safeParse(value).success;

test('accepte les quatre états produits par le moteur', () => {
  const idle = createIdle(60_000);
  const running = start(idle, T0);
  for (const state of [idle, running, pause(running, T0 + 1000), settle(running, T0 + 60_000)]) {
    assert.equal(ok(state), true, JSON.stringify(state));
  }
});

test('refuse un statut inconnu, un champ manquant ou hors bornes', () => {
  assert.equal(ok({ status: 'ringing', durationMs: 1000 }), false);
  assert.equal(ok({ status: 'idle' }), false);
  assert.equal(ok({ status: 'running', durationMs: 60_000 }), false, 'endsAt manquant');
  assert.equal(ok({ status: 'paused', durationMs: 60_000 }), false, 'remainingMs manquant');
  assert.equal(ok({ status: 'done', durationMs: 60_000 }), false, 'finishedAt manquant');
  assert.equal(ok({ status: 'idle', durationMs: 0 }), false);
  assert.equal(ok({ status: 'idle', durationMs: 24 * 3_600_000 + 1 }), false);
  assert.equal(ok({ status: 'idle', durationMs: '60000' }), false);
  assert.equal(ok({ status: 'running', durationMs: 1000, endsAt: 'bientôt' }), false);
  assert.equal(ok({ status: 'paused', durationMs: 1000, remainingMs: -1 }), false);
  assert.equal(ok(null), false);
  assert.equal(ok('idle'), false);
});
