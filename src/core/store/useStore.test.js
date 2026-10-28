import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from './createStore.js';
import { shallowEqual, subscribeSelected } from './useStore.js';

// Le hook useStore lui-même (rendus Preact) est vérifié dans un vrai navigateur :
// tests/e2e/phase1.mjs. Ici, la logique d'abonnement par sélecteur dont il dépend.

test('subscribeSelected : prévient seulement quand la valeur sélectionnée change', () => {
  const s = createStore({ count: 0, other: 0 });
  const seen = [];
  const sub = subscribeSelected(s, (st) => st.count, Object.is, (v) => seen.push(v));
  assert.equal(sub.getSelected(), 0);

  s.setState({ other: 1 }); // autre champ : le sélecteur ne bouge pas
  s.setState({ other: 2 });
  assert.deepEqual(seen, []);

  s.setState({ count: 1 });
  s.setState({ count: 1 });
  s.setState({ count: 2 });
  assert.deepEqual(seen, [1, 2]);
  assert.equal(sub.getSelected(), 2);
});

test('subscribeSelected : un sélecteur qui crée un objet neuf a besoin de shallowEqual', () => {
  const s = createStore({ a: 1, b: 1, c: 1 });
  const select = (st) => ({ a: st.a, b: st.b });
  const strict = [];
  const shallow = [];
  subscribeSelected(s, select, Object.is, (v) => strict.push(v));
  subscribeSelected(s, select, shallowEqual, (v) => shallow.push(v));
  s.setState({ c: 2 });
  assert.equal(strict.length, 1, 'Object.is : un objet neuf est toujours « différent »');
  assert.equal(shallow.length, 0, 'shallowEqual : mêmes valeurs, pas de rendu');
  s.setState({ a: 5 });
  assert.equal(shallow.length, 1);
  assert.deepEqual(shallow[0], { a: 5, b: 1 });
});

test('subscribeSelected : unsubscribe arrête les notifications', () => {
  const s = createStore({ n: 0 });
  const seen = [];
  const sub = subscribeSelected(s, (st) => st.n, Object.is, (v) => seen.push(v));
  s.setState({ n: 1 });
  sub.unsubscribe();
  s.setState({ n: 2 });
  assert.deepEqual(seen, [1]);
});

test('shallowEqual', () => {
  assert.equal(shallowEqual({ a: 1 }, { a: 1 }), true);
  assert.equal(shallowEqual({ a: 1 }, { a: 2 }), false);
  assert.equal(shallowEqual({ a: 1 }, { a: 1, b: 2 }), false);
  assert.equal(shallowEqual([1, 2], [1, 2]), true);
  assert.equal(shallowEqual([1, 2], [1, 3]), false);
  assert.equal(shallowEqual(null, null), true);
  assert.equal(shallowEqual(null, {}), false);
  assert.equal(shallowEqual(1, 1), true);
  assert.equal(shallowEqual({ a: undefined }, { b: undefined }), false);
});
