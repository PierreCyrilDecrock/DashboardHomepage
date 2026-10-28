import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getFaviconUrl } from './favicon.js';

test('getFaviconUrl : service Google, taille 64', () => {
  assert.equal(getFaviconUrl('github.com'), 'https://www.google.com/s2/favicons?domain=github.com&sz=64');
});

test('getFaviconUrl : le domaine est encodé (aucune injection de paramètre)', () => {
  assert.equal(getFaviconUrl('a.com&sz=1'), 'https://www.google.com/s2/favicons?domain=a.com%26sz%3D1&sz=64');
  assert.equal(getFaviconUrl('localhost'), 'https://www.google.com/s2/favicons?domain=localhost&sz=64');
});
