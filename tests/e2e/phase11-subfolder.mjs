// Le site servi sous un sous-dossier, comme sur GitHub Pages : https://<utilisateur>.github.io/<dépôt>/.
// Le serveur (tools/serve.mjs --base) répond 404 à tout ce qui est demandé hors de /dashboard-homepage/ :
// une adresse absolue oubliée se verrait immédiatement (ressource introuvable, erreur en console).
//
//   node tests/e2e/phase11-subfolder.mjs

import { assert, readStorage, runJourney, sleep } from './helpers.mjs';

const BASE = '/dashboard-homepage/';

await runJourney('Parcours phase 11 (sous-dossier /dashboard-homepage/)', async ({ step, open, site }) => {
  await step('l\'adresse de test est bien sous le sous-dossier', async () => {
    assert.ok(site.url.endsWith(BASE), site.url);
    const origin = new URL(site.url).origin;
    assert.equal((await fetch(origin + '/')).status, 404, 'rien à la racine du serveur');
    assert.equal((await fetch(origin + '/src/main.js')).status, 404, 'les adresses absolues ne trouveraient rien');
    assert.equal((await fetch(site.url + 'src/main.js')).status, 200);
  });

  await step('le dashboard s\'affiche, chaque ressource vient du sous-dossier (polices, styles, modules, icône)', async () => {
    const session = await open({ label: 'sous-dossier', query: 'dev=1' });
    const { page, log } = session;
    assert.equal(new URL(page.url()).pathname, BASE);
    assert.equal(await page.title(), 'Dashboard Homepage');
    assert.equal(await page.locator('h1.app__title').count(), 1);
    assert.equal(await page.locator('.dashboard__empty').count(), 1);
    const fonts = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family}`));
    assert.ok(fonts.length > 0, 'les polices auto-hébergées sont chargées');
    const iconHref = await page.evaluate(() => document.querySelector('link[rel="icon"]').href);
    assert.equal(new URL(iconHref).pathname, BASE + 'favicon.svg');
    assert.equal((await fetch(iconHref)).status, 200);
    assert.deepEqual(log.foreign, []);
    assert.deepEqual(log.failed, []);
  });

  await step('une modification est conservée après rechargement, sous le sous-dossier', async () => {
    const session = await open({ label: 'persistance', query: 'dev=1' });
    const { page } = session;
    await page.getByRole('button', { name: 'Commencer avec une disposition type' }).click();
    await page.waitForFunction(() => document.querySelectorAll('section.widget').length === 5);
    const todo = page.locator('section.widget[data-widget-type="todo"]');
    await todo.getByLabel('Nouvelle tâche').fill('Vérifier le sous-dossier');
    await todo.getByLabel('Nouvelle tâche').press('Enter');
    await page.getByRole('group', { name: 'Thème' }).getByRole('button', { name: 'Sombre' }).click();
    await sleep(800);
    await session.reload();
    assert.equal(await page.locator('section.widget').count(), 5);
    assert.deepEqual(await todo.locator('.todo__text').allInnerTexts(), ['Vérifier le sous-dossier']);
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark');
    const keys = Object.keys(await readStorage(page));
    assert.ok(keys.includes('dash:state') && keys.includes('dash:theme-mirror'));
  });

  await step('le chargement différé et les feuilles de style des widgets passent aussi par le sous-dossier', async () => {
    const { page, log } = await open({ label: 'widgets', query: 'dev=1' });
    await page.getByRole('button', { name: 'Ajouter un widget', exact: true }).first().click();
    const catalog = page.getByRole('dialog').or(page.locator('.drawer'));
    await catalog.first().waitFor();
    await page.keyboard.press('Escape');
    for (const type of ['clock', 'notes', 'shortcuts', 'timer', 'todo']) {
      await page.evaluate((t) => window.__dash.actions.addWidget(t), type);
    }
    await page.waitForFunction(() => document.querySelectorAll('section.widget').length === 5);
    const sheets = await page.evaluate(() => [...document.styleSheets].map((s) => s.href).filter(Boolean));
    assert.ok(sheets.length >= 6, `feuilles de style chargées : ${sheets.length}`);
    for (const href of sheets) assert.equal(new URL(href).pathname.startsWith(BASE), true, href);
    assert.deepEqual(log.failed, []);
  });
}, { base: BASE });
