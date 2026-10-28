import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from './serve.mjs';

test('serve : types MIME corrects, index.html par défaut, 404 et chemin interdit', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dash-serve-'));
  await mkdir(join(dir, 'sub'));
  await writeFile(join(dir, 'index.html'), '<p>ok</p>');
  await writeFile(join(dir, 'sub', 'a.js'), 'export {}');
  await writeFile(join(dir, 'a.css'), 'a{}');
  await writeFile(join(dir, 'a.json'), '{}');
  await writeFile(join(dir, 'f.woff2'), 'x');
  await writeFile(join(dir, 'i.svg'), '<svg/>');
  const srv = await startServer({ dir });
  try {
    const type = async (p) => (await fetch(srv.url + p)).headers.get('content-type');
    assert.match(await type(''), /text\/html/);
    assert.match(await type('sub/a.js'), /text\/javascript/);
    assert.match(await type('a.css'), /text\/css/);
    assert.match(await type('a.json'), /application\/json/);
    assert.equal(await type('f.woff2'), 'font/woff2');
    assert.equal(await type('i.svg'), 'image/svg+xml');
    assert.equal((await fetch(srv.url + 'nope.js')).status, 404);
    const raw = await fetch(srv.url + '%2e%2e%2f%2e%2e%2fetc%2fpasswd');
    assert.ok([403, 404].includes(raw.status));
  } finally {
    await srv.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('serve --base : le site n\'existe que sous le sous-dossier, /depot redirige vers /depot/', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dash-serve-base-'));
  await writeFile(join(dir, 'index.html'), '<p>ok</p>');
  await writeFile(join(dir, 'a.js'), 'export {}');
  const srv = await startServer({ dir, base: 'dashboard-homepage' });
  try {
    assert.ok(srv.url.endsWith('/dashboard-homepage/'));
    assert.equal((await fetch(srv.url)).status, 200);
    assert.equal((await fetch(srv.url + 'a.js')).status, 200);
    const origin = new URL(srv.url).origin;
    assert.equal((await fetch(origin + '/a.js')).status, 404, 'une adresse absolue ne trouve rien');
    assert.equal((await fetch(origin + '/')).status, 404);
    const redirect = await fetch(origin + '/dashboard-homepage', { redirect: 'manual' });
    assert.equal(redirect.status, 301);
    assert.equal(redirect.headers.get('location'), '/dashboard-homepage/');
  } finally {
    await srv.close();
    await rm(dir, { recursive: true, force: true });
  }
});
