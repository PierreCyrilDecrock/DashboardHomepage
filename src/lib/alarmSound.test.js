import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BEEP_COUNT, BEEP_FREQUENCY_HZ, getBeepsDurationMs, playBeeps } from './alarmSound.js';

/** Doublure minimale d'un AudioContext : enregistre ce qui est programmé. */
function fakeContext(currentTime = 10) {
  const oscillators = [];
  const gains = [];
  const context = {
    currentTime,
    destination: { name: 'destination' },
    createOscillator() {
      const osc = { type: '', frequency: { value: 0 }, connected: null, started: null, stopped: null, connect(n) { this.connected = n; }, start(t) { this.started = t; }, stop(t) { this.stopped = t; } };
      oscillators.push(osc);
      return osc;
    },
    createGain() {
      const calls = [];
      const gain = { gain: { setValueAtTime: (v, t) => calls.push(['set', v, t]), linearRampToValueAtTime: (v, t) => calls.push(['ramp', v, t]) }, calls, connected: null, connect(n) { this.connected = n; } };
      gains.push(gain);
      return gain;
    },
  };
  return { context, oscillators, gains };
}

test('playBeeps : trois bips sinusoïdaux à 880 Hz de 150 ms', () => {
  const { context, oscillators } = fakeContext();
  playBeeps(context);
  assert.equal(oscillators.length, BEEP_COUNT);
  assert.equal(BEEP_COUNT, 3);
  for (const osc of oscillators) {
    assert.equal(osc.type, 'sine');
    assert.equal(osc.frequency.value, 880);
    assert.equal(BEEP_FREQUENCY_HZ, 880);
    assert.ok(Math.abs(osc.stopped - osc.started - 0.15) < 1e-9, '150 ms');
  }
});

test('playBeeps : les bips sont espacés et programmés dans le futur', () => {
  const { context, oscillators } = fakeContext(10);
  playBeeps(context);
  const starts = oscillators.map((o) => o.started);
  assert.ok(starts[0] > 10, 'jamais dans le passé');
  assert.ok(Math.abs(starts[1] - starts[0] - 0.3) < 1e-9);
  assert.ok(Math.abs(starts[2] - starts[1] - 0.3) < 1e-9);
});

test('playBeeps : chaque bip passe par un gain relié à la sortie, avec montée et descente', () => {
  const { context, oscillators, gains } = fakeContext();
  playBeeps(context);
  assert.equal(gains.length, 3);
  for (let i = 0; i < 3; i++) {
    assert.equal(oscillators[i].connected, gains[i]);
    assert.equal(gains[i].connected, context.destination);
    const values = gains[i].calls.map((c) => c[1]);
    assert.equal(values[0], 0);
    assert.equal(values.at(-1), 0, 'le volume revient à 0 : pas de claquement');
    assert.ok(Math.max(...values) > 0 && Math.max(...values) <= 0.5, 'volume modéré');
  }
});

test('playBeeps : renvoie la durée totale du son (750 ms)', () => {
  const { context } = fakeContext();
  assert.equal(playBeeps(context), 750);
  assert.equal(getBeepsDurationMs(), 750);
});
