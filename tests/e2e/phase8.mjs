// Parcours navigateur de la phase 8 : widget Raccourcis (grille de liens favoris).
//
//   node tests/e2e/phase8.mjs
//
// Les icônes de sites sont servies par un service externe : le parcours intercepte ces requêtes
// (page.route) pour vérifier qu'aucune n'est faite par défaut, que celles du mode « Icônes du site »
// portent les bons attributs, et que la lettre de repli s'affiche quand l'image échoue.

import { assert, readStorage, runJourney, sleep } from './helpers.mjs';

const SETTLE = 700;
const FAVICON = /^https:\/\/www\.google\.com\/s2\/favicons\?/;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

await runJourney('Parcours phase 8 (widget Raccourcis)', async ({ step, open, site }) => {
  const session = await open({ label: 'raccourcis', query: 'dev=1' });
  const { page, context, log } = session;
  const dialogs = [];
  page.on('dialog', (d) => {
    dialogs.push(d.message());
    d.dismiss();
  });
  /** Requêtes d'icônes observées (toutes, y compris celles que le test intercepte). */
  const iconRequests = [];
  page.on('request', (r) => {
    if (FAVICON.test(r.url()) || /gstatic\.com/.test(r.url())) iconRequests.push(r);
  });

  const widgets = () => page.locator('section.widget[data-widget-type="shortcuts"]');
  const instances = () => page.evaluate(() => window.__dash.dashboard.getState().pages[0].instances.map((i) => ({ id: i.id, settings: i.settings, layout: i.layout })));
  const dataOf = (id) => page.evaluate((i) => window.__dash.data.getState().byId[i]?.data ?? null, id);
  const linksOf = async (id) => (await dataOf(id)).links;
  const titlesOf = async (id) => (await linksOf(id)).map((l) => l.title);
  const setLayout = (id, layout) => page.evaluate(([i, l]) => window.__dash.dashboard.updateLayouts({ [i]: l }), [id, layout]);
  const tiles = (w) => w.locator('a.shortcuts__tile');
  const live = async (w) => (await w.locator('[data-testid="shortcuts-live"]').textContent()).trim();
  const item = (w, id) => w.locator(`.shortcuts__item[data-link-id="${id}"]`);
  const dialogSwitch = (dialog, name) => dialog.locator('label.toggle', { hasText: name });
  /** Identifiants dans l'ordre du DOM : doit toujours être l'ordre des données. */
  const domOrder = (w) => w.locator('.shortcuts__item').evaluateAll((els) => els.map((e) => e.getAttribute('data-link-id')));
  const sameOrderAsData = async (w, id) => assert.deepEqual(await domOrder(w), (await linksOf(id)).map((l) => l.id), 'le DOM suit l\'ordre des données');

  const waitFocus = (fn, arg, message) =>
    page.waitForFunction(fn, arg, { timeout: 3000 }).catch(() => {
      throw new assert.AssertionError({ message });
    });
  const focusLabel = (label) => waitFocus((l) => document.activeElement?.getAttribute('aria-label') === l, label, `le focus devrait être sur « ${label} »`);
  const focusIsAddressField = () =>
    waitFocus(() => document.activeElement?.tagName === 'INPUT' && !!document.activeElement.closest('.modal__panel') && document.activeElement.labels?.[0]?.textContent === 'Adresse', null, 'le focus devrait être dans le champ Adresse');
  const focusIsTileOf = (linkId) => waitFocus((i) => document.activeElement?.classList.contains('shortcuts__tile') && document.activeElement.closest('[data-link-id]')?.getAttribute('data-link-id') === i, linkId, 'le focus devrait être sur la tuile');
  const dialogPanel = () => page.locator('.modal__panel');

  /** Ajoute un raccourci par le formulaire (bouton « Ajouter un raccourci » de la tuile ou de l'état vide). */
  async function addByForm(w, address, title) {
    await w.getByRole('button', { name: 'Ajouter un raccourci' }).first().click();
    await focusIsAddressField();
    await page.keyboard.type(address);
    if (title) {
      await page.keyboard.press('Tab');
      await page.keyboard.type(title);
    }
    await page.keyboard.press('Enter');
    await dialogPanel().waitFor({ state: 'detached' });
  }

  async function openSettings(w, name = 'Raccourcis') {
    await w.hover();
    await w.getByRole('button', { name: `Options de ${name}` }).click();
    await page.getByRole('menuitem', { name: 'Réglages' }).click();
    const dialog = page.getByRole('dialog', { name: `Réglages : ${name}` });
    await dialog.waitFor();
    return dialog;
  }
  async function closeSettings(dialog) {
    await dialog.getByRole('button', { name: 'Terminé' }).click();
    await dialog.waitFor({ state: 'detached' });
  }

  /** Glisse une tuile (poignée = toute la tuile) sur une autre, à la souris. */
  async function dragTile(w, fromIndex, toIndex) {
    const from = await w.locator('.shortcuts__item .shortcuts__tile').nth(fromIndex).boundingBox();
    const to = await w.locator('.shortcuts__item .shortcuts__tile').nth(toIndex).boundingBox();
    const x = from.x + from.width / 2;
    const y = from.y + 20;
    const tx = to.x + to.width / 2;
    const ty = to.y + 20;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + (tx > x ? 8 : -8), y, { steps: 4 });
    await page.mouse.move(tx + (tx > x ? 6 : -6), ty, { steps: 14 });
    await sleep(150);
    await page.mouse.up();
    await sleep(400);
  }

  let a;
  let b;

  await step('le catalogue propose « Raccourcis » ; l\'ajout crée un widget 4×3 avec son état vide', async () => {
    await page.getByRole('button', { name: 'Ajouter un widget' }).first().click();
    const entry = page.locator('.catalog__item[data-widget-type="shortcuts"]');
    assert.equal(await entry.count(), 1);
    assert.match(await page.locator('.catalog__group:has(.catalog__item[data-widget-type="shortcuts"]) .catalog__group-title').innerText(), /Liens/i);
    await page.getByRole('button', { name: 'Ajouter Raccourcis' }).click();
    await widgets().first().waitFor();
    const [instance] = await instances();
    a = instance.id;
    assert.deepEqual({ w: instance.layout.w, h: instance.layout.h }, { w: 4, h: 3 });
    assert.deepEqual(instance.settings, { openInNewTab: false, showLabels: true, icons: 'letter', tileSize: 'md' });
    const w = widgets().first();
    assert.match(await w.locator('[data-testid="shortcuts-empty"]').innerText(), /Aucun raccourci/);
    assert.equal(await w.getByRole('button', { name: 'Ajouter un raccourci' }).count(), 1);
    assert.equal(await w.getByRole('button', { name: 'Organiser' }).count(), 0, 'rien à organiser tant qu\'il n\'y a pas de raccourci');
    assert.deepEqual(await dataOf(a), { links: [] });
    await setLayout(a, { x: 0, y: 0, w: 6, h: 4 });
    await sleep(400);
  });

  await step('formulaire d\'ajout : fenêtre visible, focus dans « Adresse », github.com crée un lien vers https://github.com', async () => {
    const w = widgets().first();
    await w.getByRole('button', { name: 'Ajouter un raccourci' }).click();
    const dialog = page.getByRole('dialog', { name: 'Ajouter un raccourci' });
    await dialog.waitFor();
    await focusIsAddressField();
    const box = await dialogPanel().boundingBox();
    const viewport = page.viewportSize();
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height, `la fenêtre déborde de l'écran : ${JSON.stringify(box)}`);
    assert.equal(await page.evaluate(() => !!document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)?.closest('.modal__panel')), true, 'la fenêtre est au premier plan');
    await page.keyboard.type('github.com');
    await page.keyboard.press('Enter');
    await dialogPanel().waitFor({ state: 'detached' });
    assert.equal(await tiles(w).count(), 1);
    const tile = tiles(w).first();
    assert.equal(await tile.getAttribute('href'), 'https://github.com');
    assert.equal(await tile.getAttribute('title'), 'github.com');
    assert.equal((await tile.locator('.shortcuts__label').innerText()).trim(), 'github.com');
    assert.equal((await tile.locator('.shortcuts__icon').innerText()).trim(), 'G');
    const [link] = await linksOf(a);
    assert.deepEqual({ title: link.title, url: link.url }, { title: 'github.com', url: 'https://github.com' });
    assert.ok(typeof link.id === 'string' && link.id.length > 8);
    assert.match(await live(w), /Raccourci ajouté : github\.com/);
  });

  await step('autres adresses : localhost:3000 avec un titre, adresse IP avec port ; le focus revient à « Ajouter »', async () => {
    const w = widgets().first();
    await addByForm(w, 'localhost:3000', 'Mon appli');
    await addByForm(w, 'http://192.168.1.10:8080');
    assert.deepEqual((await linksOf(a)).map((l) => [l.title, l.url]), [
      ['github.com', 'https://github.com'],
      ['Mon appli', 'https://localhost:3000'],
      ['192.168.1.10', 'http://192.168.1.10:8080'],
    ]);
    assert.deepEqual(await Promise.all([0, 1, 2].map((i) => tiles(w).nth(i).getAttribute('href'))), ['https://github.com', 'https://localhost:3000', 'http://192.168.1.10:8080']);
    await focusLabel('Ajouter un raccourci');
    await sameOrderAsData(w, a);
  });

  await step('adresses refusées : erreur en français reliée au champ (aria-describedby), rien n\'est ajouté, la saisie efface l\'erreur', async () => {
    const w = widgets().first();
    const before = await linksOf(a);
    await w.getByRole('button', { name: 'Ajouter un raccourci' }).click();
    await focusIsAddressField();
    const field = dialogPanel().getByLabel('Adresse');
    for (const [input, expected] of [
      ['javascript:ale\x72t(1)', /^Adresse invalide : seules les adresses http et https sont acceptées\. Exemple : github\.com$/],
      ['bonjour', /^Adresse invalide\. Exemple : github\.com$/],
      ['data:text/html,<b>x</b>', /^Adresse invalide/],
      ['ftp://exemple.com', /^Adresse invalide/],
      ['file:///etc/passwd', /^Adresse invalide/],
      ['un deux', /^Adresse invalide/],
    ]) {
      await field.fill(input);
      await page.keyboard.press('Enter');
      const error = dialogPanel().locator('.field__error');
      await error.waitFor();
      assert.match((await error.innerText()).trim(), expected, input);
      assert.equal(await field.getAttribute('aria-invalid'), 'true');
      const describedBy = (await field.getAttribute('aria-describedby')).split(' ');
      assert.ok(describedBy.includes(await error.getAttribute('id')), 'le champ est relié au message');
      assert.equal(await dialogPanel().count(), 1, 'la fenêtre reste ouverte');
      await focusIsAddressField();
      assert.deepEqual(await linksOf(a), before, `${input} ne doit rien ajouter`);
    }
    await field.fill('');
    await page.keyboard.press('Enter');
    assert.match(await dialogPanel().locator('.field__error').innerText(), /Saisis une adresse/);
    await page.keyboard.type('g');
    assert.equal(await dialogPanel().locator('.field__error').count(), 0, 'l\'erreur disparaît dès qu\'on corrige');
    await page.keyboard.press('Escape');
    await dialogPanel().waitFor({ state: 'detached' });
    await focusLabel('Ajouter un raccourci');
    assert.deepEqual(await linksOf(a), before);
    assert.deepEqual(dialogs, [], 'aucune boîte de dialogue du navigateur');
  });

  await step('doublon : avertissement non bloquant, le raccourci est quand même ajouté', async () => {
    const w = widgets().first();
    await w.getByRole('button', { name: 'Ajouter un raccourci' }).click();
    await focusIsAddressField();
    await page.keyboard.type('https://github.com/');
    const help = dialogPanel().locator('.field__help').first();
    assert.match(await help.innerText(), /existe déjà/);
    assert.ok((await dialogPanel().getByLabel('Adresse').getAttribute('aria-describedby')).split(' ').includes(await help.getAttribute('id')));
    await page.keyboard.press('Enter');
    await dialogPanel().waitFor({ state: 'detached' });
    assert.deepEqual(await titlesOf(a), ['github.com', 'Mon appli', '192.168.1.10', 'github.com']);
  });

  await step('liens : rel="noopener noreferrer", pas de target par défaut, titre complet en attribut title', async () => {
    const w = widgets().first();
    const count = await tiles(w).count();
    assert.equal(count, 4);
    for (let i = 0; i < count; i++) {
      assert.equal(await tiles(w).nth(i).getAttribute('rel'), 'noopener noreferrer');
      assert.equal(await tiles(w).nth(i).getAttribute('target'), null);
    }
    assert.equal(await tiles(w).nth(1).getAttribute('title'), 'Mon appli');
    // Nom visible : le nom accessible vient du contenu (WCAG 2.5.3), sans aria-label qui pourrait diverger.
    assert.equal(await tiles(w).nth(1).getAttribute('aria-label'), null);
    assert.equal(await w.getByRole('link', { name: 'Mon appli', exact: true }).count(), 1);
    // Le libellé tient sur une ligne et se coupe avec des points de suspension.
    const label = await tiles(w).nth(1).locator('.shortcuts__label').evaluate((el) => ({ overflow: getComputedStyle(el).textOverflow, space: getComputedStyle(el).whiteSpace }));
    assert.deepEqual(label, { overflow: 'ellipsis', space: 'nowrap' });
  });

  await step('un clic ouvre le lien dans l\'onglet courant ; Ctrl + clic dans un nouvel onglet', async () => {
    const w = widgets().first();
    await addByForm(w, site.url, 'Ce site');
    const tile = tiles(w).filter({ hasText: 'Ce site' });
    assert.equal(await tile.getAttribute('href'), site.url.replace(/\/$/, ''));
    const pagesBefore = context.pages().length;
    // Ctrl + clic : comportement natif du navigateur, nouvel onglet.
    const [popup] = await Promise.all([context.waitForEvent('page'), tile.click({ modifiers: ['Control'] })]);
    await popup.waitForLoadState();
    assert.ok(popup.url().startsWith(site.url.replace(/\/$/, '')));
    assert.ok(page.url().includes('dev=1'), 'l\'onglet d\'origine n\'a pas bougé');
    await popup.close();
    assert.equal(context.pages().length, pagesBefore);
    // Clic simple : même onglet.
    await Promise.all([page.waitForURL((u) => !u.search.includes('dev=1')), tile.click()]);
    assert.equal(context.pages().length, pagesBefore, 'aucun nouvel onglet');
    await page.goBack();
    await page.waitForSelector('section.widget[data-widget-type="shortcuts"]');
  });

  await step('option « Ouvrir dans un nouvel onglet » : target="_blank" sur tous les liens, le clic ouvre un nouvel onglet', async () => {
    const w = widgets().first();
    const dialog = await openSettings(w);
    await dialogSwitch(dialog, 'Ouvrir dans un nouvel onglet').click();
    await closeSettings(dialog);
    assert.equal((await instances())[0].settings.openInNewTab, true);
    const count = await tiles(w).count();
    for (let i = 0; i < count; i++) {
      assert.equal(await tiles(w).nth(i).getAttribute('target'), '_blank');
      assert.equal(await tiles(w).nth(i).getAttribute('rel'), 'noopener noreferrer');
    }
    const [popup] = await Promise.all([context.waitForEvent('page'), tiles(w).filter({ hasText: 'Ce site' }).click()]);
    await popup.waitForLoadState();
    assert.ok(popup.url().startsWith(site.url.replace(/\/$/, '')));
    await popup.close();
    assert.ok(page.url().includes('dev=1'));
    const reopened = await openSettings(w);
    await dialogSwitch(reopened, 'Ouvrir dans un nouvel onglet').click();
    await closeSettings(reopened);
    // Preact remet la propriété « target » à vide : le lien s'ouvre de nouveau dans l'onglet courant.
    assert.ok([null, ''].includes(await tiles(w).first().getAttribute('target')), 'plus de target="_blank"');
    assert.equal(await tiles(w).first().evaluate((el) => el.target), '');
  });

  await step('icônes « Lettre initiale » (défaut) : aucune <img>, aucune requête d\'icône', async () => {
    const w = widgets().first();
    assert.equal(await w.locator('img').count(), 0);
    assert.equal(iconRequests.length, 0, `requêtes d'icône inattendues : ${iconRequests.map((r) => r.url()).join(', ')}`);
    assert.equal((await tiles(w).nth(1).locator('.shortcuts__icon').innerText()).trim(), 'M');
  });

  await step('un même domaine garde la même couleur de tuile (chemin, www, ordre, rechargement)', async () => {
    const w = widgets().first();
    await addByForm(w, 'http://www.github.com/anthropics', 'Anthropic sur GitHub');
    const colors = async () =>
      w.locator('.shortcuts__item').evaluateAll((els) => els.map((e) => ({ title: e.querySelector('.shortcuts__tile').getAttribute('title'), tile: e.querySelector('.shortcuts__icon').getAttribute('data-tile'), bg: getComputedStyle(e.querySelector('.shortcuts__icon')).backgroundColor })));
    const list = await colors();
    const github = list.filter((c) => /github/i.test(c.title));
    assert.equal(github.length, 3);
    assert.equal(new Set(github.map((c) => c.tile)).size, 1, 'même indice de tuile');
    assert.equal(new Set(github.map((c) => c.bg)).size, 1, 'même couleur affichée');
    assert.ok(list.every((c) => /^[1-8]$/.test(c.tile)));
    assert.ok(list.every((c) => c.bg !== 'rgba(0, 0, 0, 0)'));
    await session.reload();
    assert.deepEqual(await colors(), list, 'identique après rechargement');
  });

  await step('réglages : noms masqués (le nom accessible reste), taille des tuiles', async () => {
    const w = widgets().first();
    const dialog = await openSettings(w);
    assert.equal(await dialog.getByLabel('Taille des tuiles').inputValue(), 'md');
    const size = () => w.locator('.shortcuts__icon').first().evaluate((el) => el.getBoundingClientRect().width);
    assert.equal(await size(), 52, 'tuile de 52 px par défaut');
    await dialog.getByLabel('Taille des tuiles').selectOption('sm');
    assert.equal(await size(), 40);
    await dialog.getByLabel('Taille des tuiles').selectOption('lg');
    assert.equal(await size(), 64);
    await dialog.getByLabel('Taille des tuiles').selectOption('md');
    await dialogSwitch(dialog, 'Afficher les noms').click();
    assert.equal(await w.locator('.shortcuts__label').count(), 0);
    assert.equal(await tiles(w).nth(1).getAttribute('aria-label'), 'Mon appli');
    assert.equal(await w.getByRole('link', { name: 'Mon appli' }).count(), 1);
    await dialogSwitch(dialog, 'Afficher les noms').click();
    const expectedLabels = (await linksOf(a)).length + 1;
    await closeSettings(dialog);
    assert.equal(await w.locator('.shortcuts__label').count(), expectedLabels, 'les noms reviennent (un par raccourci, plus « Ajouter »)');
  });

  await step('icônes « Icônes du site » : avertissement visible, requêtes sans Referer, la lettre revient quand l\'image échoue', async () => {
    const w = widgets().first();
    let blocked = 0;
    await page.route(FAVICON, (route) => {
      const domain = new URL(route.request().url()).searchParams.get('domain');
      if (domain === 'github.com') return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
      blocked++;
      return route.abort();
    });
    const dialog = await openSettings(w);
    const notice = dialog.locator('.shortcuts-settings__notice');
    assert.equal((await notice.innerText()).trim(), 'Les noms de domaine sont envoyés à Google pour récupérer les icônes.');
    const radio = dialog.getByRole('radio', { name: 'Icônes du site' });
    assert.ok((await radio.getAttribute('aria-describedby')) === (await notice.getAttribute('id')), 'l\'avertissement est relié au choix');
    assert.equal(await dialog.getByRole('radio', { name: 'Lettre initiale' }).isChecked(), true);
    assert.equal(iconRequests.length, 0, 'encore aucune requête avant de choisir les icônes du site');
    await radio.check();
    assert.equal((await instances())[0].settings.icons, 'favicon');
    // Les domaines qui échouent retombent sur la lettre ; github.com garde son image.
    await page.waitForFunction(
      () => document.querySelectorAll('section.widget[data-widget-type="shortcuts"] img').length === 3 && document.querySelectorAll('section.widget[data-widget-type="shortcuts"] .shortcuts__item .shortcuts__icon:not(.shortcuts__icon--image)').length === 3,
      null,
      { timeout: 8000 },
    );
    await closeSettings(dialog);
    const images = w.locator('img');
    assert.equal(await images.count(), 3, 'trois liens vers github.com');
    for (let i = 0; i < 3; i++) {
      const img = images.nth(i);
      assert.equal(await img.getAttribute('alt'), '');
      assert.equal(await img.getAttribute('referrerpolicy'), 'no-referrer');
      assert.equal(await img.getAttribute('loading'), 'lazy');
      assert.equal(await img.getAttribute('src'), 'https://www.google.com/s2/favicons?domain=github.com&sz=64');
      assert.equal(await img.evaluate((el) => el.complete && el.naturalWidth > 0), true);
    }
    // Lettres de repli pour les domaines dont l'image a échoué.
    const mon = tiles(w).filter({ hasText: 'Mon appli' });
    assert.equal(await mon.locator('img').count(), 0);
    assert.equal((await mon.locator('.shortcuts__icon').innerText()).trim(), 'M');
    assert.ok(blocked >= 1, 'des requêtes ont bien été bloquées par le test');
    const domains = new Set(iconRequests.map((r) => new URL(r.url()).searchParams.get('domain')));
    assert.deepEqual([...domains].sort(), ['127.0.0.1', '192.168.1.10', 'github.com', 'localhost']);
    for (const r of iconRequests) assert.equal(r.headers().referer, undefined, 'aucun Referer envoyé');
    // Retour aux lettres : plus aucune image.
    const back = await openSettings(w);
    await back.getByRole('radio', { name: 'Lettre initiale' }).check();
    await closeSettings(back);
    assert.equal(await w.locator('img').count(), 0);
    const requestsBefore = iconRequests.length;
    await sleep(300);
    assert.equal(iconRequests.length, requestsBefore);
    // Les requêtes interceptées et leurs erreurs attendues sortent du contrôle final de la console.
    const isIcon = (u) => FAVICON.test(u);
    assert.ok(log.foreign.every(isIcon) && log.failed.every(isIcon), `requêtes inattendues : ${JSON.stringify([...log.foreign, ...log.failed])}`);
    assert.ok(log.errors.length >= 1 && log.errors.every((e) => /Failed to load resource/.test(e)), JSON.stringify(log.errors));
    log.foreign = [];
    log.failed = [];
    log.errors = [];
    await page.unroute(FAVICON);
  });

  await step('mode Organiser : les tuiles deviennent des boutons avec Modifier, Supprimer, Monter, Descendre', async () => {
    const w = widgets().first();
    const organize = w.getByRole('button', { name: 'Organiser' });
    assert.equal(await organize.getAttribute('aria-pressed'), 'false');
    await organize.click();
    const done = w.getByRole('button', { name: 'Terminer' });
    assert.equal(await done.getAttribute('aria-pressed'), 'true');
    assert.equal(await tiles(w).count(), 0, 'plus aucun lien');
    assert.equal(await w.locator('a[href]').count(), 0);
    const count = (await linksOf(a)).length;
    assert.equal(await w.locator('.shortcuts__item button.shortcuts__tile').count(), count);
    for (const name of ['Modifier', 'Supprimer', 'Monter', 'Descendre']) {
      assert.equal(await w.getByRole('button', { name: new RegExp(`^${name} : `) }).count(), count, name);
    }
    assert.equal(await w.getByRole('button', { name: 'Ajouter un raccourci' }).count(), 0, 'pas de tuile « Ajouter » pendant l\'organisation');
    assert.match(await live(w), /Mode organisation/);
    for (const btn of await w.locator('.shortcuts__icon-button').all()) {
      const box = await btn.boundingBox();
      assert.ok(box.width >= 36 && box.height >= 36, `bouton trop petit : ${JSON.stringify(box)}`);
    }
  });

  await step('Organiser : modifier (formulaire prérempli, Entrée valide, Échap annule, adresse invalide refusée)', async () => {
    const w = widgets().first();
    const [, mon] = await linksOf(a);
    await w.getByRole('button', { name: 'Modifier : Mon appli' }).click();
    const dialog = page.getByRole('dialog', { name: 'Modifier le raccourci' });
    await dialog.waitFor();
    await focusIsAddressField();
    assert.equal(await dialog.getByLabel('Adresse').inputValue(), 'https://localhost:3000');
    assert.equal(await dialog.getByLabel('Titre (facultatif)').inputValue(), 'Mon appli');
    // Adresse invalide : refusée, rien ne change.
    await dialog.getByLabel('Adresse').fill('javascript:ale\x72t(1)');
    await page.keyboard.press('Enter');
    await dialog.locator('.field__error').waitFor();
    assert.deepEqual((await linksOf(a))[1], mon);
    // Échap annule.
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    await focusLabel('Modifier : Mon appli');
    assert.deepEqual((await linksOf(a))[1], mon);
    // Modification valide.
    await w.getByRole('button', { name: 'Modifier : Mon appli' }).click();
    await focusIsAddressField();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('localhost:4000');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Control+A');
    await page.keyboard.type('Appli locale');
    await page.keyboard.press('Enter');
    await dialog.waitFor({ state: 'detached' });
    assert.deepEqual({ ...(await linksOf(a))[1] }, { ...mon, title: 'Appli locale', url: 'https://localhost:4000' });
    await focusLabel('Modifier : Appli locale');
    assert.match(await live(w), /Raccourci modifié : Appli locale/);
    // Titre vidé : le domaine.
    await w.getByRole('button', { name: 'Modifier : Appli locale' }).click();
    await focusIsAddressField();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Enter');
    await dialog.waitFor({ state: 'detached' });
    assert.equal((await linksOf(a))[1].title, 'localhost');
    // Retour au titre voulu.
    await w.getByRole('button', { name: 'Modifier : localhost' }).click();
    await focusIsAddressField();
    await page.keyboard.press('Tab');
    await page.keyboard.type('Mon appli');
    await page.keyboard.press('Enter');
    await dialog.waitFor({ state: 'detached' });
    assert.equal((await linksOf(a))[1].title, 'Mon appli');
  });

  await step('Organiser : supprimer, « Raccourci supprimé — Annuler », Annuler remet à la même place', async () => {
    const w = widgets().first();
    const before = await linksOf(a);
    const dup = before[3];
    assert.equal(dup.title, 'github.com');
    await item(w, dup.id).getByRole('button', { name: /^Supprimer : / }).click();
    assert.equal(await item(w, dup.id).count(), 0);
    assert.equal((await linksOf(a)).length, before.length - 1);
    const bar = w.locator('.shortcuts__undo');
    assert.match(await bar.innerText(), /Raccourci supprimé/);
    await waitFocus(() => document.activeElement?.textContent.trim() === 'Annuler', null, 'le focus passe sur « Annuler »');
    assert.match(await live(w), /Raccourci supprimé : github\.com/);
    assert.equal(await page.getByRole('dialog').count(), 0, 'aucune confirmation bloquante');
    await page.keyboard.press('Enter');
    await bar.waitFor({ state: 'detached' });
    assert.deepEqual(await linksOf(a), before, 'même contenu, même ordre');
    await focusIsTileOf(dup.id);
    assert.match(await live(w), /Raccourci restauré/);
    await sameOrderAsData(w, a);
  });

  await step('Organiser : sans annulation, la barre disparaît après 6 s et le focus passe à « Terminer »', async () => {
    const w = widgets().first();
    const before = await linksOf(a);
    const dup = before[3];
    await item(w, dup.id).getByRole('button', { name: /^Supprimer : / }).click();
    const bar = w.locator('.shortcuts__undo');
    await bar.waitFor();
    await sleep(5000);
    assert.equal(await bar.count(), 1, 'encore là avant 6 s');
    await sleep(1500);
    assert.equal(await bar.count(), 0, 'disparue après 6 s');
    await waitFocus(() => document.activeElement?.classList.contains('shortcuts__organize'), null, 'le focus passe au bouton « Terminer »');
    assert.deepEqual((await linksOf(a)).map((l) => l.id), before.filter((l) => l.id !== dup.id).map((l) => l.id));
    await sleep(SETTLE);
  });

  await step('Organiser : réordonner à la souris (glisser une tuile), le DOM reste en phase avec les données', async () => {
    const w = widgets().first();
    const before = await linksOf(a);
    assert.ok(before.length >= 5);
    await dragTile(w, 0, 2);
    const after = await linksOf(a);
    assert.deepEqual(after.map((l) => l.id), [before[1].id, before[2].id, before[0].id, ...before.slice(3).map((l) => l.id)]);
    await sameOrderAsData(w, a);
    await focusIsTileOf(before[0].id);
    assert.match(await live(w), /position 3 sur 5/);
    await dragTile(w, 3, 0);
    const again = await linksOf(a);
    assert.equal(again[0].id, before[3].id);
    await sameOrderAsData(w, a);
    assert.equal((await linksOf(a)).length, 5, 'rien perdu ni dupliqué');
    // Retour à l'ordre d'origine.
    await dragTile(w, 0, 3);
    await sameOrderAsData(w, a);
  });

  await step('Organiser : au clavier, Alt + flèches et boutons Monter / Descendre', async () => {
    const w = widgets().first();
    const ids = async () => (await linksOf(a)).map((l) => l.id);
    const start = await ids();
    const first = start[0];
    // Alt + flèche droite / bas : une place plus loin ; Alt + flèche gauche / haut : une place avant.
    await item(w, first).locator('.shortcuts__tile').focus();
    await page.keyboard.press('Alt+ArrowRight');
    assert.deepEqual(await ids(), [start[1], start[0], ...start.slice(2)]);
    await focusIsTileOf(first);
    await page.keyboard.press('Alt+ArrowDown');
    assert.deepEqual(await ids(), [start[1], start[2], start[0], ...start.slice(3)]);
    await page.keyboard.press('Alt+ArrowLeft');
    await page.keyboard.press('Alt+ArrowUp');
    assert.deepEqual(await ids(), start);
    await focusIsTileOf(first);
    await sameOrderAsData(w, a);
    assert.match(await live(w), /position 1 sur 5/);
    // Aux extrémités : rien ne bouge, c'est annoncé.
    await page.keyboard.press('Alt+ArrowLeft');
    assert.deepEqual(await ids(), start);
    assert.match(await live(w), /Déjà en premier/);
    // Boutons Monter / Descendre : le focus reste sur le bouton pressé.
    const last = start[4];
    await item(w, last).getByRole('button', { name: /^Monter : / }).click();
    assert.deepEqual(await ids(), [...start.slice(0, 3), start[4], start[3]]);
    await waitFocus((i) => document.activeElement?.classList.contains('shortcuts__up') && document.activeElement.closest('[data-link-id]')?.getAttribute('data-link-id') === i, last, 'le focus reste sur « Monter »');
    await item(w, last).getByRole('button', { name: /^Descendre : / }).click();
    assert.deepEqual(await ids(), start);
    await waitFocus((i) => document.activeElement?.classList.contains('shortcuts__down') && document.activeElement.closest('[data-link-id]')?.getAttribute('data-link-id') === i, last, 'le focus reste sur « Descendre »');
    await item(w, last).getByRole('button', { name: /^Descendre : / }).click();
    assert.match(await live(w), /Déjà en dernier/);
    assert.deepEqual(await ids(), start);
    // Un déplacement qui reste après « Terminer » et un rechargement.
    await item(w, first).getByRole('button', { name: /^Descendre : / }).click();
    await sameOrderAsData(w, a);
  });

  await step('« Terminer » : les tuiles redeviennent des liens, dans le nouvel ordre ; l\'ordre survit au rechargement, pas le mode', async () => {
    const w = widgets().first();
    const expected = await titlesOf(a);
    await w.getByRole('button', { name: 'Terminer' }).click();
    await w.getByRole('button', { name: 'Organiser' }).waitFor();
    assert.equal(await w.locator('.shortcuts__item button.shortcuts__tile').count(), 0);
    assert.equal(await tiles(w).count(), expected.length);
    assert.deepEqual(await tiles(w).evaluateAll((els) => els.map((e) => e.getAttribute('title'))), expected);
    await sleep(SETTLE);
    await session.reload();
    assert.deepEqual(await tiles(widgets().first()).evaluateAll((els) => els.map((e) => e.getAttribute('title'))), expected);
    assert.equal(await widgets().first().getByRole('button', { name: 'Organiser' }).getAttribute('aria-pressed'), 'false');
  });

  await step('maximum de 60 raccourcis : plus de tuile « Ajouter », message, retour dès qu\'il y a de la place', async () => {
    const w = widgets().first();
    const original = await dataOf(a);
    const many = Array.from({ length: 60 }, (_, i) => ({ id: `lien-${i}`, title: `Site ${i + 1}`, url: `https://site${i + 1}.example.com` }));
    await page.evaluate(([id, links]) => window.__dash.data.setData(id, { links }, { version: 1 }), [a, many]);
    await w.getByText('Maximum atteint : 60 raccourcis.').waitFor();
    assert.equal(await w.getByRole('button', { name: 'Ajouter un raccourci' }).count(), 0);
    assert.equal(await tiles(w).count(), 60);
    // Un lien en moins : la tuile « Ajouter » revient.
    await page.evaluate(([id, links]) => window.__dash.data.setData(id, { links }, { version: 1 }), [a, many.slice(1)]);
    await w.getByRole('button', { name: 'Ajouter un raccourci' }).waitFor();
    await page.evaluate(([id, data]) => window.__dash.data.setData(id, data, { version: 1 }), [a, original]);
    await w.getByRole('button', { name: 'Ajouter un raccourci' }).waitFor();
    assert.equal(await tiles(w).count(), original.links.length);
  });

  await step('deux widgets Raccourcis : liens distincts, conservés après rechargement, même couleur pour un même domaine', async () => {
    await page.evaluate(() => window.__dash.actions.addWidget('shortcuts'));
    await widgets().nth(1).waitFor();
    b = (await instances()).map((i) => i.id).find((id) => id !== a);
    await setLayout(a, { x: 0, y: 0, w: 6, h: 4 });
    await setLayout(b, { x: 6, y: 0, w: 5, h: 3 });
    await sleep(400);
    const wb = widgets().nth(1);
    assert.equal(await wb.locator('[data-testid="shortcuts-empty"]').count(), 1, 'le second widget est vide');
    await addByForm(wb, 'wikipedia.org');
    await addByForm(wb, 'github.com', 'GH perso');
    await sleep(SETTLE);
    assert.deepEqual(await titlesOf(b), ['wikipedia.org', 'GH perso']);
    assert.ok(!(await titlesOf(a)).includes('wikipedia.org'));
    assert.deepEqual(Object.keys(await readStorage(page)).filter((k) => k.startsWith('dash:data:')).sort(), [`dash:data:${a}`, `dash:data:${b}`].sort());
    const tileOf = (w, title) => tiles(w).filter({ has: page.locator(`.shortcuts__label:text-is("${title}")`) }).locator('.shortcuts__icon').first().getAttribute('data-tile');
    assert.equal(await tileOf(wb, 'GH perso'), await tileOf(widgets().first(), 'github.com'), 'github.com : même couleur dans les deux widgets');
    await session.reload();
    assert.deepEqual(await tiles(widgets().nth(1)).evaluateAll((els) => els.map((e) => e.getAttribute('title'))), ['wikipedia.org', 'GH perso']);
    assert.ok((await tiles(widgets().first()).count()) >= 5);
    // Supprimer dans l'un ne touche pas l'autre.
    const countA = await tiles(widgets().first()).count();
    await widgets().nth(1).getByRole('button', { name: 'Organiser' }).click();
    const gh = (await linksOf(b))[1];
    await item(widgets().nth(1), gh.id).getByRole('button', { name: /^Supprimer : / }).click();
    await widgets().nth(1).locator('.shortcuts__undo').waitFor();
    assert.deepEqual(await titlesOf(b), ['wikipedia.org']);
    assert.equal(await tiles(widgets().first()).count(), countA);
    assert.equal(await widgets().first().getByRole('button', { name: 'Terminer' }).count(), 0, 'le mode Organiser est propre à chaque widget');
  });

  await step('données stockées avec une adresse javascript: : jamais affichées comme lien, copie de sauvegarde conservée', async () => {
    await sleep(SETTLE);
    const key = `dash:data:${b}`;
    const stored = JSON.parse((await readStorage(page))[key]);
    stored.data.links = [{ id: 'x', title: 'Piège', url: 'javascript:ale\x72t(1)' }];
    await page.evaluate(([k, raw]) => localStorage.setItem(k, raw), [key, JSON.stringify(stored)]);
    await session.reload();
    assert.equal(await page.locator('a[href^="javascript:" i]').count(), 0);
    assert.equal(await page.getByText('Piège').count(), 0, 'le raccourci piégé n\'est pas affiché');
    assert.equal(await widgets().nth(1).locator('[data-testid="shortcuts-empty"]').count(), 1, 'valeurs par défaut affichées');
    await sleep(SETTLE);
    assert.match((await readStorage(page))[`dash:backup:${b}`], /Piège/, 'copie conservée');
    assert.deepEqual(dialogs, []);
  });

  await step('console propre, aucune boîte de dialogue, aucune requête d\'icône hors du test dédié', async () => {
    assert.deepEqual(log.errors, []);
    assert.deepEqual(dialogs, []);
  });
});
