// Parcours navigateur de la phase 10 : thème sans flash, sauvegarde (export, vidage, import,
// réinitialisation), raccourcis clavier, disposition de départ, migration 1 → 2, bandeaux,
// barrière d'erreur de la page et trois largeurs d'écran.
//
//   node tests/e2e/phase10.mjs

import { assert, readStorage, runJourney, sleep } from './helpers.mjs';
import { readFile } from 'node:fs/promises';

const SETTLE = 800; // les écritures sont regroupées 300 ms
const BG_LIGHT = 'rgb(245, 243, 240)';
const BG_DARK = 'rgb(22, 20, 18)';
const TYPES = ['clock', 'notes', 'shortcuts', 'timer', 'todo'];

await runJourney('Parcours phase 10 (thème, sauvegarde, raccourcis, finitions)', async ({ step, browser, open, site }) => {
  // --- Aides --------------------------------------------------------------------------------
  const newContext = (options = {}) => browser.newContext({ viewport: { width: 1280, height: 900 }, ...options });
  const clone = (page, expression) => page.evaluate(`JSON.parse(JSON.stringify(${expression}))`);
  const stateOf = (page) => clone(page, 'window.__dash.dashboard.getState()');
  const dataOf = (page) => clone(page, 'window.__dash.data.getState().byId');
  const widgets = (page) => page.locator('section.widget');
  const typesOf = async (page) => (await widgets(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-widget-type')))).sort();
  const startFromStarter = async (page) => {
    await page.getByRole('button', { name: 'Commencer avec une disposition type' }).click();
    await page.waitForFunction(() => document.querySelectorAll('section.widget').length === 5);
    await sleep(SETTLE);
  };
  const openBackupItem = async (page, name) => {
    await page.getByRole('button', { name: 'Sauvegarde', exact: true }).click();
    await page.getByRole('menuitem', { name }).click();
  };
  const dialogNamed = (page, name) => page.getByRole('dialog', { name });
  const closeDialog = async (page, name) => {
    await page.keyboard.press('Escape');
    await dialogNamed(page, name).waitFor({ state: 'detached' });
  };
  const toolbarEditing = (page) => page.getByRole('button', { name: 'Terminer' }).count();
  /** Les clés dash: du stockage de la page (texte brut). */
  const dashKeys = (page) => readStorage(page);
  /** Écritures de dash:* observées pendant qu'une action s'exécute : doit rester vide pour une action refusée. */
  const watchWrites = (page) =>
    page.evaluate(() => {
      window.__writes = [];
      const set = Storage.prototype.setItem;
      const remove = Storage.prototype.removeItem;
      Storage.prototype.setItem = function (k, v) { window.__writes.push(['set', k]); return set.call(this, k, v); };
      Storage.prototype.removeItem = function (k) { window.__writes.push(['remove', k]); return remove.call(this, k); };
    });
  const blurFocus = (page) => page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  const writes = (page) => page.evaluate(() => window.__writes);

  // --- Thème ----------------------------------------------------------------------------------
  await step('thème : sélecteur à trois boutons (aria-label, aria-pressed), choix enregistré et recopié dans dash:theme-mirror', async () => {
    const { page } = await open({ label: 'thème', query: 'dev=1' });
    const group = page.getByRole('group', { name: 'Thème' });
    assert.equal(await group.getByRole('button').count(), 3);
    const pressed = async () => Object.fromEntries(await Promise.all(['Clair', 'Sombre', 'Système'].map(async (n) => [n, await group.getByRole('button', { name: n }).getAttribute('aria-pressed')])));
    assert.deepEqual(await pressed(), { Clair: 'false', Sombre: 'false', Système: 'true' });
    await group.getByRole('button', { name: 'Sombre' }).click();
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark');
    assert.deepEqual(await pressed(), { Clair: 'false', Sombre: 'true', Système: 'false' });
    assert.equal(await page.evaluate(() => localStorage.getItem('dash:theme-mirror')), 'dark');
    await group.getByRole('button', { name: 'Clair' }).click();
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'light');
    assert.equal(await page.evaluate(() => localStorage.getItem('dash:theme-mirror')), 'light');
    await group.getByRole('button', { name: 'Système' }).click();
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), null);
    assert.equal(await page.evaluate(() => localStorage.getItem('dash:theme-mirror')), 'system');
    // Au clavier : Tab jusqu'au bouton, Entrée l'active.
    await group.getByRole('button', { name: 'Sombre' }).focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark');
    await sleep(SETTLE);
    assert.equal((await stateOf(page)).theme, 'dark');
  });

  await step('thème : au rechargement, la bonne couleur est là AVANT que l\'application démarre (pas de flash)', async () => {
    for (const [choice, os, expectedAttribute, expectedBackground] of [
      ['dark', 'light', 'dark', BG_DARK],
      ['light', 'dark', 'light', BG_LIGHT],
      ['system', 'dark', null, BG_DARK],
      ['system', 'light', null, BG_LIGHT],
    ]) {
      const context = await newContext({ colorScheme: os });
      // Le miroir seul suffit : theme-init.js ne lit que lui, jamais l'état asynchrone.
      await context.addInitScript((value) => {
        if (localStorage.getItem('dash:state')) return;
        localStorage.setItem('dash:theme-mirror', value);
        localStorage.setItem('dash:state', JSON.stringify({ version: 2, theme: value, preferences: { singleKeyShortcuts: true }, activePageId: 'p', pages: [{ id: 'p', name: 'Principal', instances: [] }] }));
      }, choice);
      const page = await context.newPage();
      // On retarde l'application : ce que l'on mesure est ce que l'utilisateur voit avant qu'elle ne soit là.
      await page.route('**/src/main.js', async (route) => { await sleep(900); await route.continue(); });
      await page.goto(site.url, { waitUntil: 'commit' });
      await page.waitForSelector('#app', { state: 'attached' });
      const seen = await page.evaluate(() => ({
        attribute: document.documentElement.getAttribute('data-theme'),
        background: getComputedStyle(document.body).backgroundColor,
        appReady: Boolean(document.querySelector('h1.app__title')),
      }));
      assert.equal(seen.appReady, false, 'l\'application ne doit pas encore être affichée');
      assert.equal(seen.attribute, expectedAttribute, `${choice} / système ${os}`);
      assert.equal(seen.background, expectedBackground, `${choice} / système ${os} : couleur de fond avant l'application`);
      await page.waitForSelector('h1.app__title');
      assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), expectedBackground, 'et la même une fois l\'application chargée');
      await context.close();
    }
  });

  await step('thème : le choix survit au rechargement (état et miroir), et un miroir illisible retombe sur le système', async () => {
    const session = await open({ label: 'thème rechargé', query: 'dev=1' });
    const { page } = session;
    await page.getByRole('group', { name: 'Thème' }).getByRole('button', { name: 'Sombre' }).click();
    await sleep(SETTLE);
    await session.reload();
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark');
    assert.equal(await page.getByRole('group', { name: 'Thème' }).getByRole('button', { name: 'Sombre' }).getAttribute('aria-pressed'), 'true');
    await page.evaluate(() => localStorage.setItem('dash:theme-mirror', 'violet'));
    await page.reload();
    await page.waitForSelector('h1.app__title');
    // Le miroir corrompu est ignoré par theme-init.js ; l'application remet le bon thème (celui de l'état).
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark');
    assert.equal(await page.evaluate(() => localStorage.getItem('dash:theme-mirror')), 'dark');
  });

  // --- Disposition de départ ----------------------------------------------------------------------
  await step('état vide : « Commencer avec une disposition type » ajoute Heure, À faire (à droite, deux rangées), Minuteur, Notes et Raccourcis', async () => {
    const session = await open({ label: 'départ', query: 'dev=1' });
    const { page } = session;
    assert.equal(await widgets(page).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Ajouter un widget' }).count() >= 1, true, '« Ajouter un widget » reste disponible');
    assert.deepEqual(await page.evaluate(() => window.__dash.registry.listDefinitions().map((d) => d.type)), TYPES, 'aucun widget de démonstration dans le registre');
    await startFromStarter(page);
    assert.deepEqual(await typesOf(page), TYPES);
    const instances = (await stateOf(page)).pages[0].instances;
    const layout = (type) => instances.find((i) => i.type === type).layout;
    assert.deepEqual(layout('clock'), { x: 0, y: 0, w: 4, h: 3 });
    assert.deepEqual(layout('timer'), { x: 4, y: 0, w: 4, h: 3 });
    assert.deepEqual(layout('todo'), { x: 8, y: 0, w: 4, h: 6 }, 'À faire à droite, sur deux rangées');
    assert.deepEqual(layout('notes'), { x: 0, y: 3, w: 4, h: 3 });
    assert.deepEqual(layout('shortcuts'), { x: 4, y: 3, w: 4, h: 3 });
    assert.equal(await page.getByRole('button', { name: 'Commencer avec une disposition type' }).count(), 0, 'plus d\'état vide');
    assert.ok(await page.evaluate(() => document.activeElement?.matches('section.widget')), 'le focus est sur le premier widget');
    // Persistance et rechargement.
    await session.reload();
    assert.deepEqual(await typesOf(page), TYPES);
    assert.deepEqual((await stateOf(page)).pages[0].instances.map((i) => i.layout), instances.map((i) => i.layout));
    // Chaque widget a ses données par défaut et un seul jeu de clés dash:data:*.
    const keys = Object.keys(await dashKeys(page)).filter((k) => k.startsWith('dash:data:'));
    assert.equal(keys.length, 5);
  });

  // --- Migration 1 → 2 --------------------------------------------------------------------------------
  await step('un ancien état en version 1 (sans préférences) est migré sans perte et réenregistré en version 2', async () => {
    const v1 = {
      version: 1,
      theme: 'dark',
      activePageId: 'p1',
      pages: [{ id: 'p1', name: 'Travail', instances: [{ id: 't1', type: 'todo', title: 'Courses', layout: { x: 2, y: 0, w: 5, h: 4 }, settings: { showProgress: true, doneAtBottom: false }, version: 1 }] }],
    };
    const tasks = { tasks: [{ id: 'a', text: 'Pain', done: false }, { id: 'b', text: 'Lait', done: true }] };
    const session = await open({
      label: 'migration',
      query: 'dev=1',
      init: {
        fn: (seed) => {
          if (!localStorage.getItem('dash:state')) {
            localStorage.setItem('dash:state', JSON.stringify(seed.v1));
            localStorage.setItem('dash:data:t1', JSON.stringify({ version: 1, data: seed.tasks, updatedAt: 1 }));
          }
        },
        arg: { v1, tasks },
      },
    });
    const { page } = session;
    const state = await stateOf(page);
    assert.equal(state.version, 2);
    assert.deepEqual(state.preferences, { singleKeyShortcuts: true });
    const { version: _v, preferences: _p, ...rest } = state;
    const { version: _v1, ...rest1 } = v1;
    assert.deepEqual(rest, rest1, 'aucune perte : thème, page, instance, réglages et position identiques');
    assert.equal((await dataOf(page)).t1.data.tasks.length, 2);
    assert.equal(await widgets(page).first().locator('h2.widget__title').innerText(), 'Courses');
    await sleep(SETTLE);
    const stored = JSON.parse((await dashKeys(page))['dash:state']);
    assert.equal(stored.version, 2, 'l\'état migré est réenregistré');
    assert.deepEqual(stored.preferences, { singleKeyShortcuts: true });
    assert.equal(await page.locator('.banner').count(), 0, 'aucun bandeau pour une migration réussie');
  });

  // --- Raccourcis clavier ---------------------------------------------------------------------------
  await step('raccourcis : E, A, ? et Échap hors champ de saisie', async () => {
    const { page } = await open({ label: 'raccourcis', query: 'dev=1' });
    await startFromStarter(page);
    await blurFocus(page);
    await page.keyboard.press('e');
    assert.equal(await toolbarEditing(page), 1, 'E active le mode édition');
    await page.keyboard.press('e');
    assert.equal(await toolbarEditing(page), 0, 'E le quitte');
    await page.keyboard.press('a');
    await page.getByRole('dialog', { name: /catalogue|Ajouter/i }).waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('dialog', { name: /catalogue|Ajouter/i }).waitFor({ state: 'detached' });
    await page.keyboard.press('Shift+?');
    await dialogNamed(page, 'Raccourcis clavier').waitFor();
    assert.equal(await page.getByTestId('shortcuts-help').locator('kbd').count(), 4);
    await closeDialog(page, 'Raccourcis clavier');
    // Échap ferme d'abord le panneau, puis quitte le mode édition.
    await page.keyboard.press('e');
    await page.keyboard.press('Shift+?');
    await dialogNamed(page, 'Raccourcis clavier').waitFor();
    await page.keyboard.press('Escape');
    await dialogNamed(page, 'Raccourcis clavier').waitFor({ state: 'detached' });
    assert.equal(await toolbarEditing(page), 1, 'le mode édition reste actif après la fermeture du panneau');
    await page.keyboard.press('Escape');
    assert.equal(await toolbarEditing(page), 0, 'un second Échap quitte le mode édition');
    // Boutons de la barre d'outils : aide et préférences.
    await page.getByRole('button', { name: 'Raccourcis', exact: true }).click();
    await dialogNamed(page, 'Raccourcis clavier').waitFor();
    await closeDialog(page, 'Raccourcis clavier');
  });

  await step('raccourcis : aucune réaction dans un champ de saisie, une zone de texte ou avec Ctrl / Cmd / Alt', async () => {
    const { page } = await open({ label: 'raccourcis en saisie', query: 'dev=1' });
    await startFromStarter(page);
    const task = page.getByPlaceholder('Ajouter une tâche…');
    await task.click();
    await page.keyboard.type('éa?e');
    assert.equal(await task.inputValue(), 'éa?e', 'les touches sont saisies normalement');
    assert.equal(await toolbarEditing(page), 0);
    assert.equal(await page.getByRole('dialog').count(), 0);
    await page.getByLabel('Autre durée').click();
    await page.keyboard.type('e');
    assert.equal(await toolbarEditing(page), 0);
    // Notes : une zone de texte.
    await page.getByRole('button', { name: 'Créer une note' }).click();
    await page.getByPlaceholder('Écris ici…').focus();
    await page.keyboard.type('e a ?');
    assert.equal(await toolbarEditing(page), 0);
    assert.equal(await page.getByRole('dialog').count(), 0);
    // Modificateurs.
    await blurFocus(page);
    for (const combo of ['Control+e', 'Alt+e', 'Meta+e', 'Control+a', 'Alt+a']) {
      await page.keyboard.press(combo);
    }
    assert.equal(await toolbarEditing(page), 0, 'Ctrl / Cmd / Alt + E ne font rien');
    assert.equal(await page.getByRole('dialog').count(), 0, 'Ctrl / Alt + A ne font rien');
    // Échap reste actif dans un champ : il ferme le panneau ouvert.
    await page.keyboard.press('e');
    assert.equal(await toolbarEditing(page), 1);
    await task.click({ force: true });
  });

  await step('préférences : les raccourcis à une touche se désactivent (Échap reste actif) et la préférence survit au rechargement', async () => {
    const session = await open({ label: 'préférences', query: 'dev=1' });
    const { page } = session;
    await page.getByRole('button', { name: 'Préférences', exact: true }).click();
    const dialog = dialogNamed(page, 'Préférences');
    await dialog.waitFor();
    const toggle = dialog.getByRole('switch', { name: /Raccourcis à une touche/ });
    assert.equal(await toggle.isChecked(), true);
    await toggle.click({ force: true });
    assert.equal(await toggle.isChecked(), false);
    assert.equal((await stateOf(page)).preferences.singleKeyShortcuts, false);
    await closeDialog(page, 'Préférences');
    await blurFocus(page);
    for (const key of ['e', 'a', 'Shift+?']) await page.keyboard.press(key);
    assert.equal(await toolbarEditing(page), 0);
    assert.equal(await page.getByRole('dialog').count(), 0);
    // Échap marche toujours : on entre en édition avec le bouton, Échap en sort.
    await page.getByRole('button', { name: 'Modifier la disposition' }).click();
    assert.equal(await toolbarEditing(page), 1);
    await page.keyboard.press('Escape');
    assert.equal(await toolbarEditing(page), 0);
    // L'aide le dit.
    await page.getByRole('button', { name: 'Raccourcis', exact: true }).click();
    assert.match(await dialogNamed(page, 'Raccourcis clavier').innerText(), /désactivés dans les préférences/);
    await closeDialog(page, 'Raccourcis clavier');
    await sleep(SETTLE);
    await session.reload();
    assert.equal((await stateOf(page)).preferences.singleKeyShortcuts, false);
    await page.keyboard.press('e');
    assert.equal(await toolbarEditing(page), 0, 'toujours désactivé après rechargement');
    // On réactive depuis l'aide (bouton « Préférences »).
    await page.getByRole('button', { name: 'Raccourcis', exact: true }).click();
    await dialogNamed(page, 'Raccourcis clavier').getByRole('button', { name: 'Préférences', exact: true }).click();
    await dialogNamed(page, 'Préférences').getByRole('switch').click({ force: true });
    await closeDialog(page, 'Préférences');
    await blurFocus(page);
    await page.keyboard.press('e');
    assert.equal(await toolbarEditing(page), 1, 'réactivé');
  });

  // --- Sauvegarde ------------------------------------------------------------------------------------
  /** Un dashboard rempli, avec des données de widgets modifiées. */
  async function filledDashboard(label, contextOptions = {}) {
    const context = await newContext(contextOptions);
    const session = await open({ label, query: 'dev=1', context });
    const { page } = session;
    await startFromStarter(page);
    const todoId = (await stateOf(page)).pages[0].instances.find((i) => i.type === 'todo').id;
    await page.evaluate((id) => window.__dash.data.setData(id, { tasks: [{ id: 'x1', text: 'Écrire la phase 10', done: false }, { id: 'x2', text: 'Tester', done: true }] }), todoId);
    await page.getByRole('group', { name: 'Thème' }).getByRole('button', { name: 'Sombre' }).click();
    await page.evaluate(() => localStorage.setItem('autre-site:reglage', 'à ne pas toucher'));
    await sleep(SETTLE);
    return { session, page, context, todoId };
  }

  let exported = '';
  let before;
  await step('exporter : « Copier la sauvegarde » et « Télécharger le fichier » donnent le même JSON complet', async () => {
    const { page } = await filledDashboard('export', { permissions: ['clipboard-read', 'clipboard-write'] });
    before = { state: await stateOf(page), data: await dataOf(page), keys: await dashKeys(page) };
    await openBackupItem(page, 'Exporter');
    const dialog = dialogNamed(page, 'Exporter la sauvegarde');
    await dialog.waitFor();
    const text = await dialog.getByTestId('backup-text').inputValue();
    const json = JSON.parse(text);
    assert.equal(json.app, 'dashboard-homepage');
    assert.equal(json.exportVersion, 1);
    assert.match(json.exportedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(json.state, before.state);
    assert.deepEqual(json.data, before.data);
    // Copier.
    await dialog.getByRole('button', { name: 'Copier la sauvegarde' }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="backup-message"]')?.textContent.includes('copiée'));
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), text, 'le presse-papiers contient la sauvegarde');
    // Télécharger.
    const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Télécharger le fichier' }).click()]);
    assert.match(download.suggestedFilename(), /^dashboard-homepage-\d{4}-\d{2}-\d{2}\.json$/);
    assert.equal(await readFile(await download.path(), 'utf8'), text, 'le fichier contient la sauvegarde');
    assert.match(await dialog.getByTestId('backup-message').innerText(), /Téléchargement lancé/);
    exported = text;
    await closeDialog(page, 'Exporter la sauvegarde');
  });

  await step('exporter : si la copie est refusée, le texte est sélectionné pour la copier à la main', async () => {
    const context = await newContext();
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('refusé')) }, configurable: true });
    });
    const { page } = await open({ label: 'copie refusée', query: 'dev=1', context });
    await openBackupItem(page, 'Exporter');
    const dialog = dialogNamed(page, 'Exporter la sauvegarde');
    await dialog.getByRole('button', { name: 'Copier la sauvegarde' }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="backup-message"]')?.textContent.includes('refusée'));
    const selected = await page.evaluate(() => {
      const area = document.querySelector('[data-testid="backup-text"]');
      return { focused: document.activeElement === area, from: area.selectionStart, to: area.selectionEnd, length: area.value.length };
    });
    assert.deepEqual(selected, { focused: true, from: 0, to: selected.length, length: selected.length });
    assert.ok(selected.length > 50);
  });

  await step('exporter, vider les clés dash:, importer (texte collé) : le dashboard est identique, la clé d\'un autre site est intacte', async () => {
    const context = await newContext();
    const { page, session } = await (async () => {
      const s = await open({ label: 'aller-retour', query: 'dev=1', context });
      return { page: s.page, session: s };
    })();
    await page.evaluate(() => localStorage.setItem('autre-site:reglage', 'à ne pas toucher'));
    await openBackupItem(page, 'Importer');
    const dialog = dialogNamed(page, 'Importer une sauvegarde');
    // On importe d'abord l'export fait plus haut (dashboard vide au départ).
    await dialog.getByTestId('import-text').fill(exported);
    await dialog.getByTestId('import-check').click();
    const summary = dialogNamed(page, 'Remplacer ta configuration ?');
    await summary.waitFor();
    assert.match(await summary.getByTestId('import-summary').innerText(), /1 page et\s+5 widgets/);
    const list = await summary.locator('.backup__types').innerText();
    for (const name of ['Heure : 1', 'Minuteur : 1', 'À faire : 1', 'Notes : 1', 'Raccourcis : 1']) assert.match(list, new RegExp(name));
    assert.equal(await summary.getByTestId('import-unknown').count(), 0);
    // Rien n'est remplacé avant le clic.
    assert.equal(await widgets(page).count(), 0);
    await summary.getByTestId('import-replace').click();
    await summary.waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.querySelectorAll('section.widget').length === 5);
    await sleep(SETTLE);
    assert.deepEqual(await stateOf(page), before.state, 'état identique');
    assert.deepEqual(await dataOf(page), before.data, 'données identiques');
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark', 'le thème de la sauvegarde est appliqué');
    // Exporter, VIDER toutes les clés dash:, recharger : vide. Puis réimporter : identique.
    await openBackupItem(page, 'Exporter');
    const second = await dialogNamed(page, 'Exporter la sauvegarde').getByTestId('backup-text').inputValue();
    await closeDialog(page, 'Exporter la sauvegarde');
    await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('dash:')).forEach((k) => localStorage.removeItem(k)));
    await page.evaluate(() => { window.__dash.status.setState({ readOnly: true }); }); // le rechargement ne doit rien réécrire avant lui
    await page.reload();
    await page.waitForSelector('h1.app__title');
    assert.equal(await widgets(page).count(), 0, 'dashboard vide après le vidage');
    assert.equal(await page.evaluate(() => localStorage.getItem('autre-site:reglage')), 'à ne pas toucher');
    await openBackupItem(page, 'Importer');
    await dialogNamed(page, 'Importer une sauvegarde').getByTestId('import-text').fill(second);
    await dialogNamed(page, 'Importer une sauvegarde').getByTestId('import-check').click();
    await dialogNamed(page, 'Remplacer ta configuration ?').getByTestId('import-replace').click();
    await page.waitForFunction(() => document.querySelectorAll('section.widget').length === 5);
    await sleep(SETTLE);
    assert.deepEqual(await stateOf(page), before.state);
    assert.deepEqual(await dataOf(page), before.data);
    const after = await dashKeys(page);
    for (const key of Object.keys(before.keys).filter((k) => k.startsWith('dash:data:') || k === 'dash:state')) {
      assert.deepEqual(JSON.parse(after[key]).data ?? JSON.parse(after[key]), JSON.parse(before.keys[key]).data ?? JSON.parse(before.keys[key]), key);
    }
    assert.equal(await page.evaluate(() => localStorage.getItem('autre-site:reglage')), 'à ne pas toucher', 'clé hors du préfixe dash: intacte');
    // Après rechargement, la configuration est toujours là.
    await session.reload();
    assert.deepEqual(await stateOf(page), before.state);
  });

  await step('importer un fichier .json : résumé, types inconnus signalés puis conservés, annulation possible', async () => {
    const { page } = await open({ label: 'import fichier', query: 'dev=1' });
    const backup = JSON.parse(exported);
    const ghost = { id: 'ghost-1', type: 'widget-du-futur', layout: { x: 0, y: 8, w: 3, h: 2 }, settings: { a: 1 }, version: 3 };
    backup.state.pages[0].instances.push(ghost);
    backup.data['ghost-1'] = { version: 3, data: { secret: 'conservé' }, updatedAt: 7 };
    await openBackupItem(page, 'Importer');
    const dialog = dialogNamed(page, 'Importer une sauvegarde');
    await dialog.getByTestId('import-file').setInputFiles({ name: 'ma-sauvegarde.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
    const summary = dialogNamed(page, 'Remplacer ta configuration ?');
    await summary.waitFor();
    assert.match(await summary.getByTestId('import-summary').innerText(), /6 widgets/);
    assert.match(await summary.getByTestId('import-unknown').innerText(), /widget-du-futur/);
    // Avant de remplacer : la copie de la configuration actuelle est proposée (les deux gestes).
    assert.equal(await summary.getByRole('button', { name: 'Copier la sauvegarde' }).count(), 1);
    assert.equal(await summary.getByRole('button', { name: 'Télécharger le fichier' }).count(), 1);
    await summary.getByTestId('import-replace').click();
    await page.waitForFunction(() => document.querySelectorAll('section.widget').length === 6);
    assert.equal(await page.locator('section.widget--unknown').count(), 1);
    assert.match(await page.locator('section.widget--unknown').innerText(), /Widget indisponible/);
    await sleep(SETTLE);
    const stored = await dashKeys(page);
    assert.deepEqual(JSON.parse(stored['dash:data:ghost-1']).data, { secret: 'conservé' }, 'les données du type inconnu sont conservées');
    // Annuler (bouton du message) : retour au dashboard vide d'avant.
    await page.getByRole('button', { name: 'Annuler' }).click();
    await page.waitForFunction(() => document.querySelectorAll('section.widget').length === 0);
    await sleep(SETTLE);
    assert.equal(Object.keys(await dashKeys(page)).filter((k) => k.startsWith('dash:data:')).length, 0, 'les clés de l\'import annulé sont supprimées');
    // Le menu propose aussi « Annuler le dernier remplacement » : il ramène la configuration importée.
  });

  await step('import refusé : fichier invalide, trop gros ou trop récent — message précis et rien d\'écrasé', async () => {
    const { page } = await open({ label: 'import refusé', query: 'dev=1' });
    await startFromStarter(page);
    const snapshot = { state: await stateOf(page), data: await dataOf(page), keys: await dashKeys(page) };
    await watchWrites(page);
    await openBackupItem(page, 'Importer');
    const dialog = dialogNamed(page, 'Importer une sauvegarde');
    const check = dialog.getByTestId('import-check');
    const error = dialog.getByTestId('import-error');
    const tryText = async (text, expected) => {
      await dialog.getByTestId('import-text').fill(text);
      await check.click();
      await error.waitFor();
      assert.match(await error.innerText(), expected, `message pour ${text.slice(0, 40)}`);
      assert.equal(await dialog.getByTestId('import-text').getAttribute('aria-invalid'), 'true');
      assert.equal(await dialogNamed(page, 'Remplacer ta configuration ?').count(), 0, 'pas de boîte de résumé');
    };
    const valid = JSON.parse(exported);
    await tryText('{pas du json', /n'est pas du JSON valide/);
    await tryText('{"nom":"package.json","version":"1.0.0"}', /Le fichier n'est pas une sauvegarde de Dashboard Homepage/);
    await tryText(JSON.stringify({ ...valid, exportVersion: 2 }), /version plus récente de Dashboard Homepage/);
    await tryText(JSON.stringify({ ...valid, state: { ...valid.state, version: 9 } }), /plus récente que celle de l'application/);
    await tryText(JSON.stringify({ ...valid, state: { ...valid.state, pages: [] } }), /configuration de la sauvegarde est invalide/);
    await tryText(JSON.stringify({ ...valid, data: { ...valid.data, [Object.keys(valid.data)[0]]: { version: 'x' } } }), /sont invalides/);
    // Fichier trop gros : refusé sans être lu.
    await dialog.getByTestId('import-file').setInputFiles({ name: 'gros.json', mimeType: 'application/json', buffer: Buffer.alloc(10 * 1024 * 1024 + 10, 32) });
    await page.waitForFunction(() => document.querySelector('[data-testid="import-error"]')?.textContent.includes('trop gros'));
    // Aucun écrasement : ni les stores, ni le stockage, ni aucune écriture.
    assert.deepEqual(await stateOf(page), snapshot.state);
    assert.deepEqual(await dataOf(page), snapshot.data);
    assert.deepEqual(await dashKeys(page), snapshot.keys);
    assert.deepEqual(await writes(page), [], 'aucune écriture dans le stockage');
    await closeDialog(page, 'Importer une sauvegarde');
  });

  await step('réinitialiser : confirmation après proposition de sauvegarde, seules les clés dash: sont supprimées, annulation possible', async () => {
    const { page } = await filledDashboard('réinitialisation');
    const kept = await dashKeys(page);
    await openBackupItem(page, 'Réinitialiser le dashboard');
    const dialog = dialogNamed(page, 'Réinitialiser le dashboard ?');
    await dialog.waitFor();
    assert.equal(await dialog.getByRole('button', { name: 'Copier la sauvegarde' }).count(), 1, 'la sauvegarde est proposée avant');
    assert.ok(await page.evaluate(() => document.activeElement?.textContent.trim() === 'Annuler'), 'le focus est sur « Annuler », pas sur l\'action destructrice');
    // « Annuler » ne change rien.
    await dialog.getByRole('button', { name: 'Annuler' }).click();
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await widgets(page).count(), 5);
    // Confirmer.
    await openBackupItem(page, 'Réinitialiser le dashboard');
    await dialogNamed(page, 'Réinitialiser le dashboard ?').getByTestId('reset-confirm').click();
    await page.waitForFunction(() => document.querySelectorAll('section.widget').length === 0);
    await sleep(SETTLE);
    assert.equal(await page.getByRole('button', { name: 'Commencer avec une disposition type' }).count(), 1);
    const left = Object.keys(await dashKeys(page)).sort();
    assert.deepEqual(left, ['dash:state', 'dash:theme-mirror'], 'plus aucune donnée de widget');
    assert.equal(await page.evaluate(() => localStorage.getItem('autre-site:reglage')), 'à ne pas toucher');
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark', 'le thème est conservé');
    // Annuler depuis le message.
    await page.getByRole('button', { name: 'Annuler' }).click();
    await page.waitForFunction(() => document.querySelectorAll('section.widget').length === 5);
    await sleep(SETTLE);
    const restored = await dashKeys(page);
    for (const key of Object.keys(kept).filter((k) => k.startsWith('dash:data:'))) assert.equal(JSON.parse(restored[key]).data !== undefined, true, key);
    assert.equal(Object.keys(restored).filter((k) => k.startsWith('dash:data:')).length, 5);
  });

  // --- Bandeaux ---------------------------------------------------------------------------------------
  await step('bandeaux : stockage indisponible, lecture seule, données invalides réinitialisées — avec accès à la sauvegarde', async () => {
    // Stockage indisponible : localStorage refuse tout.
    const refusing = await newContext();
    await refusing.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('refusé', 'SecurityError'); }, configurable: true });
    });
    const memory = await open({ label: 'stockage indisponible', query: 'dev=1', context: refusing });
    await memory.page.getByTestId('banner-unavailable').waitFor();
    await memory.page.getByTestId('banner-unavailable').getByRole('button', { name: 'Sauvegarder maintenant' }).click();
    await dialogNamed(memory.page, 'Exporter la sauvegarde').waitFor();
    await closeDialog(memory.page, 'Exporter la sauvegarde');

    // Lecture seule : état d'une version plus récente.
    const future = { version: 7, theme: 'light', preferences: { singleKeyShortcuts: true }, activePageId: 'p', pages: [{ id: 'p', name: 'Futur', instances: [] }] };
    const readOnly = await open({
      label: 'lecture seule',
      query: 'dev=1',
      init: { fn: (seed) => { if (!localStorage.getItem('dash:state')) localStorage.setItem('dash:state', JSON.stringify(seed)); }, arg: future },
    });
    await readOnly.page.getByTestId('banner-readonly').waitFor();
    await readOnly.page.getByTestId('banner-readonly').getByRole('button', { name: 'Sauvegarder maintenant' }).click();
    await dialogNamed(readOnly.page, 'Exporter la sauvegarde').waitFor();
    await closeDialog(readOnly.page, 'Exporter la sauvegarde');
    // Importer et réinitialiser sont refusés en lecture seule, avec l'explication.
    await openBackupItem(readOnly.page, 'Réinitialiser le dashboard');
    const dialog = dialogNamed(readOnly.page, 'Réinitialiser le dashboard ?');
    assert.ok(await dialog.getByTestId('reset-confirm').isDisabled());
    assert.match(await dialog.innerText(), /Lecture seule/);
    await closeDialog(readOnly.page, 'Réinitialiser le dashboard ?');

    // Données invalides réinitialisées : information fermable qui cite dash:backup:<id>.
    const bad = await open({
      label: 'données invalides',
      query: 'dev=1',
      init: {
        fn: () => {
          if (localStorage.getItem('dash:state')) return;
          localStorage.setItem('dash:state', JSON.stringify({ version: 2, theme: 'system', preferences: { singleKeyShortcuts: true }, activePageId: 'p', pages: [{ id: 'p', name: 'Principal', instances: [{ id: 'bad1', type: 'todo', layout: { x: 0, y: 0, w: 4, h: 4 }, settings: {}, version: 1 }] }] }));
          localStorage.setItem('dash:data:bad1', 'pas du json');
        },
      },
    });
    const notice = bad.page.getByTestId('banner-reset');
    await notice.waitFor();
    assert.match(await notice.innerText(), /dash:backup:bad1/);
    await sleep(SETTLE);
    assert.ok((await dashKeys(bad.page))['dash:backup:bad1'], 'l\'ancien contenu est gardé');
    await notice.getByRole('button', { name: 'Fermer' }).click();
    assert.equal(await bad.page.getByTestId('banner-reset').count(), 0, 'le bandeau se ferme');
    await bad.reload();
    assert.equal(await bad.page.getByTestId('banner-reset').count(), 0, 'et ne revient pas : les données sont déjà réinitialisées');

    // Stockage plein : les écritures échouent avec une erreur de quota.
    const full = await open({ label: 'stockage plein', query: 'dev=1' });
    await full.page.evaluate(() => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (String(k).startsWith('dash:data:')) throw new DOMException('quota', 'QuotaExceededError');
        return set.call(this, k, v);
      };
    });
    await full.page.getByRole('button', { name: 'Commencer avec une disposition type' }).click();
    await full.page.getByTestId('banner-full').waitFor();
    await full.page.getByTestId('banner-full').getByRole('button', { name: 'Sauvegarder maintenant' }).click();
    await dialogNamed(full.page, 'Exporter la sauvegarde').waitFor();
    // Les erreurs de quota sont attendues : on les retire des journaux contrôlés à la fin.
    for (const s of [memory, readOnly, bad, full]) {
      s.log.errors = s.log.errors.filter((e) => !/quota|Écriture impossible/i.test(e));
      s.log.warnings = [];
    }
  });

  // --- Barrière d'erreur de la page ---------------------------------------------------------------------
  await step('erreur de l\'application : écran de secours avec rechargement et accès à la sauvegarde', async () => {
    const session = await open({ label: 'erreur de page', query: 'dev=1' });
    const { page } = session;
    await startFromStarter(page);
    // Un état de bandeau abîmé fait échouer l'affichage d'un composant de l'application (hors widget).
    await page.evaluate(() => {
      try { window.__dash.status.setState({ resetNotice: { state: false, instanceIds: null } }); } catch { /* l'erreur remonte par l'affichage */ }
    });
    const fallback = page.getByTestId('page-error');
    await fallback.waitFor();
    assert.match(await fallback.innerText(), /a rencontré une erreur/);
    await fallback.getByRole('button', { name: 'Sauvegarder mes données' }).click();
    await page.getByTestId('backup-text').waitFor();
    await fallback.getByRole('button', { name: 'Recharger la page' }).click();
    await page.waitForSelector('h1.app__title');
    assert.equal(await widgets(page).count(), 5, 'après rechargement, tout est là');
    session.log.errors = session.log.errors.filter((e) => !/rencontré une erreur|Cannot read|null/.test(e));
  });

  // --- Trois largeurs d'écran -----------------------------------------------------------------------------
  for (const width of [390, 768, 1440]) {
    await step(`${width} px : aucun débordement horizontal, toutes les actions de la barre d'outils atteignables, boîtes de dialogue contenues`, async () => {
      const context = await newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
      const session = await open({ label: `${width} px`, query: 'dev=1', context });
      const { page } = session;
      const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.equal(await overflow(), 0, 'état vide');
      await startFromStarter(page);
      assert.equal(await overflow(), 0, 'disposition de départ');
      // Toutes les actions : visibles, dans la fenêtre, assez grandes pour le toucher.
      const names = ['Ajouter un widget', 'Modifier la disposition', 'Clair', 'Sombre', 'Système', 'Sauvegarde', 'Raccourcis', 'Préférences'];
      for (const name of names) {
        const button = page.getByRole('button', { name, exact: true }).first();
        await button.scrollIntoViewIfNeeded();
        const box = await button.boundingBox();
        assert.ok(box, `${name} introuvable`);
        assert.ok(box.x >= 0 && box.x + box.width <= width + 0.5, `${name} dépasse de la fenêtre : ${JSON.stringify(box)}`);
        assert.ok(box.height >= 43.5 && box.width >= 43.5, `${name} trop petit : ${JSON.stringify(box)}`);
      }
      // Chaque widget est entièrement dans la largeur.
      const boxes = await widgets(page).evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right }; }));
      for (const b of boxes) assert.ok(b.left >= 0 && b.right <= width + 0.5, JSON.stringify(b));
      // Boîtes de dialogue.
      const inside = async (name) => {
        const panel = dialogNamed(page, name);
        await panel.waitFor();
        const box = await panel.boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= width + 0.5 && box.y >= 0 && box.y + box.height <= (await page.viewportSize()).height + 0.5, `${name} : ${JSON.stringify(box)}`);
        assert.equal(await overflow(), 0, `${name} : débordement horizontal`);
      };
      await page.getByRole('button', { name: 'Raccourcis', exact: true }).click();
      await inside('Raccourcis clavier');
      await closeDialog(page, 'Raccourcis clavier');
      await openBackupItem(page, 'Exporter');
      await inside('Exporter la sauvegarde');
      await closeDialog(page, 'Exporter la sauvegarde');
      await openBackupItem(page, 'Importer');
      await inside('Importer une sauvegarde');
      await closeDialog(page, 'Importer une sauvegarde');
      await page.getByRole('button', { name: 'Préférences', exact: true }).click();
      await inside('Préférences');
      await closeDialog(page, 'Préférences');
      // Le menu Sauvegarde reste dans la fenêtre.
      await page.getByRole('button', { name: 'Sauvegarde', exact: true }).click();
      const menu = await page.getByRole('menu', { name: 'Sauvegarde' }).boundingBox();
      assert.ok(menu.x >= 0 && menu.x + menu.width <= width + 0.5, JSON.stringify(menu));
      await page.keyboard.press('Escape');
      // Sombre aussi.
      await page.getByRole('group', { name: 'Thème' }).getByRole('button', { name: 'Sombre' }).click();
      assert.equal(await overflow(), 0, 'thème sombre');
    });
  }
}, { });
