// Parcours navigateur de la phase 7 : widget Notes (bloc-notes à onglets).
//
//   node tests/e2e/phase7.mjs

import { assert, readStorage, runJourney, sleep } from './helpers.mjs';

const SETTLE = 700;

await runJourney('Parcours phase 7 (widget Notes)', async ({ step, open }) => {
  const session = await open({ label: 'notes', query: 'dev=1' });
  let { page } = session;
  const { log } = session;
  const dialogs = [];
  page.on('dialog', (d) => {
    dialogs.push(d.message());
    d.dismiss();
  });

  const widgets = () => page.locator('section.widget[data-widget-type="notes"]');
  const instances = () => page.evaluate(() => window.__dash.dashboard.getState().pages[0].instances.map((i) => ({ id: i.id, settings: i.settings, layout: i.layout })));
  const dataOf = (id) => page.evaluate((i) => window.__dash.data.getState().byId[i]?.data ?? null, id);
  const notesOf = async (id) => (await dataOf(id)).notes;
  const setLayout = (id, layout) => page.evaluate(([i, l]) => window.__dash.dashboard.updateLayouts({ [i]: l }), [id, layout]);
  const tabs = (w) => w.getByRole('tab');
  const tabTitles = (w) => tabs(w).allInnerTexts().then((list) => list.map((t) => t.trim()));
  const textarea = (w) => w.locator('.notes__textarea');
  const live = async (w) => (await w.locator('[data-testid="notes-live"]').textContent()).trim();
  const dialogSwitch = (dialog, name) => dialog.locator('label.toggle', { hasText: name });

  const waitFocus = (fn, arg, message) =>
    page.waitForFunction(fn, arg, { timeout: 3000 }).catch(() => {
      throw new assert.AssertionError({ message });
    });
  const focusIsTextarea = () => waitFocus(() => document.activeElement?.classList.contains('notes__textarea'), null, 'le focus devrait être dans la zone de saisie');
  const focusIsTab = (title) => waitFocus((t) => document.activeElement?.getAttribute('role') === 'tab' && document.activeElement.textContent.trim() === t, title, `le focus devrait être sur l'onglet « ${title} »`);
  const focusLabel = (label) => waitFocus((l) => document.activeElement?.getAttribute('aria-label') === l, label, `le focus devrait être sur « ${label} »`);

  /** Compte les appels à localStorage.setItem, par clé. À reposer après chaque chargement de page. */
  const spyOnWrites = () =>
    page.evaluate(() => {
      window.__sets = [];
      if (!window.__spied) {
        window.__spied = true;
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          window.__sets.push(key);
          return original.call(this, key, value);
        };
      }
    });
  const writesTo = (key) => page.evaluate((k) => window.__sets.filter((x) => x === k).length, key);

  let a;
  let b;

  await step('le catalogue propose « Notes » ; l\'ajout crée un widget 5×4 avec son état vide', async () => {
    await page.getByRole('button', { name: 'Ajouter un widget' }).first().click();
    const item = page.locator('.catalog__item[data-widget-type="notes"]');
    assert.equal(await item.count(), 1);
    assert.match(await page.locator('.catalog__group:has(.catalog__item[data-widget-type="notes"]) .catalog__group-title').innerText(), /Organisation/i);
    await page.getByRole('button', { name: 'Ajouter Notes' }).click();
    await widgets().first().waitFor();
    [{ id: a }] = await instances();
    const { layout } = (await instances())[0];
    assert.deepEqual({ w: layout.w, h: layout.h }, { w: 5, h: 4 });
    const w = widgets().first();
    assert.equal((await w.locator('.notes__empty-title').innerText()).trim(), 'Aucune note');
    assert.equal(await w.getByRole('button', { name: 'Créer une note' }).count(), 1);
    assert.deepEqual(await dataOf(a), { activeId: null, notes: [] }, 'données par défaut : aucune note');
  });

  await step('« Créer une note » : onglet, zone de saisie focalisée, aria-label avec le titre', async () => {
    const w = widgets().first();
    await w.getByRole('button', { name: 'Créer une note' }).click();
    await focusIsTextarea();
    assert.deepEqual(await tabTitles(w), ['Note sans titre']);
    assert.equal(await w.getByRole('tablist').getAttribute('aria-label'), 'Notes');
    assert.equal(await tabs(w).first().getAttribute('aria-selected'), 'true');
    assert.equal(await w.getByRole('tabpanel').count(), 1);
    assert.equal(await textarea(w).getAttribute('aria-label'), 'Contenu de la note Note sans titre');
    assert.equal(await w.getByRole('tabpanel').getAttribute('aria-labelledby'), await tabs(w).first().getAttribute('id'));
    assert.equal(await tabs(w).first().getAttribute('aria-controls'), await w.getByRole('tabpanel').getAttribute('id'));
    assert.equal(await textarea(w).getAttribute('maxlength'), '50000');
    assert.match(await w.locator('[data-testid="notes-modified"]').innerText(), /^Modifiée à \d\d:\d\d$/);
  });

  await step('la saisie met à jour les données à chaque frappe ; le titre suit la première ligne', async () => {
    const w = widgets().first();
    await page.keyboard.type('Courses');
    assert.equal((await notesOf(a))[0].content, 'Courses', 'le store est à jour tout de suite, sans minuterie');
    await page.keyboard.type(' de la semaine\nlait, pain');
    const note = (await notesOf(a))[0];
    assert.equal(note.content, 'Courses de la semaine\nlait, pain');
    assert.equal(note.title, null);
    assert.equal(note.format, 'text');
    assert.deepEqual(await tabTitles(w), ['Courses de la semaine']);
    assert.equal(await textarea(w).getAttribute('aria-label'), 'Contenu de la note Courses de la semaine');
    assert.equal((await dataOf(a)).activeId, note.id);
    assert.ok(Math.abs(note.updatedAt - Date.now()) < 60_000);
  });

  await step('saisie puis rechargement immédiat : le texte est là', async () => {
    await page.keyboard.type('\nbeurre');
    // Aucune attente : la persistance doit forcer l'écriture à la fermeture de la page.
    await session.reload();
    const w = widgets().first();
    assert.equal(await textarea(w).inputValue(), 'Courses de la semaine\nlait, pain\nbeurre');
    assert.deepEqual(await tabTitles(w), ['Courses de la semaine']);
  });

  await step('saisie puis fermeture de l\'onglet du navigateur : le texte est là à la réouverture', async () => {
    const second = await session.context.newPage();
    await second.goto(page.url());
    await second.waitForSelector('section.widget[data-widget-type="notes"] .notes__textarea');
    await second.locator('.notes__textarea').click();
    await second.keyboard.press('Control+End');
    await second.keyboard.type('\nfermé tout de suite');
    await second.close({ runBeforeUnload: true });
    await page.reload();
    await page.waitForSelector('section.widget[data-widget-type="notes"] .notes__textarea');
    assert.equal(await textarea(widgets().first()).inputValue(), 'Courses de la semaine\nlait, pain\nbeurre\nfermé tout de suite');
  });

  await step('pas de curseur qui saute : saisie rapide au milieu du texte, texte long', async () => {
    const w = widgets().first();
    const ta = textarea(w);
    await ta.click();
    await ta.evaluate((el) => {
      el.setSelectionRange(7, 7); // juste après « Courses »
    });
    await page.keyboard.type('-XYZ-', { delay: 0 });
    let value = await ta.inputValue();
    assert.equal(value.slice(0, 20), 'Courses-XYZ- de la s');
    assert.equal(await ta.evaluate((el) => el.selectionStart), 12, 'le curseur est resté derrière le texte tapé');
    // Texte long, tapé d'une traite à la fin.
    await page.keyboard.press('Control+End');
    const before = await ta.inputValue();
    const chunk = 'abcdefghij '.repeat(100); // 1 100 caractères
    const t0 = Date.now();
    await page.keyboard.type(chunk, { delay: 0 });
    const elapsed = Date.now() - t0;
    value = await ta.inputValue();
    assert.equal(value, before + chunk, 'aucun caractère perdu ni déplacé');
    assert.equal(await ta.evaluate((el) => el.selectionStart), value.length);
    assert.equal((await notesOf(a))[0].content, value);
    console.log(`      1 100 caractères tapés en ${elapsed} ms (${(elapsed / 1100).toFixed(2)} ms par touche)`);
    assert.ok(elapsed < 1100 * 25, 'la frappe reste fluide');
    // Retour au contenu court pour la suite.
    await ta.fill('Courses de la semaine\nlait, pain');
    await sleep(SETTLE);
  });

  await step('une rafale de 200 frappes ne produit pas 200 écritures dans localStorage', async () => {
    await spyOnWrites();
    const w = widgets().first();
    await textarea(w).click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('x'.repeat(200), { delay: 0 });
    await sleep(SETTLE + 400);
    const key = `dash:data:${a}`;
    const writes = await writesTo(key);
    console.log(`      200 frappes : ${writes} écriture(s) dans ${key.slice(0, 18)}…`);
    assert.ok(writes >= 1, 'la saisie est bien enregistrée');
    assert.ok(writes <= 5, `trop d'écritures : ${writes}`);
    const stored = JSON.parse((await readStorage(page))[key]);
    assert.equal(stored.data.notes[0].content.endsWith('x'.repeat(200)), true);
    await textarea(w).fill('Courses de la semaine\nlait, pain');
    await sleep(SETTLE);
  });

  await step('plusieurs notes en onglets : création, changement d\'onglet, onglet actif mémorisé après rechargement', async () => {
    const w = widgets().first();
    await w.getByRole('button', { name: 'Nouvelle note' }).click();
    await focusIsTextarea();
    await page.keyboard.type('Idées de week-end');
    await w.getByRole('button', { name: 'Nouvelle note' }).click();
    await focusIsTextarea();
    await page.keyboard.type('Liste de cadeaux\nmaman: livre');
    assert.deepEqual(await tabTitles(w), ['Courses de la semaine', 'Idées de week-end', 'Liste de cadeaux']);
    assert.equal(await textarea(w).inputValue(), 'Liste de cadeaux\nmaman: livre');
    await tabs(w).nth(1).click();
    assert.equal(await textarea(w).inputValue(), 'Idées de week-end');
    assert.deepEqual(await Promise.all([0, 1, 2].map((i) => tabs(w).nth(i).getAttribute('aria-selected'))), ['false', 'true', 'false']);
    assert.deepEqual(await Promise.all([0, 1, 2].map((i) => tabs(w).nth(i).getAttribute('tabindex'))), ['-1', '0', '-1'], 'tabindex itinérant');
    assert.equal(await textarea(w).getAttribute('aria-label'), 'Contenu de la note Idées de week-end');
    await sleep(SETTLE);
    const notes = await notesOf(a);
    assert.equal((await dataOf(a)).activeId, notes[1].id);
    await session.reload();
    assert.equal(await tabs(w).nth(1).getAttribute('aria-selected'), 'true', 'l\'onglet actif est mémorisé');
    assert.equal(await textarea(w).inputValue(), 'Idées de week-end');
    assert.deepEqual(await tabTitles(w), ['Courses de la semaine', 'Idées de week-end', 'Liste de cadeaux']);
  });

  await step('navigation clavier des onglets : flèches, Début, Fin ; Tab sort de la zone de saisie sans rester bloqué', async () => {
    const w = widgets().first();
    await tabs(w).nth(1).focus();
    await page.keyboard.press('ArrowRight');
    await focusIsTab('Liste de cadeaux');
    assert.equal(await tabs(w).nth(2).getAttribute('aria-selected'), 'true');
    assert.equal(await textarea(w).inputValue(), 'Liste de cadeaux\nmaman: livre');
    await page.keyboard.press('ArrowRight');
    await focusIsTab('Courses de la semaine');
    await page.keyboard.press('ArrowLeft');
    await focusIsTab('Liste de cadeaux');
    await page.keyboard.press('Home');
    await focusIsTab('Courses de la semaine');
    await page.keyboard.press('End');
    await focusIsTab('Liste de cadeaux');
    assert.equal((await dataOf(a)).activeId, (await notesOf(a))[2].id);
    // Tab depuis l'onglet : « + », puis la zone de saisie.
    await page.keyboard.press('Tab');
    await focusLabel('Nouvelle note');
    await page.keyboard.press('Tab');
    await focusIsTextarea();
    // Tab dans la zone de saisie : le focus sort, aucun caractère de tabulation n'est inséré.
    const before = await textarea(w).inputValue();
    await page.keyboard.press('Tab');
    await focusLabel('Renommer');
    assert.equal(await textarea(w).inputValue(), before);
    await page.keyboard.press('Shift+Tab');
    await focusIsTextarea();
    await page.keyboard.press('Shift+Tab');
    await focusLabel('Nouvelle note');
  });

  await step('renommer : double-clic sur l\'onglet ; Entrée valide ; le titre ne suit plus la première ligne', async () => {
    const w = widgets().first();
    await tabs(w).nth(1).dblclick();
    const editor = w.locator('.notes__rename');
    await editor.waitFor();
    assert.equal(await editor.inputValue(), 'Idées de week-end');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'notes__rename');
    await page.keyboard.type('Week-end à Annecy');
    await page.keyboard.press('Enter');
    await editor.waitFor({ state: 'detached' });
    assert.deepEqual(await tabTitles(w), ['Courses de la semaine', 'Week-end à Annecy', 'Liste de cadeaux']);
    await focusIsTab('Week-end à Annecy');
    assert.equal((await notesOf(a))[1].title, 'Week-end à Annecy');
    assert.equal(await textarea(w).getAttribute('aria-label'), 'Contenu de la note Week-end à Annecy');
    await textarea(w).click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('Première ligne modifiée');
    assert.deepEqual(await tabTitles(w), ['Courses de la semaine', 'Week-end à Annecy', 'Liste de cadeaux'], 'le titre choisi ne bouge plus');
  });

  await step('renommer : bouton « Renommer », Échap annule, la perte de focus valide, titre vide = retour au titre déduit', async () => {
    const w = widgets().first();
    const editor = w.locator('.notes__rename');
    await w.getByRole('button', { name: 'Renommer' }).click();
    await editor.waitFor();
    await page.keyboard.type(' (brouillon)');
    await page.keyboard.press('Escape');
    await editor.waitFor({ state: 'detached' });
    assert.equal((await tabTitles(w))[1], 'Week-end à Annecy', 'Échap annule');
    await focusIsTab('Week-end à Annecy');
    // Perte de focus : valide.
    await w.getByRole('button', { name: 'Renommer' }).click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('Annecy');
    await textarea(w).click();
    await editor.waitFor({ state: 'detached' });
    assert.equal((await tabTitles(w))[1], 'Annecy');
    // Titre vide : retour au titre déduit, qui suit de nouveau la première ligne.
    await w.getByRole('button', { name: 'Renommer' }).click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Enter');
    await editor.waitFor({ state: 'detached' });
    assert.equal((await tabTitles(w))[1], 'Première ligne modifiée');
    assert.equal((await notesOf(a))[1].title, null);
    await textarea(w).click();
    await page.keyboard.press('Control+Home');
    await page.keyboard.type('Nouveau départ ');
    assert.equal((await tabTitles(w))[1], 'Nouveau départ Première ligne modifiée'.slice(0, 40));
    // Valider sans modifier ne fige pas le titre déduit.
    await w.getByRole('button', { name: 'Renommer' }).click();
    await page.keyboard.press('Enter');
    await editor.waitFor({ state: 'detached' });
    assert.equal((await notesOf(a))[1].title, null);
    // Titre déduit coupé à 40 caractères.
    await textarea(w).fill('0123456789'.repeat(8));
    assert.equal((await tabTitles(w))[1], '0123456789'.repeat(4));
    await textarea(w).fill('');
    assert.equal((await tabTitles(w))[1], 'Note sans titre');
    await textarea(w).fill('Idées de week-end');
  });

  await step('suppression : barre « Note supprimée — Annuler », la voisine devient active ; Annuler remet la note à sa place', async () => {
    const w = widgets().first();
    await sleep(SETTLE);
    const before = await dataOf(a);
    await w.getByRole('button', { name: 'Supprimer la note' }).click();
    assert.deepEqual(await tabTitles(w), ['Courses de la semaine', 'Liste de cadeaux']);
    assert.equal(await tabs(w).nth(1).getAttribute('aria-selected'), 'true', 'la note suivante devient active');
    const bar = w.locator('.notes__undo');
    assert.match(await bar.innerText(), /Note supprimée/);
    await waitFocus(() => document.activeElement?.textContent.trim() === 'Annuler', null, 'le focus passe sur « Annuler »');
    assert.match(await live(w), /Note supprimée : Idées de week-end/);
    assert.equal(await w.getByRole('dialog').count(), 0, 'aucune confirmation bloquante');
    await page.keyboard.press('Enter');
    await bar.waitFor({ state: 'detached' });
    assert.deepEqual(await tabTitles(w), ['Courses de la semaine', 'Idées de week-end', 'Liste de cadeaux']);
    assert.equal(await tabs(w).nth(1).getAttribute('aria-selected'), 'true');
    assert.equal(await textarea(w).inputValue(), 'Idées de week-end');
    const after = await dataOf(a);
    assert.deepEqual(after.notes, before.notes, 'la note revient exactement comme elle était');
    assert.equal(after.activeId, before.activeId);
    await focusIsTab('Idées de week-end');
    assert.match(await live(w), /Note restaurée/);
  });

  await step('suppression sans annulation : la barre disparaît après 6 s, le focus passe à l\'onglet actif ; dernière note → état vide', async () => {
    const w = widgets().first();
    await tabs(w).nth(2).click();
    await w.getByRole('button', { name: 'Supprimer la note' }).click();
    const bar = w.locator('.notes__undo');
    await bar.waitFor();
    await sleep(5000);
    assert.equal(await bar.count(), 1, 'encore là avant 6 s');
    await sleep(1500);
    assert.equal(await bar.count(), 0, 'disparue après 6 s');
    await waitFocus(() => document.activeElement?.getAttribute('role') === 'tab', null, 'le focus passe à l\'onglet actif');
    assert.deepEqual(await tabTitles(w), ['Courses de la semaine', 'Idées de week-end']);
    assert.equal((await dataOf(a)).activeId, (await notesOf(a))[1].id, 'la précédente devient active');
  });

  await step('barre d\'onglets : défile horizontalement, l\'onglet actif reste visible', async () => {
    const w = widgets().first();
    for (let i = 0; i < 10; i++) {
      await w.getByRole('button', { name: 'Nouvelle note' }).click();
      await focusIsTextarea();
      await page.keyboard.type(`Note numéro ${i + 1}`);
    }
    const metrics = () =>
      w.getByRole('tablist').evaluate((el) => {
        const list = el.getBoundingClientRect();
        const tab = el.querySelector('[aria-selected="true"]').getBoundingClientRect();
        return { overflow: el.scrollWidth > el.clientWidth, left: tab.left - list.left, right: list.right - tab.right, pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
      });
    let m = await metrics();
    assert.equal(m.overflow, true, 'la barre déborde et défile');
    assert.ok(m.left >= -1 && m.right >= -1, `l'onglet de la dernière note est visible (${m.left}, ${m.right})`);
    assert.ok(m.pageOverflow <= 0, 'la page ne défile pas horizontalement');
    await tabs(w).first().focus();
    await page.keyboard.press('Home');
    await sleep(300);
    m = await metrics();
    assert.ok(m.left >= -1 && m.right >= -1, 'le premier onglet est visible après Début');
    await page.keyboard.press('End');
    await sleep(300);
    m = await metrics();
    assert.ok(m.left >= -1 && m.right >= -1, 'le dernier onglet est visible après Fin');
    for (let i = 0; i < 10; i++) {
      await w.getByRole('button', { name: 'Supprimer la note' }).click();
      await w.locator('.notes__undo').waitFor();
    }
    assert.deepEqual(await tabTitles(w), ['Courses de la semaine', 'Idées de week-end']);
    await sleep(SETTLE);
  });

  await step('réglages : taille du texte, police à chasse fixe, correction orthographique', async () => {
    const w = widgets().first();
    const style = () => textarea(w).evaluate((el) => ({ size: parseFloat(getComputedStyle(el).fontSize), family: getComputedStyle(el).fontFamily, spell: el.spellcheck }));
    const base = await style();
    assert.equal(base.spell, true);
    assert.ok(!/DM Mono/.test(base.family));
    await w.hover();
    await w.getByRole('button', { name: 'Options de Notes' }).click();
    await page.getByRole('menuitem', { name: 'Réglages' }).click();
    const dialog = page.getByRole('dialog', { name: 'Réglages : Notes' });
    await dialog.waitFor();
    assert.equal(await dialog.getByLabel('Taille du texte').inputValue(), 'md');
    await dialog.getByLabel('Taille du texte').selectOption('lg');
    const large = await style();
    await dialog.getByLabel('Taille du texte').selectOption('sm');
    const small = await style();
    assert.ok(small.size < base.size && base.size < large.size, `tailles ${small.size} < ${base.size} < ${large.size}`);
    await dialogSwitch(dialog, 'Police à chasse fixe').click();
    assert.match((await style()).family, /DM Mono/);
    await dialogSwitch(dialog, 'Correction orthographique').click();
    assert.equal((await style()).spell, false);
    await dialog.getByRole('button', { name: 'Terminé' }).click();
    await dialog.waitFor({ state: 'detached' });
    assert.deepEqual((await instances()).find((i) => i.id === a).settings, { fontSize: 'sm', monospace: true, spellcheck: false });
    await session.reload();
    assert.equal((await style()).spell, false, 'les réglages survivent au rechargement');
    // Retour aux réglages par défaut.
    await page.evaluate((id) => window.__dash.dashboard.updateInstanceSettings(id, { fontSize: 'md', monospace: false, spellcheck: true }), a);
  });

  await step('compteur de caractères visible à partir de 90 % de la limite ; limite de 50 000', async () => {
    const w = widgets().first();
    assert.equal(await w.locator('[data-testid="notes-counter"]').count(), 0);
    const setContent = (length) =>
      page.evaluate(([id, n]) => {
        const data = window.__dash.data.getState().byId[id].data;
        const notes = data.notes.map((x, i) => (i === 0 ? { ...x, content: 'y'.repeat(n) } : x));
        window.__dash.data.setData(id, { ...data, activeId: notes[0].id, notes }, { version: 1 });
      }, [a, length]);
    await setContent(44_999);
    await page.waitForFunction(() => document.querySelector('section.widget[data-widget-type="notes"] .notes__textarea').value.length === 44999);
    assert.equal(await w.locator('[data-testid="notes-counter"]').count(), 0, 'pas de compteur sous 90 %');
    await textarea(w).click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('z');
    assert.match((await w.locator('[data-testid="notes-counter"]').innerText()).replace(/\s/g, ' '), /^45 000 \/ 50 000$/);
    await setContent(50_000);
    await page.waitForFunction(() => document.querySelector('section.widget[data-widget-type="notes"] .notes__textarea').value.length === 50000);
    await page.keyboard.type('plus rien ne passe');
    assert.equal(await textarea(w).evaluate((el) => el.value.length), 50_000, 'la limite est respectée');
    assert.equal((await notesOf(a))[0].content.length, 50_000);
    await setContent(10);
    await page.waitForFunction(() => document.querySelector('section.widget[data-widget-type="notes"] .notes__textarea').value.length === 10);
    assert.equal(await w.locator('[data-testid="notes-counter"]').count(), 0);
  });

  await step('texte brut : du HTML tapé reste du texte, aussi dans le titre de l\'onglet', async () => {
    const w = widgets().first();
    await textarea(w).fill('<script>alert(1)</script>\n<img src=x onerror=alert(2)>');
    assert.equal((await tabTitles(w))[0], '<script>alert(1)</script>');
    assert.equal(await textarea(w).inputValue(), '<script>alert(1)</script>\n<img src=x onerror=alert(2)>');
    assert.equal(await w.locator('script, img').count(), 0);
    await sleep(300);
    assert.deepEqual(dialogs, []);
    await textarea(w).fill('Courses de la semaine\nlait, pain');
  });

  await step('deux widgets Notes : contenus distincts, conservés après rechargement', async () => {
    await page.evaluate(() => window.__dash.actions.addWidget('notes'));
    await widgets().nth(1).waitFor();
    b = (await instances()).map((i) => i.id).find((id) => id !== a);
    await setLayout(a, { x: 0, y: 0, w: 5, h: 4 });
    await setLayout(b, { x: 6, y: 0, w: 5, h: 4 });
    await sleep(400);
    const wb = widgets().nth(1);
    await wb.getByRole('button', { name: 'Créer une note' }).click();
    await focusIsTextarea();
    await page.keyboard.type('Journal de bord\njour 1');
    await sleep(SETTLE);
    const notesA = await notesOf(a);
    assert.equal(notesA.length, 2);
    assert.ok(!notesA.some((n) => n.content.includes('Journal')));
    assert.deepEqual((await notesOf(b)).map((n) => n.content), ['Journal de bord\njour 1']);
    assert.deepEqual(Object.keys(await readStorage(page)).filter((k) => k.startsWith('dash:data:')).sort(), [`dash:data:${a}`, `dash:data:${b}`].sort());
    await session.reload();
    assert.deepEqual(await tabTitles(widgets().nth(0)), ['Courses de la semaine', 'Idées de week-end']);
    assert.deepEqual(await tabTitles(widgets().nth(1)), ['Journal de bord']);
    assert.equal(await textarea(widgets().nth(1)).inputValue(), 'Journal de bord\njour 1');
    assert.equal(await textarea(widgets().nth(0)).inputValue(), 'Courses de la semaine\nlait, pain');
  });

  await step('console propre, aucune boîte de dialogue', async () => {
    assert.deepEqual(log.errors, []);
    assert.deepEqual(dialogs, []);
  });
});
