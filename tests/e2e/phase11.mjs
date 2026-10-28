// Parcours de bout en bout de la phase 11 (site exporté, servi par tools/serve.mjs, Chromium) :
//   (a) deux widgets À faire, listes différentes, rechargement ;
//   (b) déplacer et redimensionner au clavier, rechargement ;
//   (c) Notes : taper, recharger immédiatement ;
//   (d) export, vidage des clés dash:, import : état identique ;
//   (e) minuteur d'une minute avec page.clock : « Terminé à HH:MM » ;
//   (f) Raccourcis : adresse valide ajoutée, javascript:alert(1) refusée ;
//   (g) thème sombre persistant ;
//   + rendus : avec 20 widgets, saisir dans Notes ne refait pas le rendu des 19 autres ;
//   + stockage : seules des clés dash: sont écrites, localStorage.clear() n'est jamais appelé.
//
//   node tests/e2e/phase11.mjs

import { assert, readStorage, runJourney, sleep } from './helpers.mjs';

const SETTLE = 800; // les écritures sont regroupées 300 ms
const T0 = new Date('2026-10-27T14:00:00');

await runJourney('Parcours phase 11 (bout en bout)', async ({ step, browser, open }) => {
  const clone = (page, expression) => page.evaluate(`JSON.parse(JSON.stringify(${expression}))`);
  const stateOf = (page) => clone(page, 'window.__dash.dashboard.getState()');
  const dataOf = (page) => clone(page, 'window.__dash.data.getState().byId');
  const widgetsOf = (page, type) => page.locator(`section.widget[data-widget-type="${type}"]`);
  const addWidget = async (page, type) => {
    const id = await page.evaluate((t) => window.__dash.actions.addWidget(t), type);
    await page.locator(`section.widget[data-instance-id="${id}"]`).waitFor();
    return id;
  };
  const layoutOf = async (page, id) => (await stateOf(page)).pages[0].instances.find((i) => i.id === id).layout;
  const tasksOf = (w) => w.locator('.todo__text').allInnerTexts();
  const newContext = (options = {}) => browser.newContext({ viewport: { width: 1280, height: 900 }, ...options });

  // (a) ---------------------------------------------------------------------------------------
  await step('(a) deux listes À faire différentes : intactes après rechargement', async () => {
    const session = await open({ label: 'a', query: 'dev=1' });
    const { page } = session;
    const first = await addWidget(page, 'todo');
    const second = await addWidget(page, 'todo');
    const lists = [['Pain', 'Lait', 'Œufs'], ['Appeler le garage', 'Payer la facture']];
    for (const [index, items] of lists.entries()) {
      const w = widgetsOf(page, 'todo').nth(index);
      for (const text of items) {
        await w.getByLabel('Nouvelle tâche').fill(text);
        await w.getByLabel('Nouvelle tâche').press('Enter');
      }
    }
    await widgetsOf(page, 'todo').nth(0).getByRole('checkbox').first().check();
    await sleep(SETTLE);
    const read = async () => Promise.all([0, 1].map(async (i) => ({ tasks: await tasksOf(widgetsOf(page, 'todo').nth(i)), done: await widgetsOf(page, 'todo').nth(i).getByRole('checkbox', { checked: true }).count() })));
    const before = await read();
    // La tâche cochée descend en bas de sa liste : on compare le contenu, pas l'ordre.
    assert.deepEqual(before.map((b) => [...b.tasks].sort()), lists.map((l) => [...l].sort()));
    assert.deepEqual(before.map((b) => b.done), [1, 0]);
    await session.reload();
    assert.deepEqual(await read(), before, 'listes identiques après rechargement');
    const data = await dataOf(page);
    assert.notDeepEqual(data[first].data.tasks, data[second].data.tasks, 'chaque instance a ses propres données');
    assert.equal(Object.keys(await readStorage(page)).filter((k) => k.startsWith('dash:data:')).length, 2);
  });

  // (b) ---------------------------------------------------------------------------------------
  await step('(b) déplacer et redimensionner au clavier : la disposition survit au rechargement', async () => {
    const session = await open({ label: 'b', query: 'dev=1' });
    const { page } = session;
    const id = await addWidget(page, 'notes');
    const w = page.locator(`section.widget[data-instance-id="${id}"]`);
    await page.getByRole('button', { name: 'Modifier la disposition' }).click();
    const grip = w.getByRole('button', { name: /^Déplacer / });
    await grip.focus();
    const start = await layoutOf(page, id);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowDown');
    await sleep(SETTLE);
    const moved = await layoutOf(page, id);
    assert.equal(moved.x, start.x + 2, 'déplacé de 2 colonnes');
    assert.ok(moved.y >= start.y, 'ligne');
    assert.equal(moved.w, start.w + 1, 'élargi d\'une colonne');
    assert.equal(moved.h, start.h + 1, 'allongé d\'une ligne');
    assert.match(await w.getByTestId('placement').innerText(), /colonne|ligne/i, 'la position est annoncée');
    await session.reload();
    assert.deepEqual(await layoutOf(page, id), moved, 'disposition conservée après rechargement');
    const box = await page.locator(`section.widget[data-instance-id="${id}"]`).boundingBox();
    assert.ok(box.width > 300, 'et réellement affichée');
  });

  // (c) ---------------------------------------------------------------------------------------
  await step('(c) Notes : taper puis recharger immédiatement, le texte est là', async () => {
    const session = await open({ label: 'c', query: 'dev=1' });
    const { page } = session;
    await addWidget(page, 'notes');
    const w = widgetsOf(page, 'notes').first();
    await w.getByRole('button', { name: 'Créer une note' }).click();
    const text = 'Réunion de jeudi : préparer le budget — 2 versions.';
    await page.getByPlaceholder('Écris ici…').pressSequentially(text);
    await page.reload(); // aucune pause : l'écriture est forcée à la fermeture de la page
    await page.waitForSelector('h1.app__title');
    assert.equal(await page.getByPlaceholder('Écris ici…').inputValue(), text);
  });

  // (d) ---------------------------------------------------------------------------------------
  await step('(d) export, vidage des clés dash:, import : état et données identiques', async () => {
    const context = await newContext();
    const session = await open({ label: 'd', query: 'dev=1', context });
    const { page } = session;
    await page.getByRole('button', { name: 'Commencer avec une disposition type' }).click();
    await page.waitForFunction(() => document.querySelectorAll('section.widget').length === 5);
    const todoId = (await stateOf(page)).pages[0].instances.find((i) => i.type === 'todo').id;
    await page.evaluate((id) => window.__dash.data.setData(id, { tasks: [{ id: 't1', text: 'Tester l\'export', done: true }] }), todoId);
    await page.getByRole('group', { name: 'Thème' }).getByRole('button', { name: 'Sombre' }).click();
    await page.evaluate(() => localStorage.setItem('autre-site:cle', 'intacte'));
    await sleep(SETTLE);
    const before = { state: await stateOf(page), data: await dataOf(page) };
    await page.getByRole('button', { name: 'Sauvegarde', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Exporter' }).click();
    const text = await page.getByRole('dialog', { name: 'Exporter la sauvegarde' }).getByTestId('backup-text').inputValue();
    await page.keyboard.press('Escape');
    await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('dash:')).forEach((k) => localStorage.removeItem(k)));
    await page.evaluate(() => { window.__dash.status.setState({ readOnly: true }); }); // le rechargement ne réécrit rien avant l'import
    await page.reload();
    await page.waitForSelector('h1.app__title');
    assert.equal(await page.locator('section.widget').count(), 0, 'dashboard vide après le vidage');
    await page.getByRole('button', { name: 'Sauvegarde', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Importer' }).click();
    const dialog = page.getByRole('dialog', { name: 'Importer une sauvegarde' });
    await dialog.getByTestId('import-text').fill(text);
    await dialog.getByTestId('import-check').click();
    await page.getByRole('dialog', { name: 'Remplacer ta configuration ?' }).getByTestId('import-replace').click();
    await page.waitForFunction(() => document.querySelectorAll('section.widget').length === 5);
    await sleep(SETTLE);
    assert.deepEqual(await stateOf(page), before.state);
    assert.deepEqual(await dataOf(page), before.data);
    assert.equal(await page.evaluate(() => localStorage.getItem('autre-site:cle')), 'intacte');
    await session.reload();
    assert.deepEqual(await stateOf(page), before.state, 'et toujours identique après rechargement');
  });

  // (e) ---------------------------------------------------------------------------------------
  await step('(e) minuteur d\'une minute (page.clock) : se termine et affiche « Terminé à HH:MM »', async () => {
    const context = await newContext();
    await context.addInitScript(() => {
      // Pas de vraie sortie audio dans le test : un AudioContext minimal suffit.
      const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} });
      window.AudioContext = class {
        constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
        resume() { return Promise.resolve(); }
        close() { return Promise.resolve(); }
        createOscillator() { return { type: '', frequency: param(), connect() {}, disconnect() {}, start() {}, stop() {}, addEventListener() {} }; }
        createGain() { return { gain: param(), connect() {}, disconnect() {} }; }
      };
    });
    await context.clock.install({ time: T0 });
    const { page } = await open({ label: 'e', query: 'dev=1', context });
    await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 1000));
    await page.evaluate(() => window.__dash.actions.addWidget('timer'));
    await page.clock.runFor(100);
    const w = widgetsOf(page, 'timer').first();
    await w.getByRole('button', { name: '1 min', exact: true }).click();
    await w.locator('.timer__primary').click();
    await page.clock.runFor(0);
    await page.clock.runFor(30_000);
    await page.clock.runFor(50);
    assert.equal((await w.locator('[data-testid="timer-time"]').textContent()).trim(), '00:30');
    await page.clock.runFor(31_000);
    await page.clock.runFor(100);
    assert.equal(await w.locator('.timer').getAttribute('data-status'), 'done');
    assert.match((await w.locator('[data-testid="timer-done"]').textContent()).trim(), /^Terminé à 14:01$/);
  });

  // (f) ---------------------------------------------------------------------------------------
  await step('(f) Raccourcis : une adresse valide est ajoutée, javascript:alert(1) est refusée', async () => {
    const { page } = await open({ label: 'f', query: 'dev=1' });
    await addWidget(page, 'shortcuts');
    const w = widgetsOf(page, 'shortcuts').first();
    await w.getByRole('button', { name: 'Ajouter un raccourci' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Ajouter un raccourci' });
    await dialog.getByLabel('Adresse').fill('javascript:alert(1)');
    await dialog.getByLabel('Adresse').press('Enter');
    assert.match(await dialog.getByRole('alert').first().innerText(), /Adresse invalide : seules les adresses http et https sont acceptées/);
    assert.equal(await w.locator('a[href^="javascript"]').count(), 0);
    await dialog.getByLabel('Adresse').fill('example.org');
    await dialog.getByLabel('Adresse').press('Enter');
    await dialog.waitFor({ state: 'detached' });
    const link = w.locator('a[href="https://example.org"]');
    assert.equal(await link.count(), 1);
    assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');
    const stored = (await dataOf(page));
    assert.ok(!JSON.stringify(stored).includes('javascript:'), 'rien de dangereux n\'est enregistré');
  });

  // (g) ---------------------------------------------------------------------------------------
  await step('(g) thème sombre persistant', async () => {
    const session = await open({ label: 'g', query: 'dev=1' });
    const { page } = session;
    await page.getByRole('group', { name: 'Thème' }).getByRole('button', { name: 'Sombre' }).click();
    await sleep(SETTLE);
    await session.reload();
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark');
    assert.equal(await page.getByRole('group', { name: 'Thème' }).getByRole('button', { name: 'Sombre' }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(22, 20, 18)');
  });

  // Rendus ------------------------------------------------------------------------------------
  await step('rendus : avec 20 widgets, saisir dans Notes ne refait le rendu d\'aucun des 19 autres', async () => {
    const { page } = await open({ label: 'rendus', query: 'dev=1', context: await newContext({ viewport: { width: 1600, height: 1000 } }) });
    const notesId = await addWidget(page, 'notes');
    const others = [];
    for (let i = 0; i < 19; i++) others.push(await addWidget(page, i % 3 === 0 ? 'todo' : i % 3 === 1 ? 'shortcuts' : 'timer'));
    assert.equal(await page.locator('section.widget').count(), 20);
    await page.locator(`section.widget[data-instance-id="${notesId}"]`).getByRole('button', { name: 'Créer une note' }).click();
    await sleep(600);
    const before = await page.evaluate(() => ({ ...window.__dash.renders }));
    assert.equal(Object.keys(before).length, 20, 'chaque cadre a été rendu au moins une fois');
    await page.getByPlaceholder('Écris ici…').pressSequentially('Saisie pendant que 19 autres widgets restent immobiles.', { delay: 5 });
    await sleep(SETTLE);
    const after = await page.evaluate(() => ({ ...window.__dash.renders }));
    const grown = others.filter((id) => after[id] !== before[id]).map((id) => `${id}: ${before[id]} → ${after[id]}`);
    assert.deepEqual(grown, [], 'aucun des 19 autres widgets n\'a refait son rendu');
    assert.ok(after[notesId] > before[notesId], 'le widget Notes, lui, est bien rendu');
    console.log(`      rendus du widget Notes : ${before[notesId]} → ${after[notesId]} pour 54 frappes ; autres : inchangés`);
  });

  // Stockage ----------------------------------------------------------------------------------
  await step('stockage : seules des clés dash: sont écrites ou supprimées, localStorage.clear() n\'est jamais appelé', async () => {
    const context = await newContext();
    await context.addInitScript(() => {
      window.__ops = [];
      const set = Storage.prototype.setItem;
      const remove = Storage.prototype.removeItem;
      Storage.prototype.setItem = function (k, v) { window.__ops.push(['set', String(k)]); return set.call(this, k, v); };
      Storage.prototype.removeItem = function (k) { window.__ops.push(['remove', String(k)]); return remove.call(this, k); };
      Storage.prototype.clear = function () { window.__ops.push(['clear', '*']); };
    });
    const session = await open({ label: 'stockage', query: 'dev=1', context });
    const { page } = session;
    await page.getByRole('button', { name: 'Commencer avec une disposition type' }).click();
    await page.waitForFunction(() => document.querySelectorAll('section.widget').length === 5);
    await page.getByRole('group', { name: 'Thème' }).getByRole('button', { name: 'Sombre' }).click();
    await sleep(SETTLE);
    // Import puis réinitialisation, les deux actions qui touchent plusieurs clés.
    await page.getByRole('button', { name: 'Sauvegarde', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Exporter' }).click();
    const text = await page.getByRole('dialog', { name: 'Exporter la sauvegarde' }).getByTestId('backup-text').inputValue();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Sauvegarde', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Importer' }).click();
    const dialog = page.getByRole('dialog', { name: 'Importer une sauvegarde' });
    await dialog.getByTestId('import-text').fill(text);
    await dialog.getByTestId('import-check').click();
    await page.getByRole('dialog', { name: 'Remplacer ta configuration ?' }).getByTestId('import-replace').click();
    await sleep(SETTLE);
    await page.getByRole('button', { name: 'Sauvegarde', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Réinitialiser le dashboard' }).click();
    await page.getByTestId('reset-confirm').click();
    await sleep(SETTLE);
    const ops = await page.evaluate(() => window.__ops);
    assert.ok(ops.length > 10, 'des écritures ont bien été observées');
    assert.deepEqual(ops.filter(([, key]) => !key.startsWith('dash:')), [], 'aucune clé hors du préfixe dash:');
  });
});
