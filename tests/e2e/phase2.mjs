// Parcours navigateur de la phase 2 : contrat de widget, registre, cadre de widget.
//
//   node tests/e2e/phase2.mjs
//
// Le widget de démonstration est ajouté deux fois ; on vérifie l'indépendance des données,
// la persistance, la barrière d'erreur, le type inconnu et le repli sur contenu invalide.

import { assert, readStorage, runJourney, sleep } from './helpers.mjs';

const SETTLE = 600; // les écritures sont regroupées 300 ms

await runJourney('Parcours phase 2', async ({ step, open }) => {
  const first = await open({ label: 'démos', query: 'dev=1' });
  const { page, log } = first;
  const demos = page.locator('section.widget[data-widget-type="demo"]');
  const count = (n) => demos.nth(n).locator('[data-testid="demo-count"]');
  const renders = async (n) => Number(await demos.nth(n).locator('[data-testid="demo-renders"]').innerText());
  const instanceIds = () => page.evaluate(() => window.__dash.dashboard.getState().pages[0].instances.map((i) => i.id));
  const ids = [];

  await step('le registre contient les widgets du manifeste (Heure, Notes, Raccourcis, Minuteur, À faire, Démo), sans erreur de chargement', async () => {
    const r = await page.evaluate(() => ({
      types: window.__dash.registry.listDefinitions().map((d) => d.type),
      errors: window.__dash.registry.registryErrors(),
    }));
    assert.deepEqual(r, { types: ['clock', 'notes', 'shortcuts', 'timer', 'todo', 'demo'], errors: [] });
  });

  await step('sans ?dev=1 : ni __dash, ni bouton « Provoquer une erreur »', async () => {
    const plain = await open({ label: 'sans dev', context: first.context });
    assert.equal(await plain.page.evaluate(() => typeof window.__dash), 'undefined');
    await plain.page.close();
  });

  const addDemo = () => page.evaluate(() => window.__dash.actions.addWidget('demo'));

  await step('ajouter la démo affiche le widget de démonstration dans son cadre', async () => {
    assert.equal(await demos.count(), 0);
    await addDemo();
    assert.equal(await demos.count(), 1);
    const frame = demos.first();
    assert.equal((await frame.locator('h2.widget__title').innerText()).trim(), 'Démo');
    assert.equal(await frame.locator('.widget__bar > svg[aria-hidden="true"]').count(), 1);
    assert.equal((await frame.locator('.demo__label').innerText()).trim(), 'Compteur');
    assert.equal((await count(0).innerText()).trim(), '0');
    assert.equal(await frame.evaluate((el) => getComputedStyle(el).borderRadius), '20px');
    // Le titre nomme la région pour les lecteurs d'écran.
    const labelledBy = await frame.getAttribute('aria-labelledby');
    assert.equal(await page.locator(`#${labelledBy}`).innerText(), 'Démo');
  });

  await step('la feuille de style du widget est chargée une seule fois, même avec deux instances', async () => {
    await addDemo();
    assert.equal(await demos.count(), 2);
    await page.waitForFunction(() => document.querySelector('link[data-widget-style]')?.sheet);
    assert.equal(await page.locator('link[data-widget-style]').count(), 1);
    // La mise en page de la démo vient de cette feuille.
    assert.equal(await demos.first().locator('.demo__count').evaluate((el) => getComputedStyle(el).fontSize), '40px');
    ids.push(...(await instanceIds()));
    assert.equal(ids.length, 2);
    assert.notEqual(ids[0], ids[1]);
  });

  await step('boutons d\'au moins 44 px et « Provoquer une erreur » visible seulement avec ?dev=1', async () => {
    for (const name of ['+1', 'Remise à zéro', 'Provoquer une erreur']) {
      const box = await demos.first().getByRole('button', { name, exact: true }).boundingBox();
      assert.ok(box && box.height >= 44 && box.width >= 44, `${name} : ${JSON.stringify(box)}`);
    }
  });

  await step('incrémenter l\'une ne change pas l\'autre', async () => {
    const plusOne = (n) => demos.nth(n).getByRole('button', { name: '+1', exact: true });
    await plusOne(0).click();
    await plusOne(0).click();
    await plusOne(0).click();
    await plusOne(1).click();
    assert.equal((await count(0).innerText()).trim(), '3');
    assert.equal((await count(1).innerText()).trim(), '1');
  });

  await step('incrémenter une démo ne redessine pas l\'autre (compteur de rendus)', async () => {
    const before = [await renders(0), await renders(1)];
    for (let i = 0; i < 4; i++) await demos.nth(0).getByRole('button', { name: '+1', exact: true }).click();
    const after = [await renders(0), await renders(1)];
    assert.equal(after[0], before[0] + 4, `rendus de la démo 1 : ${before[0]} → ${after[0]}`);
    assert.equal(after[1], before[1], `rendus de la démo 2 : ${before[1]} → ${after[1]}`);
    console.log(`      rendus (démo 1, démo 2) : ${before.join(', ')} → ${after.join(', ')}`);
    assert.equal((await count(0).innerText()).trim(), '7');
  });

  await step('modifier un réglage d\'une instance ne redessine pas l\'autre', async () => {
    const before = await renders(1);
    await page.evaluate((id) => window.__dash.dashboard.updateInstanceSettings(id, { label: 'Autre' }), ids[0]);
    await demos.first().locator('.demo__label', { hasText: 'Autre' }).waitFor();
    assert.equal(await renders(1), before);
    await page.evaluate((id) => window.__dash.dashboard.updateInstanceSettings(id, { label: 'Compteur' }), ids[0]);
  });

  await step('une clé dash:data:<id> par instance, et les deux compteurs survivent à un rechargement', async () => {
    await sleep(SETTLE);
    const storage = await readStorage(page);
    assert.deepEqual(
      Object.keys(storage).filter((k) => k.startsWith('dash:data:')).sort(),
      ids.map((id) => `dash:data:${id}`).sort(),
    );
    assert.equal(JSON.parse(storage[`dash:data:${ids[0]}`]).data.count, 7);
    assert.equal(JSON.parse(storage[`dash:data:${ids[1]}`]).data.count, 1);
    await first.reload();
    assert.equal(await demos.count(), 2);
    assert.equal((await count(0).innerText()).trim(), '7');
    assert.equal((await count(1).innerText()).trim(), '1');
    assert.deepEqual(await instanceIds(), ids);
  });

  await step('« Remise à zéro » ne remet à zéro que son instance', async () => {
    await demos.nth(1).getByRole('button', { name: 'Remise à zéro' }).click();
    assert.equal((await count(1).innerText()).trim(), '0');
    assert.equal((await count(0).innerText()).trim(), '7');
    await demos.nth(1).getByRole('button', { name: '+1', exact: true }).click();
  });

  await step('« Provoquer une erreur » : bloc de secours dans ce cadre seul, l\'autre widget continue', async () => {
    await demos.nth(0).getByRole('button', { name: 'Provoquer une erreur' }).click();
    const alert = demos.nth(0).locator('.widget__error');
    await alert.waitFor();
    assert.match(await alert.innerText(), /Ce widget a rencontré une erreur\./);
    assert.match(await alert.innerText(), /Erreur provoquée volontairement/);
    // Le titre du cadre reste affiché ; l'autre cadre est intact et réagit.
    assert.equal((await demos.nth(0).locator('h2.widget__title').innerText()).trim(), 'Démo');
    assert.equal(await demos.nth(1).locator('.widget__error').count(), 0);
    await demos.nth(1).getByRole('button', { name: '+1', exact: true }).click();
    assert.equal((await count(1).innerText()).trim(), '2');
    // L'erreur est journalisée (attendue ici) : on la retire du journal que le parcours contrôle à la fin.
    const expected = log.errors.filter((e) => e.includes('a planté'));
    assert.equal(expected.length, 1, JSON.stringify(log.errors));
    log.errors = log.errors.filter((e) => !e.includes('a planté'));
  });

  await step('« Réinitialiser ce widget » : copie de l\'ancien contenu dans dash:backup:<id>, données par défaut', async () => {
    await demos.nth(0).getByRole('button', { name: 'Réinitialiser ce widget' }).click();
    await demos.nth(0).locator('[data-testid="demo-count"]').waitFor();
    assert.equal(await demos.nth(0).locator('.widget__error').count(), 0);
    assert.equal((await count(0).innerText()).trim(), '0');
    assert.equal((await count(1).innerText()).trim(), '2');
    await sleep(SETTLE);
    const storage = await readStorage(page);
    const backup = JSON.parse(storage[`dash:backup:${ids[0]}`]);
    assert.equal(backup.data.count, 7);
    assert.equal(JSON.parse(storage[`dash:data:${ids[0]}`]).data.count, 0);
  });

  // --- Type inconnu ------------------------------------------------------------------------
  /** Modifie un champ d'une instance directement dans dash:state, comme le ferait un utilisateur. */
  const editInstance = (index, field, value) =>
    page.evaluate(
      ([i, f, v]) => {
        const state = JSON.parse(localStorage.getItem('dash:state'));
        state.pages[0].instances[i][f] = v;
        localStorage.setItem('dash:state', JSON.stringify(state));
      },
      [index, field, value],
    );

  await step('type d\'instance remplacé par « inexistant » : « Widget indisponible » et clé de données conservée', async () => {
    await sleep(SETTLE);
    const dataBefore = (await readStorage(page))[`dash:data:${ids[1]}`];
    await editInstance(1, 'type', 'inexistant');
    await first.reload();
    const unknown = page.locator(`section.widget--unknown[data-instance-id="${ids[1]}"]`);
    await unknown.waitFor();
    assert.match(await unknown.innerText(), /Widget indisponible/);
    assert.match(await unknown.innerText(), /inexistant/);
    assert.equal(await demos.count(), 1);
    await sleep(SETTLE);
    const storage = await readStorage(page);
    assert.equal(storage[`dash:data:${ids[1]}`], dataBefore, 'les données de l\'instance inconnue ont été modifiées');
    assert.equal(JSON.parse(storage['dash:state']).pages[0].instances[1].type, 'inexistant');
  });

  await step('le type revient : le widget réapparaît avec ses données', async () => {
    await editInstance(1, 'type', 'demo');
    await first.reload();
    assert.equal(await demos.count(), 2);
    assert.equal((await count(1).innerText()).trim(), '2');
  });

  // --- Contenu invalide --------------------------------------------------------------------
  await step('données qui ne passent pas le schéma : le widget affiche les valeurs par défaut, copie dans dash:backup:<id>', async () => {
    const bad = JSON.stringify({ version: 1, data: { count: 'beaucoup' }, updatedAt: 1 });
    await page.evaluate(([id, raw]) => localStorage.setItem(`dash:data:${id}`, raw), [ids[1], bad]);
    await first.reload();
    assert.equal((await count(1).innerText()).trim(), '0');
    assert.equal((await count(0).innerText()).trim(), '0');
    await sleep(SETTLE);
    const storage = await readStorage(page);
    assert.equal(JSON.parse(storage[`dash:backup:${ids[1]}`]).data.count, 'beaucoup');
    // Rien n'a été effacé tant que le widget n'a pas modifié ses données.
    assert.equal(storage[`dash:data:${ids[1]}`], bad);
    await demos.nth(1).getByRole('button', { name: '+1', exact: true }).click();
    assert.equal((await count(1).innerText()).trim(), '1');
    await sleep(SETTLE);
    assert.equal(JSON.parse((await readStorage(page))[`dash:data:${ids[1]}`]).data.count, 1);
  });

  await step('enveloppe de données illisible : réinitialisée au démarrage, texte d\'origine conservé dans dash:backup:<id>', async () => {
    await page.evaluate((id) => localStorage.setItem(`dash:data:${id}`, '{pas du json'), ids[1]);
    await first.reload();
    assert.equal((await count(1).innerText()).trim(), '0');
    await sleep(SETTLE);
    const storage = await readStorage(page);
    assert.equal(storage[`dash:backup:${ids[1]}`], '{pas du json');
    assert.equal(JSON.parse(storage[`dash:data:${ids[1]}`]).data.count, 0);
  });

  await step('réglages invalides : valeurs par défaut affichées, copie conservée', async () => {
    await editInstance(0, 'settings', { label: 42 });
    await first.reload();
    assert.equal((await demos.first().locator('.demo__label').innerText()).trim(), 'Compteur');
    await sleep(SETTLE);
    assert.equal(JSON.parse((await readStorage(page))[`dash:backup:${ids[0]}`]).settings.label, 42);
  });
}, { demoFixture: true });
