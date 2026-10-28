import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadStyle } from './loadStyle.js';

/** Faux document : juste ce dont loadStyle a besoin. */
function fakeDocument() {
  /** @type {any[]} */
  const links = [];
  return {
    baseURI: 'https://exemple.test/app/',
    head: { appendChild: (el) => links.push(el) },
    createElement: () => {
      const attrs = new Map();
      return { rel: '', href: '', setAttribute: (k, v) => attrs.set(k, v), attrs };
    },
    querySelectorAll: () => links,
    links,
  };
}

test('loadStyle : ajoute un <link> une seule fois pour la même adresse', () => {
  const doc = fakeDocument();
  const a = loadStyle(new URL('https://exemple.test/app/src/widgets/demo/style.css'), doc);
  const b = loadStyle('https://exemple.test/app/src/widgets/demo/style.css', doc);
  assert.equal(doc.links.length, 1);
  assert.equal(a, b);
  assert.equal(a.rel, 'stylesheet');
  assert.ok(a.attrs.has('data-widget-style'));
});

test('loadStyle : deux feuilles différentes donnent deux <link> ; adresse relative résolue sur la page', () => {
  const doc = fakeDocument();
  loadStyle('a.css', doc);
  loadStyle('b.css', doc);
  assert.equal(doc.links.length, 2);
  assert.equal(doc.links[0].href, 'https://exemple.test/app/a.css');
});

test('loadStyle : sans document (Node), ne fait rien', () => {
  assert.equal(loadStyle('a.css'), null);
});
