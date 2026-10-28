// Fausse implémentation de l'API Storage (localStorage) pour les tests, avec un quota
// optionnel. Ce fichier sert aussi d'utilitaire aux autres tests ; il n'est pas exporté.
import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * @param {{ quotaChars?: number }} [options] taille maximale cumulée des clés et valeurs
 */
export function createFakeStorage({ quotaChars = Infinity } = {}) {
  /** @type {Map<string, string>} */
  const map = new Map();
  const size = () => [...map].reduce((n, [k, v]) => n + k.length + v.length, 0);
  return {
    get length() {
      return map.size;
    },
    key: (/** @type {number} */ i) => [...map.keys()][i] ?? null,
    getItem: (/** @type {string} */ k) => (map.has(k) ? /** @type {string} */ (map.get(k)) : null),
    setItem(/** @type {string} */ k, /** @type {string} */ v) {
      const before = map.get(k);
      map.set(k, String(v));
      if (size() > quotaChars) {
        if (before === undefined) map.delete(k);
        else map.set(k, before);
        const err = new Error('The quota has been exceeded.');
        err.name = 'QuotaExceededError';
        throw err;
      }
    },
    removeItem: (/** @type {string} */ k) => void map.delete(k),
    clear: () => map.clear(),
  };
}

test('fakeStorage : se comporte comme localStorage et respecte le quota', () => {
  const s = createFakeStorage({ quotaChars: 20 });
  s.setItem('a', '1234');
  assert.equal(s.getItem('a'), '1234');
  assert.equal(s.length, 1);
  assert.equal(s.key(0), 'a');
  assert.throws(() => s.setItem('b', 'x'.repeat(30)), { name: 'QuotaExceededError' });
  assert.equal(s.getItem('b'), null);
  s.removeItem('a');
  assert.equal(s.length, 0);
});
