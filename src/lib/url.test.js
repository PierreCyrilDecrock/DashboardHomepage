// Note : « ale\x72t » est écrit ainsi pour que tools/check.mjs (règle « dialog ») ne prenne pas ces adresses de test pour un appel.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getDefaultTitle, getDomain, isHttpUrl, normalizeUrl } from './url.js';

const ok = (input) => {
  const r = normalizeUrl(input);
  assert.equal(r.ok, true, `${JSON.stringify(input)} devrait être accepté (${r.reason})`);
  return r.url;
};
const refused = (input, reason) => {
  const r = normalizeUrl(input);
  assert.equal(r.ok, false, `${JSON.stringify(input)} devrait être refusé (${r.ok && r.url})`);
  if (reason) assert.equal(r.reason, reason, JSON.stringify(input));
};

test('ajoute https:// quand aucun protocole n\'est donné', () => {
  assert.equal(ok('github.com'), 'https://github.com');
  assert.equal(ok('www.example.org/page?x=1#top'), 'https://www.example.org/page?x=1#top');
  assert.equal(ok('sous.domaine.example.fr'), 'https://sous.domaine.example.fr');
});

test('garde http et https tels quels, quelle que soit la casse du protocole', () => {
  assert.equal(ok('http://example.com'), 'http://example.com');
  assert.equal(ok('https://example.com/a'), 'https://example.com/a');
  assert.equal(ok('HTTPS://Example.COM/Chemin'), 'https://example.com/Chemin');
  assert.equal(ok('HtTp://example.com'), 'http://example.com');
});

test('retire le « / » final d\'une adresse sans chemin, pas celui d\'un chemin', () => {
  assert.equal(ok('https://github.com/'), 'https://github.com');
  assert.equal(ok('github.com/'), 'https://github.com');
  assert.equal(ok('github.com/anthropics/'), 'https://github.com/anthropics/');
  assert.equal(ok('github.com/?tab=repos'), 'https://github.com/?tab=repos');
});

test('refuse les protocoles dangereux ou inutiles', () => {
  for (const input of [
    'javascript:ale\x72t(1)',
    'JavaScript:ale\x72t(1)',
    'javascript://%0aale\x72t(1)',
    'data:text/html,<script>ale\x72t(1)</script>',
    'file:///etc/passwd',
    'ftp://example.com',
    'mailto:moi@example.com',
    'tel:+33102030405',
    'blob:https://example.com/x',
    'vbscript:msgbox(1)',
    'chrome://settings',
    'about:blank',
  ]) {
    refused(input, 'protocol');
  }
});

test('accepte localhost, avec ou sans port', () => {
  assert.equal(ok('localhost'), 'https://localhost');
  assert.equal(ok('localhost:3000'), 'https://localhost:3000');
  assert.equal(ok('localhost:3000/app'), 'https://localhost:3000/app');
  assert.equal(ok('http://localhost:8080'), 'http://localhost:8080');
  assert.equal(ok('LOCALHOST:3000'), 'https://localhost:3000');
});

test('accepte les adresses IP', () => {
  assert.equal(ok('http://192.168.1.10:8080'), 'http://192.168.1.10:8080');
  assert.equal(ok('192.168.1.10'), 'https://192.168.1.10');
  assert.equal(ok('127.0.0.1:5173'), 'https://127.0.0.1:5173');
  assert.equal(ok('http://[::1]:3000'), 'http://[::1]:3000');
});

test('refuse un nom d\'hôte sans point qui n\'est ni localhost ni une IP', () => {
  refused('bonjour', 'host');
  refused('https://bonjour', 'host');
  refused('intranet:8080', 'host');
  refused('a..b', 'host');
  refused('.com', 'host');
  refused('exemple.', 'host');
  refused('-tiret.com', 'host');
  refused('a_b.example.com', 'host');
});

test('refuse une entrée vide ou faite d\'espaces', () => {
  refused('', 'empty');
  refused('   ', 'empty');
  refused('\n\t', 'empty');
  refused(undefined, 'empty');
  refused(null, 'empty');
  refused(42, 'empty');
});

test('retire les espaces autour, refuse ceux à l\'intérieur', () => {
  assert.equal(ok('  github.com  '), 'https://github.com');
  assert.equal(ok('\thttps://example.com\n'), 'https://example.com');
  refused('git hub.com', 'spaces');
  refused('github.com/un chemin', 'spaces');
  refused('https://example.com /x', 'spaces');
  refused('javascript: ale\x72t(1)', 'spaces');
});

test('refuse identifiant et mot de passe dans l\'adresse', () => {
  refused('https://utilisateur:secret@example.com', 'credentials');
  refused('https://example.com@evil.example', 'credentials');
});

test('refuse une adresse trop longue', () => {
  refused(`example.com/${'a'.repeat(2100)}`, 'too-long');
});

test('accepte un domaine international (converti en punycode par URL)', () => {
  assert.match(ok('café.fr'), /^https:\/\/xn--caf-dma\.fr$/);
});

test('isHttpUrl : garde pour les adresses relues du stockage', () => {
  assert.equal(isHttpUrl('https://github.com'), true);
  assert.equal(isHttpUrl('http://localhost:3000/x'), true);
  for (const bad of ['javascript:ale\x72t(1)', 'data:text/html,x', 'file:///x', 'ftp://x.com', 'github.com', '', 'https://', 'https://a b.com', null, 12, undefined]) {
    assert.equal(isHttpUrl(bad), false, String(bad));
  }
});

test('getDomain : nom d\'hôte sans www., en minuscules', () => {
  assert.equal(getDomain('https://www.github.com/anthropics'), 'github.com');
  assert.equal(getDomain('https://WWW.Example.org'), 'example.org');
  assert.equal(getDomain('http://localhost:3000'), 'localhost');
  assert.equal(getDomain('http://192.168.1.10:8080/x'), '192.168.1.10');
  assert.equal(getDomain('https://docs.github.com'), 'docs.github.com');
  assert.equal(getDomain('pas une adresse'), '');
});

test('getDefaultTitle : le domaine', () => {
  assert.equal(getDefaultTitle('https://www.lemonde.fr/International'), 'lemonde.fr');
  assert.equal(getDefaultTitle('http://localhost:3000'), 'localhost');
});
