// Parcours navigateur de la phase 6 : widget À faire (Todo).
//
//   node tests/e2e/phase6.mjs

import { assert, readStorage, runJourney, sleep } from './helpers.mjs';

const SETTLE = 700;

await runJourney('Parcours phase 6 (widget À faire)', async ({ step, open }) => {
  const session = await open({ label: 'todo', query: 'dev=1' });
  const { page, log } = session;
  const dialogs = [];
  page.on('dialog', (d) => {
    dialogs.push(d.message());
    d.dismiss();
  });

  const widgets = page.locator('section.widget[data-widget-type="todo"]');
  const instances = () => page.evaluate(() => window.__dash.dashboard.getState().pages[0].instances.map((i) => ({ id: i.id, settings: i.settings, layout: i.layout })));
  const tasksOf = (id) => page.evaluate((i) => window.__dash.data.getState().byId[i]?.data.tasks ?? null, id);
  const textsOf = async (id) => (await tasksOf(id)).map((t) => t.text);
  const shown = (w) => w.locator('.todo__text').allInnerTexts();
  const live = async (w) => (await w.locator('[data-testid="todo-live"]').textContent()).trim();
  const addField = (w) => w.getByLabel('Nouvelle tâche');
  const rowOf = (w, text) => w.locator('.todo__item').filter({ has: page.locator('.todo__text', { hasText: new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }) });
  const addTasks = async (w, texts) => {
    for (const t of texts) {
      await addField(w).fill(t);
      await addField(w).press('Enter');
    }
  };
  /** Le focus est posé par un effet Preact, après le rendu : on l'attend au lieu de le lire aussitôt. */
  const waitFocus = (fn, arg, message) =>
    page.waitForFunction(fn, arg, { timeout: 3000 }).catch(() => {
      throw new assert.AssertionError({ message });
    });
  const focusLabel = (label, message) => waitFocus((l) => document.activeElement?.getAttribute('aria-label') === l, label, message ?? `le focus devrait être sur « ${label} »`);
  const focusClass = (cls, message) => waitFocus((c) => document.activeElement?.classList.contains(c), cls, message);
  const focusText = (text, message) => waitFocus((t) => document.activeElement?.textContent.trim() === t, text, message);
  const setLayout = (id, layout) => page.evaluate(([i, l]) => window.__dash.dashboard.updateLayouts({ [i]: l }), [id, layout]);
  const dialogSwitch = (dialog, name) => dialog.locator('label.toggle', { hasText: name });

  /** Glisse la poignée d'une ligne sur une autre, à la souris. */
  async function dragRow(w, fromIndex, toIndex) {
    const handle = await w.locator('.todo__handle').nth(fromIndex).boundingBox();
    const target = await w.locator('.todo__item').nth(toIndex).boundingBox();
    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + (toIndex > fromIndex ? 8 : -8), { steps: 4 });
    await page.mouse.move(x, target.y + target.height / 2 + (toIndex > fromIndex ? 6 : -6), { steps: 12 });
    await sleep(150);
    await page.mouse.up();
    await sleep(400);
  }

  let a;
  let b;

  await step('le catalogue propose « À faire » ; l\'ajout crée un widget 4×4 vide avec son message', async () => {
    await page.getByRole('button', { name: 'Ajouter un widget' }).first().click();
    const item = page.locator('.catalog__item[data-widget-type="todo"]');
    assert.equal(await item.count(), 1);
    assert.match(await item.innerText(), /À faire/);
    assert.match(await page.locator('.catalog__group:has(.catalog__item[data-widget-type="todo"]) .catalog__group-title').innerText(), /Organisation/i);
    await page.getByRole('button', { name: 'Ajouter À faire' }).click();
    await widgets.first().waitFor();
    [{ id: a }] = await instances();
    const { layout } = (await instances())[0];
    assert.deepEqual({ w: layout.w, h: layout.h }, { w: 4, h: 4 });
    assert.equal((await widgets.first().locator('[data-testid="todo-empty"]').innerText()).trim(), 'Aucune tâche. Ajoute la première ci-dessous.');
    assert.equal((await widgets.first().locator('[data-testid="todo-count"]').innerText()).trim(), '0 / 0');
    await setLayout(a, { x: 0, y: 0, w: 5, h: 6 });
    await sleep(400);
  });

  await step('ajout par Entrée : le champ reste actif, vide, prêt pour la suivante ; texte vide refusé', async () => {
    const w = widgets.first();
    await addField(w).click();
    await page.keyboard.type('Acheter du pain');
    await page.keyboard.press('Enter');
    assert.equal(await addField(w).inputValue(), '');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Nouvelle tâche', 'le focus reste dans le champ');
    await page.keyboard.type('  Appeler le médecin  ');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Ranger le bureau');
    await page.keyboard.press('Enter');
    assert.deepEqual(await shown(w), ['Acheter du pain', 'Appeler le médecin', 'Ranger le bureau']);
    await page.keyboard.type('     ');
    await page.keyboard.press('Enter');
    assert.equal((await shown(w)).length, 3, 'un texte vide n\'ajoute rien');
    assert.match(await live(w), /Écris d'abord le texte/);
    await page.keyboard.press('Escape');
    assert.equal(await addField(w).inputValue(), '', 'Échap vide le champ');
    await sleep(SETTLE);
    const tasks = await tasksOf(a);
    assert.deepEqual(tasks.map((t) => [t.text, t.done, t.doneAt]), [['Acheter du pain', false, null], ['Appeler le médecin', false, null], ['Ranger le bureau', false, null]]);
    assert.ok(tasks.every((t) => typeof t.id === 'string' && t.id.length > 10 && Number.isFinite(t.createdAt)));
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Nouvelle tâche', 'Échap vide le champ sans le quitter');
  });

  await step('cocher : barrée, compteur et barre de progression mis à jour, terminées en bas (doneLast)', async () => {
    const w = widgets.first();
    await rowOf(w, 'Acheter du pain').locator('.todo__check').check();
    assert.equal((await w.locator('[data-testid="todo-count"]').innerText()).trim(), '1 / 3');
    assert.equal(await w.locator('progress').getAttribute('value'), '1');
    assert.equal(await w.locator('progress').getAttribute('max'), '3');
    assert.deepEqual(await shown(w), ['Appeler le médecin', 'Ranger le bureau', 'Acheter du pain'], 'la tâche terminée descend en bas');
    const decoration = await rowOf(w, 'Acheter du pain').locator('.todo__text').evaluate((e) => getComputedStyle(e).textDecorationLine);
    assert.equal(decoration, 'line-through');
    assert.equal(await rowOf(w, 'Appeler le médecin').locator('.todo__text').evaluate((e) => getComputedStyle(e).textDecorationLine), 'none');
    assert.match(await live(w), /Tâche terminée : Acheter du pain/);
    const done = (await tasksOf(a)).find((t) => t.text === 'Acheter du pain');
    assert.equal(done.done, true);
    assert.ok(done.doneAt > 0);
    assert.equal((await tasksOf(a)).map((t) => t.text).join('|'), 'Acheter du pain|Appeler le médecin|Ranger le bureau', 'l\'ordre des données ne change pas : seul l\'affichage est trié');
    await rowOf(w, 'Acheter du pain').locator('.todo__check').uncheck();
    assert.equal((await w.locator('[data-testid="todo-count"]').innerText()).trim(), '0 / 3');
    assert.equal((await tasksOf(a)).find((t) => t.text === 'Acheter du pain').doneAt, null, 'doneAt est effacé');
    assert.deepEqual(await shown(w), ['Acheter du pain', 'Appeler le médecin', 'Ranger le bureau']);
  });

  await step('modifier : double-clic, Entrée valide ; bouton « Modifier », Échap annule ; la perte de focus valide ; texte vide ignoré', async () => {
    const w = widgets.first();
    await rowOf(w, 'Ranger le bureau').locator('.todo__text').dblclick();
    const editor = w.locator('.todo__edit');
    await editor.waitFor();
    assert.equal(await page.evaluate(() => document.activeElement.className), 'todo__edit');
    await page.keyboard.type('Ranger le salon');
    await page.keyboard.press('Enter');
    await editor.waitFor({ state: 'detached' });
    assert.deepEqual(await shown(w), ['Acheter du pain', 'Appeler le médecin', 'Ranger le salon']);
    await focusLabel('Modifier : Ranger le salon', 'le focus revient au bouton « Modifier »');

    // Bouton « Modifier » puis Échap : rien ne change.
    await w.getByRole('button', { name: 'Modifier : Appeler le médecin' }).click();
    await editor.waitFor();
    assert.equal(await editor.inputValue(), 'Appeler le médecin');
    await page.keyboard.type(' demain matin');
    await page.keyboard.press('Escape');
    await editor.waitFor({ state: 'detached' });
    assert.deepEqual(await shown(w), ['Acheter du pain', 'Appeler le médecin', 'Ranger le salon']);
    await focusLabel('Modifier : Appeler le médecin');

    // Perte de focus : valide.
    await w.getByRole('button', { name: 'Modifier : Acheter du pain' }).click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('Acheter du pain complet');
    await addField(w).click();
    await editor.waitFor({ state: 'detached' });
    assert.equal((await shown(w))[0], 'Acheter du pain complet');

    // Texte vide : la tâche est inchangée.
    await w.getByRole('button', { name: 'Modifier : Acheter du pain complet' }).click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Enter');
    await editor.waitFor({ state: 'detached' });
    assert.equal((await shown(w))[0], 'Acheter du pain complet');
    await sleep(SETTLE);
    assert.deepEqual(await textsOf(a), ['Acheter du pain complet', 'Appeler le médecin', 'Ranger le salon']);
  });

  await step('supprimer : barre « Annuler », la tâche revient à sa place avec son état ; sans clic, la barre disparaît au bout de 6 s', async () => {
    const w = widgets.first();
    await rowOf(w, 'Appeler le médecin').locator('.todo__check').check(); // doneAt à conserver à la restauration
    const before = await tasksOf(a);
    await w.getByRole('button', { name: 'Supprimer : Appeler le médecin' }).click();
    assert.deepEqual(await shown(w), ['Acheter du pain complet', 'Ranger le salon']);
    const bar = w.locator('.todo__undo');
    assert.match(await bar.innerText(), /Tâche supprimée/);
    await focusText('Annuler', 'le focus passe sur « Annuler »');
    assert.match(await live(w), /Tâche supprimée : Appeler le médecin/);
    await page.keyboard.press('Enter');
    await bar.waitFor({ state: 'detached' });
    assert.deepEqual(await tasksOf(a), before, 'la tâche revient exactement comme elle était, à la même place');
    assert.match(await live(w), /Tâche restaurée/);
    await focusClass('todo__check', 'le focus revient sur la case de la tâche restaurée');
    await rowOf(w, 'Appeler le médecin').locator('.todo__check').uncheck();

    // Suppression sans annulation : la barre disparaît d'elle-même.
    await w.getByRole('button', { name: 'Supprimer : Ranger le salon' }).click();
    await bar.waitFor();
    await sleep(5000);
    assert.equal(await bar.count(), 1, 'encore là avant 6 s');
    await sleep(1500);
    assert.equal(await bar.count(), 0, 'disparue après 6 s');
    await focusLabel('Nouvelle tâche', 'le focus retourne au champ d\'ajout');
    await sleep(SETTLE);
    assert.deepEqual(await textsOf(a), ['Acheter du pain complet', 'Appeler le médecin']);
  });

  await step('« Vider les terminées » : visible seulement s\'il y a des tâches terminées', async () => {
    const w = widgets.first();
    assert.equal(await w.getByRole('button', { name: 'Vider les terminées' }).count(), 0);
    await addTasks(w, ['Tâche 3', 'Tâche 4']);
    await rowOf(w, 'Tâche 3').locator('.todo__check').check();
    await rowOf(w, 'Tâche 4').locator('.todo__check').check();
    await w.getByRole('button', { name: 'Vider les terminées' }).click();
    assert.deepEqual(await shown(w), ['Acheter du pain complet', 'Appeler le médecin']);
    await waitFocus(() => document.activeElement?.classList.contains('todo__filter'), null, 'le focus doit passer au filtre actif');
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('todo__add-input')), false, 'le focus ne va pas dans le champ d\'ajout');
    assert.equal(await w.getByRole('button', { name: 'Vider les terminées' }).count(), 0);
    assert.match(await live(w), /2 tâches terminées supprimées/);
  });

  await step('texte brut : <script>alert(1)</script> s\'affiche tel quel, sans être interprété', async () => {
    const w = widgets.first();
    await addTasks(w, ['<script>alert(1)</script>', '<img src=x onerror=alert(2)> & <b>gras</b>']);
    assert.ok((await shown(w)).includes('<script>alert(1)</script>'));
    assert.ok((await shown(w)).includes('<img src=x onerror=alert(2)> & <b>gras</b>'));
    assert.equal(await w.locator('.todo__list script, .todo__list img, .todo__list b').count(), 0);
    await sleep(300);
    assert.deepEqual(dialogs, [], 'aucune boîte de dialogue ne s\'est ouverte');
    // Modification d'un texte HTML : toujours du texte.
    await w.getByRole('button', { name: 'Modifier : <script>alert(1)</script>' }).click();
    assert.equal(await w.locator('.todo__edit').inputValue(), '<script>alert(1)</script>');
    await page.keyboard.press('Escape');
    for (const text of ['<script>alert(1)</script>', '<img src=x onerror=alert(2)> & <b>gras</b>']) {
      await w.getByRole('button', { name: `Supprimer : ${text}` }).click();
      await page.keyboard.press('Enter'); // Annuler : on teste aussi la restauration d'un texte HTML
    }
    assert.ok((await shown(w)).includes('<script>alert(1)</script>'));
    for (const text of ['<script>alert(1)</script>', '<img src=x onerror=alert(2)> & <b>gras</b>']) {
      await w.getByRole('button', { name: `Supprimer : ${text}` }).click();
      await w.locator('.todo__undo').waitFor();
    }
    await sleep(6500);
    assert.deepEqual(await shown(w), ['Acheter du pain complet', 'Appeler le médecin']);
  });

  await step('réordonnancement à la souris : la tâche glissée prend sa place, Preact garde le DOM', async () => {
    const w = widgets.first();
    await addTasks(w, ['Troisième', 'Quatrième']);
    await sleep(SETTLE);
    assert.deepEqual(await textsOf(a), ['Acheter du pain complet', 'Appeler le médecin', 'Troisième', 'Quatrième']);
    await dragRow(w, 3, 0);
    assert.deepEqual(await textsOf(a), ['Quatrième', 'Acheter du pain complet', 'Appeler le médecin', 'Troisième']);
    assert.deepEqual(await shown(w), ['Quatrième', 'Acheter du pain complet', 'Appeler le médecin', 'Troisième'], 'l\'affichage suit les données');
    assert.equal(await w.locator('.todo__item').count(), 4, 'aucun nœud en double ni orphelin');
    await dragRow(w, 0, 2);
    assert.deepEqual(await textsOf(a), ['Acheter du pain complet', 'Appeler le médecin', 'Quatrième', 'Troisième']);
    // Un clic simple sur la poignée ne déplace rien.
    await w.locator('.todo__handle').nth(1).click();
    assert.deepEqual(await textsOf(a), ['Acheter du pain complet', 'Appeler le médecin', 'Quatrième', 'Troisième']);
    // La case reste cochable après un glisser (le DOM n'a pas été abîmé).
    await rowOf(w, 'Troisième').locator('.todo__check').check();
    await rowOf(w, 'Troisième').locator('.todo__check').uncheck();
    assert.equal((await tasksOf(a)).find((t) => t.text === 'Troisième').done, false);
  });

  await step('réordonnancement au clavier : Alt + flèches sur la poignée, annonce, focus conservé, bornes', async () => {
    const w = widgets.first();
    const handleOf = (text) => rowOf(w, text).locator('.todo__handle');
    await handleOf('Quatrième').focus();
    await page.keyboard.press('Alt+ArrowUp');
    assert.deepEqual(await textsOf(a), ['Acheter du pain complet', 'Quatrième', 'Appeler le médecin', 'Troisième']);
    assert.equal(await live(w), 'Quatrième : position 2 sur 4');
    await focusLabel('Déplacer : Quatrième', 'le focus reste sur la poignée');
    await page.keyboard.press('Alt+ArrowUp');
    await page.keyboard.press('Alt+ArrowUp');
    assert.match(await live(w), /Déjà en haut/);
    assert.equal((await textsOf(a))[0], 'Quatrième');
    for (let i = 0; i < 5; i++) await page.keyboard.press('Alt+ArrowDown');
    assert.match(await live(w), /Déjà en bas/);
    assert.deepEqual(await textsOf(a), ['Acheter du pain complet', 'Appeler le médecin', 'Troisième', 'Quatrième']);
    await page.keyboard.press('ArrowDown');
    assert.deepEqual(await textsOf(a), ['Acheter du pain complet', 'Appeler le médecin', 'Troisième', 'Quatrième'], 'sans Alt, rien ne bouge');
  });

  await step('avec doneLast, le déplacement reste dans le groupe ; sans doneLast, tout se déplace', async () => {
    const w = widgets.first();
    await rowOf(w, 'Acheter du pain complet').locator('.todo__check').check();
    // Affichage : Appeler, Troisième, Quatrième, Acheter (terminée).
    assert.deepEqual(await shown(w), ['Appeler le médecin', 'Troisième', 'Quatrième', 'Acheter du pain complet']);
    await rowOf(w, 'Quatrième').locator('.todo__handle').focus();
    await page.keyboard.press('Alt+ArrowDown');
    assert.match(await live(w), /Déjà en bas/, 'ne passe pas sous les terminées');
    await rowOf(w, 'Acheter du pain complet').locator('.todo__handle').focus();
    await page.keyboard.press('Alt+ArrowUp');
    assert.match(await live(w), /Déjà en haut/, 'ne remonte pas parmi les tâches à faire');
    await rowOf(w, 'Troisième').locator('.todo__handle').focus();
    await page.keyboard.press('Alt+ArrowUp');
    assert.deepEqual(await shown(w), ['Troisième', 'Appeler le médecin', 'Quatrième', 'Acheter du pain complet']);
    await rowOf(w, 'Acheter du pain complet').locator('.todo__check').uncheck();
    await sleep(SETTLE);
  });

  await step('réordonnancement désactivé sous filtre : poignées inactives, glisser sans effet', async () => {
    const w = widgets.first();
    const before = await textsOf(a);
    await w.getByRole('button', { name: 'À faire', exact: true }).click();
    assert.equal(await w.getByRole('button', { name: 'À faire', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await w.getByRole('button', { name: 'Toutes' }).getAttribute('aria-pressed'), 'false');
    const handles = w.locator('.todo__handle');
    assert.ok((await handles.count()) > 1);
    for (const h of await handles.all()) assert.equal(await h.isDisabled(), true);
    await dragRow(w, 0, 2).catch(() => {});
    await page.mouse.up();
    assert.deepEqual(await textsOf(a), before, 'rien n\'a bougé');
    await w.getByRole('button', { name: 'Toutes' }).click();
    for (const h of await w.locator('.todo__handle').all()) assert.equal(await h.isDisabled(), false);
  });

  await step('filtres : « À faire », « Terminées », états vides distincts', async () => {
    const w = widgets.first();
    await rowOf(w, 'Quatrième').locator('.todo__check').check();
    await w.getByRole('button', { name: 'Terminées', exact: true }).click();
    assert.deepEqual(await shown(w), ['Quatrième']);
    await w.getByRole('button', { name: 'À faire', exact: true }).click();
    assert.ok(!(await shown(w)).includes('Quatrième'));
    await rowOf(w, 'Quatrième').count();
    // Filtre sans résultat : on termine tout.
    while ((await w.locator('.todo__check:not(:checked)').count()) > 0) await w.locator('.todo__check:not(:checked)').first().click();
    assert.equal((await w.locator('[data-testid="todo-empty"]').innerText()).trim(), 'Aucune tâche à faire.');
    await w.getByRole('button', { name: 'Terminées', exact: true }).click();
    while ((await w.locator('.todo__check:checked').count()) > 0) await w.locator('.todo__check:checked').first().click();
    assert.equal((await w.locator('[data-testid="todo-empty"]').innerText()).trim(), 'Aucune tâche terminée.');
    await w.getByRole('button', { name: 'Toutes' }).click();
    assert.equal(await w.locator('[data-testid="todo-empty"]').count(), 0);
    // Un ajout depuis le filtre « Terminées » bascule sur « Toutes » pour que la tâche reste visible.
    await w.getByRole('button', { name: 'Terminées', exact: true }).click();
    await addTasks(w, ['Visible après ajout']);
    assert.equal(await w.getByRole('button', { name: 'Toutes' }).getAttribute('aria-pressed'), 'true');
    assert.ok((await shown(w)).includes('Visible après ajout'));
  });

  await step('réglages par le panneau : progression et « terminées en bas »', async () => {
    const w = widgets.first();
    await rowOf(w, 'Acheter du pain complet').locator('.todo__check').check();
    assert.equal((await shown(w)).at(-1), 'Acheter du pain complet', 'terminée : en bas par défaut');
    await w.hover();
    await w.getByRole('button', { name: 'Options de À faire' }).click();
    await page.getByRole('menuitem', { name: 'Réglages' }).click();
    const dialog = page.getByRole('dialog', { name: 'Réglages : À faire' });
    await dialog.waitFor();
    assert.equal(await dialog.getByRole('switch', { name: 'Afficher la progression' }).isChecked(), true);
    assert.equal(await dialog.getByRole('switch', { name: 'Tâches terminées en bas' }).isChecked(), true);
    await dialogSwitch(dialog, 'Afficher la progression').click();
    assert.equal(await w.locator('progress').count(), 0);
    await dialogSwitch(dialog, 'Tâches terminées en bas').click();
    assert.equal((await shown(w))[0], 'Acheter du pain complet', 'sans doneLast, la tâche terminée reste à sa place');
    await dialogSwitch(dialog, 'Afficher la progression').click();
    await dialogSwitch(dialog, 'Tâches terminées en bas').click();
    assert.equal(await w.locator('progress').count(), 1);
    assert.equal((await shown(w)).at(-1), 'Acheter du pain complet');
    await dialog.getByRole('button', { name: 'Terminé' }).click();
    await dialog.waitFor({ state: 'detached' });
    assert.deepEqual((await instances()).find((i) => i.id === a).settings, { showProgress: true, doneLast: true });
    await rowOf(w, 'Acheter du pain complet').locator('.todo__check').uncheck();
  });

  await step('deux widgets À faire : listes indépendantes, une clé de données chacun, conservées après rechargement', async () => {
    await page.evaluate(() => window.__dash.actions.addWidget('todo'));
    await widgets.nth(1).waitFor();
    b = (await instances()).map((i) => i.id).find((id) => id !== a);
    await setLayout(a, { x: 0, y: 0, w: 5, h: 6 });
    await setLayout(b, { x: 6, y: 0, w: 5, h: 6 });
    await sleep(400);
    const wa = widgets.nth(0);
    const wb = widgets.nth(1);
    assert.equal(await wb.locator('.todo__item').count(), 0, 'la nouvelle liste est vide');
    await addTasks(wb, ['Liste B : un', 'Liste B : deux']);
    await rowOf(wb, 'Liste B : un').locator('.todo__check').check();
    await sleep(SETTLE);
    const listA = await textsOf(a);
    assert.ok(!listA.some((t) => t.startsWith('Liste B')), 'la liste A ne contient rien de B');
    assert.deepEqual(await textsOf(b), ['Liste B : un', 'Liste B : deux']);
    const keys = Object.keys(await readStorage(page)).filter((k) => k.startsWith('dash:data:'));
    assert.deepEqual(keys.sort(), [`dash:data:${a}`, `dash:data:${b}`].sort());
    const countsBefore = [(await wa.locator('[data-testid="todo-count"]').innerText()).trim(), (await wb.locator('[data-testid="todo-count"]').innerText()).trim()];
    assert.equal(countsBefore[1], '1 / 2');

    await session.reload();
    assert.equal(await widgets.count(), 2);
    assert.deepEqual(await textsOf(a), listA);
    assert.deepEqual(await textsOf(b), ['Liste B : un', 'Liste B : deux']);
    assert.deepEqual(await shown(widgets.nth(1)), ['Liste B : deux', 'Liste B : un']);
    assert.deepEqual([(await widgets.nth(0).locator('[data-testid="todo-count"]').innerText()).trim(), (await widgets.nth(1).locator('[data-testid="todo-count"]').innerText()).trim()], countsBefore);
    assert.ok((await tasksOf(b)).find((t) => t.text === 'Liste B : un').done, 'l\'état « terminée » survit');
  });

  await step('150 tâches : seule la liste défile, le champ d\'ajout reste visible, les actions restent rapides', async () => {
    const wb = widgets.nth(1);
    await page.evaluate((id) => {
      const tasks = Array.from({ length: 150 }, (_, i) => ({ id: `seed-${i}`, text: `Tâche numéro ${i + 1} — un texte un peu long pour occuper de la place dans la ligne`, done: i % 5 === 0, createdAt: i, doneAt: i % 5 === 0 ? i : null }));
      window.__dash.data.setData(id, { tasks }, { version: 1 });
    }, b);
    await wb.locator('.todo__item').nth(149).waitFor({ state: 'attached' });
    assert.equal(await wb.locator('.todo__item').count(), 150);
    assert.equal((await wb.locator('[data-testid="todo-count"]').innerText()).trim(), '30 / 150');
    const geometry = await wb.evaluate((el) => {
      const body = el.closest('.widget__body') ?? el.querySelector('.widget__body');
      const scroll = el.querySelector('.todo__scroll');
      const add = el.querySelector('.todo__add').getBoundingClientRect();
      const widget = el.closest('.widget').getBoundingClientRect();
      return {
        bodyOverflow: body.scrollHeight - body.clientHeight,
        listScrolls: scroll.scrollHeight > scroll.clientHeight * 5,
        addInside: add.bottom <= widget.bottom + 1 && add.top >= widget.top,
        headerTop: el.querySelector('.todo__summary').getBoundingClientRect().top - widget.top,
      };
    });
    assert.ok(geometry.bodyOverflow <= 1, `le corps du widget ne défile pas (${geometry.bodyOverflow})`);
    assert.ok(geometry.listScrolls, 'la liste défile');
    assert.ok(geometry.addInside, 'le champ d\'ajout reste visible');
    // Défilement de la liste : l'en-tête et le champ ne bougent pas.
    const before = await wb.locator('.todo__add').boundingBox();
    await wb.locator('.todo__scroll').evaluate((e) => (e.scrollTop = 2000));
    await sleep(100);
    assert.deepEqual(await wb.locator('.todo__add').boundingBox(), before);

    // Latence d'une action : de la case cochée à l'affichage mis à jour.
    const latency = async (fn) => {
      const t0 = Date.now();
      await fn();
      return Date.now() - t0;
    };
    const toggleMs = await latency(async () => {
      await wb.locator('.todo__check').first().check();
      await page.waitForFunction(() => document.querySelectorAll('section.widget[data-widget-type="todo"]')[1].querySelector('[data-testid="todo-count"]').textContent.trim() === '31 / 150');
    });
    const addMs = await latency(async () => {
      await addField(wb).fill('Nouvelle tâche tout en bas');
      await addField(wb).press('Enter');
      await page.waitForFunction(() => document.querySelectorAll('section.widget[data-widget-type="todo"]')[1].querySelectorAll('.todo__item').length === 151);
    });
    console.log(`      latence (150 tâches) : cocher ${toggleMs} ms, ajouter ${addMs} ms`);
    assert.ok(toggleMs < 600 && addMs < 600, 'les actions restent fluides');
    // La nouvelle tâche est amenée dans la vue.
    const inView = await wb.evaluate((el) => {
      const scroll = el.querySelector('.todo__scroll').getBoundingClientRect();
      const rows = [...el.querySelectorAll('.todo__item')];
      const row = rows.find((r) => r.textContent.includes('Nouvelle tâche tout en bas')).getBoundingClientRect();
      return row.top >= scroll.top - 1 && row.bottom <= scroll.bottom + 1;
    });
    assert.ok(inView, 'la tâche ajoutée est visible');
    // Un glisser sur une longue liste fonctionne aussi.
    await wb.locator('.todo__scroll').evaluate((e) => (e.scrollTop = 0));
    await sleep(100);
    const first = await textsOf(b);
    await dragRow(wb, 3, 1);
    const after = await textsOf(b);
    assert.notDeepEqual(after, first);
    assert.equal(after.length, 151);
    assert.equal(new Set(after).size, 151);
  });

  await step('console propre, aucune boîte de dialogue', async () => {
    assert.deepEqual(log.errors, []);
    assert.deepEqual(dialogs, []);
  });
});
