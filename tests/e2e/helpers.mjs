// Aides communes à tous les parcours navigateur (Playwright, Chromium).
//
// Un parcours = un fichier tests/e2e/phaseN.mjs qui appelle runJourney. Les aides :
//   1. exportent le site (tools/export.mjs, avec sa politique de sécurité) et le servent
//      avec tools/serve.mjs : on teste le site tel qu'il sera publié ;
//   2. lancent Chromium ;
//   3. collectent dans chaque page les erreurs de console, les erreurs JavaScript, les
//      violations de politique de sécurité et les requêtes hors de l'origine ;
//   4. font ÉCHOUER le parcours si l'une d'elles apparaît (sauf les avertissements,
//      collectés à part : un test peut vérifier qu'il y en a un attendu).
//
// Playwright n'est pas une dépendance du projet : il est fourni par l'espace de
// travail de Claude (variable PLAYWRIGHT_MODULES pour changer d'emplacement).

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportSite } from '../../tools/export.mjs';
import { startServer } from '../../tools/serve.mjs';

export { assert };

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function loadPlaywright() {
  const require = createRequire(process.env.PLAYWRIGHT_MODULES || '/opt/npm-tools/node_modules/');
  return require('playwright');
}

/** Pause réelle (les écritures sont regroupées 300 ms : attendre un peu plus). */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Exporte le site dans un dossier temporaire et le sert.
 * `demoFixture` ajoute au site exporté (jamais au projet) le widget de démonstration de
 * tests/fixtures/demo-widget : les parcours des phases 2 à 4 s'en servent pour éprouver le cadre
 * de widget (compteur, erreur provoquée) alors que le produit n'en contient plus depuis la phase 10.
 * `base` sert le site sous un sous-dossier (comme GitHub Pages) ; `url` est alors l'adresse complète.
 * @param {{ csp?: boolean, demoFixture?: boolean, base?: string, preload?: boolean }} [options]
 */
export async function startSite({ csp = true, demoFixture = false, base = '/', preload = true } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'dash-e2e-'));
  await exportSite({ root: ROOT, out: dir, csp, preload });
  if (demoFixture) {
    await cp(join(ROOT, 'tests', 'fixtures', 'demo-widget'), join(dir, 'src', 'widgets', 'demo'), { recursive: true });
    const manifest = join(dir, 'src', 'widgets', 'manifest.js');
    const text = await readFile(manifest, 'utf8');
    await writeFile(manifest, text.replace(/\n\];/, "\n  'demo',\n];"));
  }
  const server = await startServer({ dir, base });
  return {
    url: server.url,
    dir,
    async close() {
      await server.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

/**
 * Ouvre une page de l'application et branche les collecteurs.
 * @param {any} browser
 * @param {string} baseUrl
 * @param {{
 *   label?: string, query?: string, context?: any, colorScheme?: 'light'|'dark', viewport?: {width:number,height:number},
 *   init?: { fn: Function, arg?: any } | Function, waitFor?: string | null
 * }} [options]
 */
export async function openApp(browser, baseUrl, options = {}) {
  const { label = 'page', query = '', colorScheme = 'light', viewport = { width: 1280, height: 800 }, init, waitFor = 'h1.app__title' } = options;
  const context = options.context ?? (await browser.newContext({ colorScheme, viewport }));
  // Un script d'initialisation est propre à un contexte : on ne l'ajoute que s'il vient d'être créé.
  if (init && !options.context) {
    const { fn, arg } = typeof init === 'function' ? { fn: init, arg: undefined } : init;
    await context.addInitScript(fn, arg);
  }
  const page = await context.newPage();
  const log = { errors: [], warnings: [], violations: [], foreign: [], failed: [] };

  page.on('console', (m) => {
    if (m.type() === 'error') log.errors.push(m.text());
    else if (m.type() === 'warning') log.warnings.push(m.text());
  });
  page.on('pageerror', (e) => log.errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => log.failed.push(r.url()));
  page.on('request', (r) => {
    if (!r.url().startsWith(baseUrl) && !r.url().startsWith('data:')) log.foreign.push(r.url());
  });
  await page.exposeFunction('__reportCsp', (msg) => log.violations.push(msg));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__reportCsp(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });

  const session = {
    label,
    page,
    context,
    log,
    async load(extraQuery = query) {
      await page.goto(baseUrl + (extraQuery ? `?${extraQuery}` : ''));
      if (waitFor) await page.waitForSelector(waitFor);
      await page.evaluate(() => document.fonts.ready);
    },
    async reload() {
      await page.reload();
      if (waitFor) await page.waitForSelector(waitFor);
    },
  };
  await session.load();
  return session;
}

/**
 * Lance un parcours : exporte et sert le site, lance Chromium, exécute `fn`, puis
 * vérifie que ni la console ni la politique de sécurité n'ont signalé de problème.
 * @param {string} title
 * @param {(api: {
 *   site: { url: string },
 *   browser: any,
 *   step: (name: string, fn: () => Promise<void>) => Promise<void>,
 *   open: (options?: Parameters<typeof openApp>[2]) => ReturnType<typeof openApp>
 * }) => Promise<void>} fn
 * @param {{ demoFixture?: boolean, base?: string }} [options]
 */
export async function runJourney(title, fn, { demoFixture = false, base = '/' } = {}) {
  const { chromium } = loadPlaywright();
  const site = await startSite({ demoFixture, base });
  const browser = await chromium.launch();
  const sessions = [];
  const contexts = new Set();
  let failures = 0;

  const step = async (name, body) => {
    try {
      await body();
      console.log(`PASS  ${name}`);
    } catch (err) {
      failures++;
      console.log(`FAIL  ${name}\n      ${String(err.stack || err.message).split('\n').slice(0, 14).join('\n      ')}`);
    }
  };
  const open = async (options = {}) => {
    const session = await openApp(browser, site.url, options);
    sessions.push(session);
    contexts.add(session.context);
    return session;
  };

  try {
    await fn({ site, browser, step, open });
    await step('console propre : aucune erreur, aucune violation de politique de sécurité, aucune requête externe', async () => {
      for (const s of sessions) {
        assert.deepEqual(s.log.errors, [], `erreurs de console (${s.label})`);
        assert.deepEqual(s.log.violations, [], `violations de politique de sécurité (${s.label})`);
        assert.deepEqual(s.log.foreign, [], `requêtes hors de l'origine (${s.label})`);
        assert.deepEqual(s.log.failed, [], `requêtes échouées (${s.label})`);
      }
    });
  } catch (err) {
    failures++;
    console.log(`FAIL  parcours interrompu\n      ${String(err.stack || err.message).split('\n').slice(0, 14).join('\n      ')}`);
  } finally {
    for (const c of contexts) await c.close().catch(() => {});
    await browser.close();
    await site.close();
  }
  console.log(failures === 0 ? `\n${title} : OK` : `\n${title} : ${failures} échec(s)`);
  process.exit(failures === 0 ? 0 : 1);
}

/** Lit toutes les clés dash: du stockage de la page, sous forme d'objet. */
export const readStorage = (page) =>
  page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith('dash:')).sort().map((k) => [k, localStorage.getItem(k)])));
