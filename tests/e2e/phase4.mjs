// Parcours navigateur de la phase 4 : catalogue, instances multiples, renommer, régler,
// dupliquer, supprimer, annuler. TOUT au clavier seul (Tab, Maj+Tab, flèches, Entrée, Échap, saisie).
//
//   node tests/e2e/phase4.mjs

import { assert, readStorage, runJourney, sleep } from './helpers.mjs';

const SETTLE = 700;

await runJourney('Parcours phase 4 (clavier seul)', async ({ step, open }) => {
  const first = await open({ label: 'composition', query: 'dev=1' });
  const { page, log } = first;
  // Après chaque touche, on laisse passer deux images : Preact déplace le focus dans un effet
  // (ouverture d'un panneau, d'un menu, retour du focus), qui s'exécute après le rendu.
  const frames = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const kb = {
    press: async (key) => {
      await page.keyboard.press(key);
      await frames();
    },
    type: async (text) => {
      await page.keyboard.type(text);
      await frames();
    },
  };
  const widgets = page.locator('section.widget');
  const state = () => page.evaluate(() => window.__dash.dashboard.getState().pages[0].instances.map((i) => ({ id: i.id, title: i.title ?? null, settings: i.settings, layout: i.layout })));
  const counts = () => page.evaluate(() => Object.fromEntries(Object.entries(window.__dash.data.getState().byId).map(([id, e]) => [id, e.data.count])));
  const storage = async () => (await sleep(SETTLE), readStorage(page));
  const dataKeys = async () => Object.keys(await storage()).filter((k) => k.startsWith('dash:data:')).sort();

  const active = () =>
    page.evaluate(() => {
      const a = document.activeElement;
      return {
        tag: a.tagName,
        cls: a.className,
        label: a.getAttribute('aria-label'),
        role: a.getAttribute('role'),
        id: a.id,
        text: (a.textContent || '').trim().slice(0, 60),
        widget: a.closest('section.widget')?.getAttribute('data-instance-id') ?? null,
        dialog: Boolean(a.closest('[role="dialog"]')),
      };
    });
  /** Tab (ou Maj+Tab) jusqu'à ce que l'élément focalisé satisfasse le critère. */
  async function tabTo(predicate, { back = false, max = 90 } = {}) {
    for (let i = 0; i < max; i++) {
      if (predicate(await active())) return;
      await kb.press(back ? 'Shift+Tab' : 'Tab');
    }
    assert.fail(`élément introuvable au clavier : ${JSON.stringify(await active())}`);
  }
  const menuButtonOf = (id) => (a) => a.label?.startsWith('Options de') && a.widget === id;
  async function openMenuOf(id, how = 'Enter') {
    await tabTo(menuButtonOf(id));
    await kb.press(how);
    await menuFocused();
  }
  /** Le menu est ouvert ET le focus est déjà sur l'une de ses entrées (focus posé après le rendu). */
  const menuFocused = () => page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'menuitem');
  async function chooseMenuItem(name) {
    for (let i = 0; i < 6; i++) {
      if ((await active()).text === name) break;
      await kb.press('ArrowDown');
    }
    assert.equal((await active()).text, name);
    await kb.press('Enter');
  }
  async function openCatalog() {
    await tabTo((a) => a.text === 'Ajouter un widget' && !a.dialog, { back: true });
    await kb.press('Enter');
    await page.locator('[role="dialog"]').waitFor();
    // Le focus entre dans le panneau après le rendu : on l'attend avant d'agir.
    await page.waitForFunction(() => document.activeElement?.id === 'catalog-search');
  }
  async function addDemoByKeyboard() {
    await openCatalog();
    await tabTo((a) => a.label === 'Ajouter Démo');
    await kb.press('Enter');
    await page.locator('[role="dialog"]').waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.matches?.('section.widget'));
  }

  const ids = [];

  await step('état vide : bouton « Ajouter un widget » atteint au clavier ouvre le catalogue, focus dans la recherche', async () => {
    assert.equal((await page.locator('.dashboard__empty-title').innerText()).trim(), 'Ton dashboard est vide');
    await tabTo((a) => a.text === 'Ajouter un widget');
    await kb.press('Enter');
    await page.locator('[role="dialog"]').waitFor();
    await page.waitForFunction(() => document.activeElement?.id === 'catalog-search');
    const a = await active();
    assert.equal(a.id, 'catalog-search');
    assert.equal(await page.locator('[role="dialog"]').getAttribute('aria-modal'), 'true');
    assert.equal(await page.getByRole('dialog', { name: 'Ajouter un widget' }).count(), 1);
  });

  await step('catalogue : la démo est listée (catégorie, description, compteur) ; la recherche filtre', async () => {
    const item = page.locator('.catalog__item[data-widget-type="demo"]');
    assert.equal(await item.count(), 1);
    assert.match(await item.innerText(), /Démo/);
    assert.match(await item.innerText(), /Pas encore ajouté/);
    assert.match(await page.locator('.catalog__group:has(.catalog__item[data-widget-type="demo"]) .catalog__group-title').innerText(), /Focus/i);
    await kb.type('dEm');
    assert.equal(await item.count(), 1, 'recherche insensible à la casse et aux accents');
    await kb.type('zzz');
    assert.equal(await item.count(), 0);
    assert.match(await page.locator('.catalog__empty').innerText(), /Aucun widget ne correspond/);
    for (let i = 0; i < 6; i++) await kb.press('Backspace');
    assert.equal(await item.count(), 1);
  });

  await step('Tab reste dans le panneau (piège de focus) ; Échap le ferme et rend le focus au bouton d\'origine', async () => {
    for (let i = 0; i < 8; i++) {
      await kb.press('Tab');
      assert.equal((await active()).dialog, true, `le focus a quitté le panneau : ${JSON.stringify(await active())}`);
    }
    await kb.press('Shift+Tab');
    assert.equal((await active()).dialog, true);
    await kb.press('Escape');
    await page.locator('[role="dialog"]').waitFor({ state: 'detached' });
    assert.equal((await active()).text, 'Ajouter un widget');
    assert.equal(await page.locator('.widget__grip:visible').count(), 0, 'Échap ne doit pas toucher au mode édition');
  });

  await step('ajouter trois fois la démo : le panneau se ferme, le widget reçoit le focus, trois instances indépendantes', async () => {
    for (let i = 0; i < 3; i++) await addDemoByKeyboard();
    assert.equal(await widgets.count(), 3);
    ids.push(...(await state()).map((s) => s.id));
    assert.equal(new Set(ids).size, 3);
    assert.equal(await page.locator('.dashboard__empty').count(), 0);
    // La deuxième ouverture affichait déjà « 1 sur le dashboard » : on le vérifie à la troisième.
    await openCatalog();
    assert.match(await page.locator('.catalog__item[data-widget-type="demo"] .catalog__count').innerText(), /^3 sur le dashboard$/);
    await kb.press('Escape');
    assert.deepEqual(await dataKeys(), ids.map((id) => `dash:data:${id}`).sort());
    // Chaque nouvelle instance a la taille par défaut, sans chevauchement (positions distinctes).
    const layouts = (await state()).map((s) => `${s.layout.x},${s.layout.y}`);
    assert.equal(new Set(layouts).size, 3);
  });

  await step('compteurs indépendants, au clavier', async () => {
    const [a, b] = ids;
    await tabTo((x) => x.text === '+1' && x.widget === a);
    for (let i = 0; i < 5; i++) await kb.press('Enter');
    await tabTo((x) => x.text === '+1' && x.widget === b);
    await kb.press('Enter');
    assert.deepEqual(await counts(), { [a]: 5, [b]: 1, [ids[2]]: 0 });
  });

  await step('renommer : le menu « … » s\'ouvre à la flèche, Renommer ouvre le dialogue ; le titre survit au rechargement', async () => {
    const [a] = ids;
    await tabTo(menuButtonOf(a));
    assert.equal((await active()).label, 'Options de Démo');
    await kb.press('ArrowDown');
    await menuFocused();
    const items = await page.locator('[role="menuitem"]').allInnerTexts();
    assert.deepEqual(items.map((t) => t.trim()), ['Renommer', 'Réglages', 'Dupliquer', 'Supprimer']);
    assert.equal(await page.locator('.widget__menu-button').first().getAttribute('aria-haspopup'), 'menu');
    assert.equal((await active()).text, 'Renommer');
    await kb.press('Enter');
    await page.locator('[role="dialog"]').waitFor();
    assert.equal(await page.getByRole('dialog', { name: 'Renommer le widget' }).count(), 1);
    assert.equal((await active()).tag, 'INPUT');
    await kb.type('Courses');
    await kb.press('Enter');
    await page.locator('[role="dialog"]').waitFor({ state: 'detached' });
    assert.equal((await page.locator(`section[data-instance-id="${a}"] h2`).innerText()).trim(), 'Courses');
    assert.equal((await active()).label, 'Options de Courses', 'le focus doit revenir au bouton du menu');
    assert.equal((await state()).find((s) => s.id === a).title, 'Courses');
  });

  await step('Échap ferme le menu et rend le focus au bouton « … »', async () => {
    await kb.press('Enter');
    await menuFocused();
    await kb.press('Escape');
    await page.locator('[role="menu"]').waitFor({ state: 'detached' });
    assert.equal((await active()).label, 'Options de Courses');
    // Flèche haut : ouvre sur la dernière entrée ; Début / Fin naviguent.
    await kb.press('ArrowUp');
    await menuFocused();
    assert.equal((await active()).text, 'Supprimer');
    await kb.press('Home');
    assert.equal((await active()).text, 'Renommer');
    await kb.press('End');
    assert.equal((await active()).text, 'Supprimer');
    await kb.press('Escape');
  });

  await step('régler : le panneau de réglages s\'applique tout de suite, sans toucher aux autres instances ; réinitialiser', async () => {
    const [a, b] = ids;
    await openMenuOf(a, 'Enter');
    await chooseMenuItem('Réglages');
    await page.locator('[role="dialog"]').waitFor();
    assert.equal(await page.getByRole('dialog', { name: 'Réglages : Courses' }).count(), 1);
    assert.equal((await active()).tag, 'INPUT');
    await kb.press('Control+A');
    await kb.type('Mon libellé');
    const label = (id) => page.locator(`section[data-instance-id="${id}"] .demo__label`).innerText();
    assert.equal((await label(a)).trim(), 'Mon libellé');
    assert.equal((await label(b)).trim(), 'Compteur');
    // Réinitialiser, puis ressaisir.
    await tabTo((x) => x.text === 'Réinitialiser les réglages');
    await kb.press('Enter');
    assert.equal((await label(a)).trim(), 'Compteur');
    await tabTo((x) => x.tag === 'INPUT', { back: true });
    await kb.press('Control+A');
    await kb.type('Mon libellé');
    await tabTo((x) => x.text === 'Terminé');
    await kb.press('Enter');
    await page.locator('[role="dialog"]').waitFor({ state: 'detached' });
    assert.equal((await active()).label, 'Options de Courses');
    assert.deepEqual((await state()).map((s) => s.settings.label), ['Mon libellé', 'Compteur', 'Compteur']);
  });

  let copyId;
  await step('dupliquer : copie à 5, titre « (copie) », juste sous l\'original ; incrémenter la copie laisse l\'original à 5', async () => {
    const [a] = ids;
    await openMenuOf(a);
    await chooseMenuItem('Dupliquer');
    await page.waitForFunction(() => document.activeElement?.matches?.('section.widget'));
    assert.equal(await widgets.count(), 4);
    copyId = (await active()).widget;
    assert.ok(copyId && !ids.includes(copyId));
    const st = await state();
    const original = st.find((s) => s.id === a);
    const copy = st.find((s) => s.id === copyId);
    assert.equal(copy.title, 'Courses (copie)');
    assert.equal(copy.settings.label, 'Mon libellé');
    assert.equal(copy.layout.x, original.layout.x);
    assert.equal(copy.layout.y, original.layout.y + original.layout.h, 'juste sous l\'original');
    assert.equal((await counts())[copyId], 5);
    await tabTo((x) => x.text === '+1' && x.widget === copyId);
    await kb.press('Enter');
    const c = await counts();
    assert.equal(c[copyId], 6);
    assert.equal(c[a], 5);
    await sleep(SETTLE);
    assert.equal((await dataKeys()).length, 4);
  });

  await step('supprimer : toast « Widget supprimé », le focus est sur « Annuler » ; Annuler restaure le widget et ses données', async () => {
    await openMenuOf(copyId, 'ArrowUp');
    assert.equal((await active()).text, 'Supprimer');
    await kb.press('Enter');
    await page.getByText('Widget supprimé').waitFor();
    assert.equal(await widgets.count(), 3);
    assert.equal((await counts())[copyId], undefined, 'les données sont retirées avec l\'instance');
    assert.equal((await active()).text, 'Annuler');
    await kb.press('Enter');
    await page.locator(`section[data-instance-id="${copyId}"]`).waitFor();
    assert.equal(await widgets.count(), 4);
    assert.equal((await counts())[copyId], 6);
    assert.equal((await state()).find((s) => s.id === copyId).title, 'Courses (copie)');
    await page.waitForFunction((id) => document.activeElement?.getAttribute('data-instance-id') === id, copyId);
    await sleep(SETTLE);
    assert.ok((await dataKeys()).includes(`dash:data:${copyId}`));
  });

  await step('supprimer sans annuler : la clé dash:data:<id> disparaît et le toast avec elle', async () => {
    await openMenuOf(copyId, 'ArrowUp');
    await kb.press('Enter');
    await page.getByText('Widget supprimé').waitFor();
    await sleep(SETTLE);
    const during = await dataKeys();
    assert.equal(during.includes(`dash:data:${copyId}`), false);
    await sleep(8000);
    assert.equal(await page.getByText('Widget supprimé').count(), 0, 'le toast reste affiché');
    assert.equal(await page.evaluate((id) => window.__dash.actions.canRestore(id), copyId), false);
    assert.equal((await dataKeys()).includes(`dash:data:${copyId}`), false);
    assert.equal(await widgets.count(), 3);
  });

  await step('recharger : titres, réglages, compteurs et clés de données sont conservés', async () => {
    await sleep(SETTLE);
    const before = { state: await state(), counts: await counts() };
    await first.reload();
    assert.equal(await widgets.count(), 3);
    assert.deepEqual(await state(), before.state);
    assert.deepEqual(await counts(), before.counts);
    const [a, b] = ids;
    assert.equal((await page.locator(`section[data-instance-id="${a}"] h2`).innerText()).trim(), 'Courses');
    assert.equal((await page.locator(`section[data-instance-id="${a}"] .demo__label`).innerText()).trim(), 'Mon libellé');
    assert.equal((await page.locator(`section[data-instance-id="${b}"] .demo__label`).innerText()).trim(), 'Compteur');
    assert.deepEqual(await dataKeys(), ids.map((id) => `dash:data:${id}`).sort());
  });

  await step('en mode édition : le menu est visible, Échap ferme d\'abord le menu puis quitte le mode ; ajouter un widget ne change pas le mode', async () => {
    await tabTo((a) => a.text === 'Modifier la disposition');
    await kb.press('Enter');
    assert.equal(await page.locator('.widget__grip:visible').count(), 3);
    for (const b of await page.locator('.widget__menu-button').all()) assert.equal(await b.evaluate((el) => getComputedStyle(el).opacity), '1');
    await openMenuOf(ids[1]);
    await kb.press('Escape');
    await page.locator('[role="menu"]').waitFor({ state: 'detached' });
    assert.equal(await page.locator('.widget__grip:visible').count(), 3, 'Échap dans le menu ne doit pas quitter le mode édition');
    await addDemoByKeyboard();
    assert.equal(await widgets.count(), 4);
    assert.equal(await page.locator('.widget__grip:visible').count(), 4, 'le mode édition doit rester actif');
    await kb.press('Escape');
    assert.equal(await page.locator('.widget__grip:visible').count(), 0);
  });

  await step('console propre', async () => {
    assert.deepEqual(log.errors, []);
  });
}, { demoFixture: true });
