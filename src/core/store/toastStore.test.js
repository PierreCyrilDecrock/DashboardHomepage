import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createToastStore } from './toastStore.js';

function make() {
  let t = 0;
  const timers = new Map();
  let next = 1;
  const store = createToastStore({
    setTimer: (fn, ms) => { timers.set(next, { at: t + ms, fn }); return next++; },
    clearTimer: (id) => timers.delete(id),
  });
  const advance = (ms) => { t += ms; for (const [id, { at, fn }] of [...timers]) if (at <= t) { timers.delete(id); fn(); } };
  return { store, advance, timers };
}

test('show : le toast apparaît puis disparaît seul après la durée', () => {
  const { store, advance } = make();
  const id = store.show({ message: 'Bonjour', duration: 1000 });
  assert.deepEqual(store.getState().toasts.map((t) => [t.id, t.message]), [[id, 'Bonjour']]);
  advance(999);
  assert.equal(store.getState().toasts.length, 1);
  advance(1);
  assert.equal(store.getState().toasts.length, 0);
});

test('durée 0 : le toast reste ; dismiss le ferme et annule le minuteur', () => {
  const { store, advance, timers } = make();
  const id = store.show({ message: 'Reste', duration: 0 });
  advance(60000);
  assert.equal(store.getState().toasts.length, 1);
  const other = store.show({ message: 'Autre', duration: 500 });
  assert.equal(timers.size, 1);
  store.dismiss(other);
  assert.equal(timers.size, 0);
  store.dismiss(id);
  assert.equal(store.getState().toasts.length, 0);
});

test('runAction : exécute l\'action une seule fois et ferme le toast', () => {
  const { store } = make();
  let calls = 0;
  const id = store.show({ message: 'Widget supprimé', actionLabel: 'Annuler', onAction: () => calls++ });
  store.runAction(id);
  store.runAction(id);
  assert.equal(calls, 1);
  assert.equal(store.getState().toasts.length, 0);
});

test('dismiss d\'un toast inconnu ne notifie personne', () => {
  const { store } = make();
  let n = 0;
  store.subscribe(() => n++);
  store.dismiss(99);
  assert.equal(n, 0);
});
