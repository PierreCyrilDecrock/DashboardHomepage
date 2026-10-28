#!/usr/bin/env node
// Petit serveur statique, sans dépendance.
//   node tools/serve.mjs <dossier> [port] [--base /sous-dossier/]
// Sert le dossier tel quel (types MIME corrects pour .js, .css, .json, .woff2, .svg).
// Avec --base, le site n'est servi QUE sous ce sous-dossier (comme sur GitHub Pages, où il
// vit sous https://<utilisateur>.github.io/<dépôt>/) : tout ce qui est demandé hors de ce
// préfixe reçoit une erreur 404, ce qui révèle les adresses absolues oubliées.
// Utilisé pour contrôler le site exporté dans un vrai navigateur. Ne sert qu'en local.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

/**
 * Démarre un serveur statique sur 127.0.0.1.
 * @param {{ dir: string, port?: number, base?: string }} options  port 0 = port libre choisi par le système ; base : préfixe de l'adresse (« / » par défaut)
 * @returns {Promise<{ port: number, url: string, close: () => Promise<void> }>}
 */
export function normalizeBase(base = '/') {
  let b = String(base).trim();
  if (!b.startsWith('/')) b = '/' + b;
  if (!b.endsWith('/')) b += '/';
  return b;
}

export function startServer({ dir, port = 0, base = '/' }) {
  const root = resolve(dir);
  const prefix = normalizeBase(base);
  const server = createServer(async (req, res) => {
    try {
      let pathname = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
      if (prefix !== '/') {
        if (pathname === prefix.slice(0, -1)) {
          // Comme GitHub Pages : /depot redirige vers /depot/
          res.writeHead(301, { Location: prefix + (req.url || '').slice(prefix.length - 1) }).end();
          return;
        }
        if (!pathname.startsWith(prefix)) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Introuvable (hors du sous-dossier)');
          return;
        }
        pathname = '/' + pathname.slice(prefix.length);
      }
      let file = normalize(join(root, pathname));
      if (file !== root && !file.startsWith(root + sep)) {
        res.writeHead(403).end('Interdit');
        return;
      }
      const info = await stat(file).catch(() => null);
      if (info?.isDirectory()) file = join(file, 'index.html');
      const body = await readFile(file);
      res.writeHead(200, {
        'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Introuvable');
    }
  });
  return new Promise((resolveStart, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const actual = /** @type {import('node:net').AddressInfo} */ (server.address()).port;
      resolveStart({
        port: actual,
        url: `http://127.0.0.1:${actual}${prefix}`,
        close: () => new Promise((r) => {
          server.closeAllConnections?.();
          server.close(() => r());
        }),
      });
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let base = '/';
  const at = args.indexOf('--base');
  if (at >= 0) base = args.splice(at, 2)[1] ?? '/';
  const [dir = 'site', portArg = '8080'] = args;
  const { url } = await startServer({ dir, port: Number(portArg), base });
  console.log(`Serveur : ${url}  (dossier : ${resolve(dir)})`);
}
