// Performance du chargement : la cascade d'imports (jusqu'à 12 niveaux de modules) est aplatie par les
// <link rel="modulepreload"> que l'export ajoute. On simule un réseau à latence fixe (chaque requête
// attend 60 ms) et on mesure le temps jusqu'au premier affichage, avec et sans pré-chargement.
//
//   node tests/e2e/phase11-perf.mjs

import { assert, loadPlaywright, startSite } from './helpers.mjs';
import { firstDisplayGraph } from '../../tools/graph.mjs';

const LATENCY = 60;
const RUNS = 3;

const { chromium } = loadPlaywright();
const browser = await chromium.launch();
let failures = 0;
const step = async (name, fn) => {
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (err) {
    failures++;
    console.log(`FAIL  ${name}\n      ${String(err.stack || err.message).split('\n').slice(0, 10).join('\n      ')}`);
  }
};

/** Temps (ms) jusqu'au titre de l'application, avec une latence fixe par requête. */
async function timeToFirstDisplay(site) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const requests = [];
  await page.route('**/*', async (route) => {
    requests.push({ url: route.request().url(), at: Date.now() });
    await new Promise((r) => setTimeout(r, LATENCY));
    await route.continue();
  });
  const start = Date.now();
  await page.goto(site.url, { waitUntil: 'commit' });
  await page.waitForSelector('h1.app__title');
  const elapsed = Date.now() - start;
  await context.close();
  return { elapsed, requests };
}

const median = (list) => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];

const withPreload = await startSite({ preload: true });
const withoutPreload = await startSite({ preload: false });
try {
  const graph = await firstDisplayGraph(withPreload.dir);
  let fast;
  let slow;
  await step(`le site exporté pré-charge les ${graph.modules.length - 1} modules du premier affichage`, async () => {
    const html = await (await fetch(withPreload.url)).text();
    const preloaded = [...html.matchAll(/<link rel="modulepreload" href="\.\/([^"]+)">/g)].map((m) => m[1]);
    assert.deepEqual([...preloaded].sort(), graph.modules.filter((m) => m !== 'src/main.js').sort());
    assert.ok(!preloaded.some((p) => /WidgetCatalog|SettingsDrawer|BackupDialog|ShortcutsHelp|RenameDialog/.test(p)), 'les panneaux à la demande ne sont pas pré-chargés');
    const plain = await (await fetch(withoutPreload.url)).text();
    assert.ok(!plain.includes('modulepreload'));
  });

  await step(`cascade aplatie : premier affichage plus rapide avec pré-chargement (latence ${LATENCY} ms par requête)`, async () => {
    const fastRuns = [];
    const slowRuns = [];
    for (let i = 0; i < RUNS; i++) {
      fastRuns.push((await timeToFirstDisplay(withPreload)).elapsed);
      slowRuns.push((await timeToFirstDisplay(withoutPreload)).elapsed);
    }
    fast = median(fastRuns);
    slow = median(slowRuns);
    console.log(`      sans pré-chargement : ${slow} ms (médiane de ${RUNS}) ; avec : ${fast} ms ; chaîne de ${graph.longestChain.length} niveaux`);
    assert.ok(fast < slow * 0.7, `le pré-chargement devrait gagner au moins 30 % (${fast} ms contre ${slow} ms)`);
    // Avec pré-chargement, le temps ne dépend plus de la profondeur : au plus environ 4 allers-retours
    // (page, modules, polices et styles, données) en plus du temps de calcul.
    assert.ok(fast < 4 * LATENCY + 1500, `premier affichage trop long : ${fast} ms`);
  });

  await step('chaque fichier est demandé une seule fois au premier affichage', async () => {
    const { requests } = await timeToFirstDisplay(withPreload);
    const urls = requests.map((r) => r.url);
    const duplicates = urls.filter((u, i) => urls.indexOf(u) !== i);
    assert.deepEqual(duplicates, [], 'chaque fichier est demandé une seule fois');
    const jsCount = urls.filter((u) => u.endsWith('.js')).length;
    assert.ok(jsCount >= graph.modules.length, `modules demandés : ${jsCount}`);
  });

  await step('chargement différé : le catalogue, les réglages, la sauvegarde et l\'aide ne sont demandés qu\'à l\'ouverture', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    // Sans temps d'inactivité, le pré-chargement d'arrière-plan ne se déclenche jamais : on voit le chargement à la demande.
    await context.addInitScript(() => { window.requestIdleCallback = () => 0; });
    const page = await context.newPage();
    const requested = [];
    page.on('request', (r) => requested.push(new URL(r.url()).pathname));
    await page.goto(withPreload.url + '?dev=1');
    await page.waitForSelector('h1.app__title');
    const has = (name) => requested.some((p) => p.endsWith(name));
    for (const name of ['WidgetCatalog.js', 'SettingsDrawer.js', 'BackupDialog.js', 'ShortcutsHelp.js', 'RenameDialog.js', 'exportImport.js', 'ClockSettings.js', 'ShortcutForm.js']) {
      assert.equal(has(name), false, `${name} ne devrait pas être chargé au premier affichage`);
    }
    await page.getByRole('button', { name: 'Ajouter un widget', exact: true }).first().click();
    await page.getByRole('dialog').waitFor();
    assert.equal(has('WidgetCatalog.js'), true, 'le catalogue est chargé à l\'ouverture');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Raccourcis', exact: true }).click();
    await page.getByRole('dialog', { name: 'Raccourcis clavier' }).waitFor();
    assert.equal(has('ShortcutsHelp.js'), true);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Sauvegarde', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Exporter' }).click();
    await page.getByRole('dialog', { name: 'Exporter la sauvegarde' }).waitFor();
    assert.equal(has('BackupDialog.js') && has('exportImport.js'), true);
    await page.keyboard.press('Escape');
    // Réglages d'un widget : le panneau du widget n'arrive qu'à ce moment-là.
    const id = await page.evaluate(() => window.__dash.actions.addWidget('clock'));
    const w = page.locator(`section.widget[data-instance-id="${id}"]`);
    await w.hover();
    await w.getByRole('button', { name: 'Options de Heure' }).click();
    await page.getByRole('menuitem', { name: 'Réglages' }).click();
    await page.getByRole('dialog', { name: /Réglages/ }).waitFor();
    assert.equal(has('SettingsDrawer.js') && has('ClockSettings.js'), true);
    // Et le focus est bien sur le premier réglage, pas sur le bouton de fermeture.
    assert.equal(await page.evaluate(() => !!document.activeElement?.closest('.modal__body')), true, 'focus dans les réglages');
    await context.close();
  });
} finally {
  await browser.close();
  await withPreload.close();
  await withoutPreload.close();
}
console.log(failures === 0 ? '\nParcours phase 11 (performance) : OK' : `\nParcours phase 11 (performance) : ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
