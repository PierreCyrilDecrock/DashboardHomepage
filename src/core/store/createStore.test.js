import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from './createStore.js';

test('getState et setState (fusion partielle)', () => {
  const s = createStore({ a: 1, b: 2 });
  assert.deepEqual(s.getState(), { a: 1, b: 2 });
  s.setState({ a: 5 });
  assert.deepEqual(s.getState(), { a: 5, b: 2 });
  s.setState((state) => ({ b: state.b + 1 }));
  assert.deepEqual(s.getState(), { a: 5, b: 3 });
});

test('les écouteurs ne sont appelés que si l\'état a réellement changé', () => {
  const s = createStore({ a: 1, list: [1] });
  const calls = [];
  s.subscribe((state, previous) => calls.push([state.a, previous.a]));

  const before = s.getState();
  s.setState({ a: 1 });
  s.setState({});
  s.setState(null);
  s.setState(() => undefined);
  s.setState((state) => ({ a: state.a }));
  assert.equal(s.getState(), before, 'la référence de l\'état ne change pas');
  assert.deepEqual(calls, []);

  s.setState({ a: 2 });
  assert.deepEqual(calls, [[2, 1]]);
  assert.notEqual(s.getState(), before);

  // Une nouvelle référence de tableau est un changement, même à contenu égal.
  s.setState({ list: [1] });
  assert.equal(calls.length, 2);
});

test('replace remplace tout l\'état ; la même référence ne prévient personne', () => {
  const s = createStore({ a: 1, b: 2 });
  let n = 0;
  s.subscribe(() => n++);
  s.setState({ a: 9 }, true);
  assert.deepEqual(s.getState(), { a: 9 });
  assert.equal(n, 1);
  s.setState(s.getState(), true);
  assert.equal(n, 1);
});

test('désabonnement, y compris pendant une notification', () => {
  const s = createStore({ n: 0 });
  const seen = [];
  const off1 = s.subscribe(() => {
    seen.push('un');
    off1();
  });
  s.subscribe(() => seen.push('deux'));
  s.setState({ n: 1 });
  s.setState({ n: 2 });
  assert.deepEqual(seen, ['un', 'deux', 'deux']);
});

test('plusieurs abonnés reçoivent tous la même notification', () => {
  const s = createStore({ n: 0 });
  const a = [];
  const b = [];
  s.subscribe((st) => a.push(st.n));
  s.subscribe((st) => b.push(st.n));
  s.setState({ n: 1 });
  assert.deepEqual([a, b], [[1], [1]]);
});
