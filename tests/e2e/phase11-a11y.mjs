// Accessibilité de la phase 11 : axe-core (clair ET sombre), clavier de bout en bout, zoom 200 %
// (et 400 %), mouvement réduit.
//
//   node tests/e2e/phase11-a11y.mjs
//
// axe-core n'est PAS une dépendance du projet : il est installé hors du dépôt
// (par défaut /opt/axe-tools/node_modules/, variable AXE_MODULES pour changer d'emplacement).

import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { assert, runJourney, sleep } from './helpers.mjs';

async function loadAxeSource() {
  const require = createRequire(process.env.AXE_MODULES || '/opt/axe-tools/node_modules/');
  try {
    return await readFile(require.resolve('axe-core/axe.min.js'), 'utf8');
  } catch {
    throw new Error('axe-core introuvable. Installe-le hors du projet : mkdir /opt/axe-tools && cd /opt/axe-tools && npm i axe-core (ou AXE_MODULES=…).');
  }
}

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const SETTLE = 800;

await runJourney('Parcours phase 11 (accessibilité)', async ({ step, browser, open }) => {
  const axeSource = await loadAxeSource();

  /** Lance axe sur la page et renvoie les violations sous forme lisible. */
  async function axeViolations(page) {
    await page.evaluate(axeSource);
    const result = await page.evaluate(
      (tags) => window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] }),
      AXE_TAGS,
    );
    return result.violations.map((v) => `${v.id} (${v.impact}) : ${v.help} → ${v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join(' | ')}`);
  }
  const newContext = (options = {}) => browser.newContext({ viewport: { width: 1280, height: 900 }, ...options });
  const setTheme = async (page, name) => {
    await page.getByRole('group', { name: 'Thème' }).getByRole('button', { name, exact: true }).click();
  };
  const openBackup = async (page, item) => {
    await page.getByRole('button', { name: 'Sauvegarde', exact: true }).click();
    await page.getByRole('menuitem', { name: item }).click();
  };
  const openWidgetSettings = async (page, name) => {
    const w = page.locator('section.widget').filter({ has: page.getByRole('heading', { name, exact: true }) }).first();
    await w.hover();
    await w.getByRole('button', { name: `Options de ${name}` }).click();
    await page.getByRole('menuitem', { name: 'Réglages' }).click();
  };

  // axe-core -----------------------------------------------------------------------------------
  for (const theme of ['Clair', 'Sombre']) {
    await step(`axe-core, thème ${theme.toLowerCase()} : aucune violation (dashboard vide, cinq widgets, édition, catalogue, réglages, import, aide, préférences, export)`, async () => {
      const { page } = await open({ label: `axe ${theme}`, query: 'dev=1', context: await newContext({ colorScheme: theme === 'Sombre' ? 'dark' : 'light' }) });
      await setTheme(page, theme);
      const found = {};
      const check = async (label) => {
        const violations = await axeViolations(page);
        if (violations.length > 0) found[label] = violations;
      };

      await check('dashboard vide');

      await page.getByRole('button', { name: 'Commencer avec une disposition type' }).click();
      await page.waitForFunction(() => document.querySelectorAll('section.widget').length === 5);
      // Des données dans chaque widget, pour que l'on contrôle aussi les listes, onglets, tuiles.
      await page.evaluate(() => {
        const state = window.__dash.dashboard.getState();
        const of = (type) => state.pages[0].instances.find((i) => i.type === type).id;
        window.__dash.data.setData(of('todo'), { tasks: [{ id: 'a', text: 'Écrire le rapport', done: false }, { id: 'b', text: 'Appeler Marie', done: true }] });
        window.__dash.data.setData(of('shortcuts'), { links: [{ id: 'l1', url: 'https://example.org', title: 'Exemple' }, { id: 'l2', url: 'https://github.com', title: 'GitHub' }] });
      });
      await sleep(400);
      await page.evaluate(() => window.__dash.ui.getState().isEditing && window.__dash.ui.toggleEditing());
      await check('cinq widgets');

      await page.getByRole('button', { name: 'Modifier la disposition' }).click();
      await sleep(200);
      await check('mode édition');
      await page.getByRole('button', { name: 'Terminer' }).click();

      await page.getByRole('button', { name: 'Ajouter un widget', exact: true }).first().click();
      await page.getByRole('dialog').waitFor();
      await sleep(250);
      await check('catalogue');
      await page.keyboard.press('Escape');

      await openWidgetSettings(page, 'Heure');
      await page.getByRole('dialog', { name: /Réglages/ }).waitFor();
      await sleep(250);
      await check('réglages');
      await page.keyboard.press('Escape');

      await openBackup(page, 'Importer');
      await page.getByRole('dialog', { name: 'Importer une sauvegarde' }).waitFor();
      await page.getByTestId('import-text').fill('{pas du json');
      await page.getByTestId('import-check').click();
      await page.getByTestId('import-error').waitFor();
      await check('dialogue d\'import (avec erreur)');
      await page.keyboard.press('Escape');

      await openBackup(page, 'Exporter');
      await page.getByRole('dialog', { name: 'Exporter la sauvegarde' }).waitFor();
      await check('dialogue d\'export');
      await page.keyboard.press('Escape');

      await page.getByRole('button', { name: 'Raccourcis', exact: true }).click();
      await page.getByRole('dialog', { name: 'Raccourcis clavier' }).waitFor();
      await check('aide des raccourcis');
      await page.keyboard.press('Escape');

      await page.getByRole('button', { name: 'Préférences', exact: true }).click();
      await page.getByRole('dialog', { name: 'Préférences' }).waitFor();
      await check('préférences');
      await page.keyboard.press('Escape');

      // Autres états des widgets : un minuteur, des notes, la fenêtre d'ajout de raccourci.
      await page.getByRole('button', { name: 'Créer une note' }).click();
      await page.getByPlaceholder('Écris ici…').fill('Une note pour le contrôle');
      await check('widget Notes avec une note');
      await page.locator('section.widget[data-widget-type="shortcuts"]').getByRole('button', { name: 'Ajouter un raccourci' }).first().click();
      await page.getByRole('dialog', { name: 'Ajouter un raccourci' }).getByLabel('Adresse').fill('bonjour');
      await page.keyboard.press('Enter');
      await sleep(200);
      await check('formulaire de raccourci (avec erreur)');
      await page.keyboard.press('Escape');

      assert.deepEqual(found, {}, `violations axe-core (${theme.toLowerCase()}) :\n${JSON.stringify(found, null, 2)}`);
    });
  }

  // Clavier --------------------------------------------------------------------------------------
  const describeFocus = () => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const style = getComputedStyle(el);
    const outline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0 && style.outlineColor !== 'rgba(0, 0, 0, 0)';
    const shadow = style.boxShadow !== 'none';
    // Un contour de focus peut être porté par un élément voisin (interrupteur : l'entrée est masquée, la piste dessine l'anneau).
    const sibling = el.matches('input.toggle__input') && getComputedStyle(el.parentElement.querySelector('.toggle__track')).boxShadow !== 'none';
    const name = el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 40) || el.getAttribute('placeholder') || el.tagName;
    return { key: `${el.tagName.toLowerCase()}|${name}|${el.id || ''}`, visibleFocus: outline || shadow || sibling, tag: el.tagName, name };
  };

  await step('clavier : chaque contrôle visible est atteint avec Tab, le focus est toujours visible, aucun piège, le cycle boucle', async () => {
    const { page } = await open({ label: 'clavier', query: 'dev=1' });
    await page.getByRole('button', { name: 'Commencer avec une disposition type' }).click();
    await page.waitForFunction(() => document.querySelectorAll('section.widget').length === 5);
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
    const expected = await page.evaluate(() => {
      const visible = (el) => !el.closest('[inert], [hidden]') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.disabled;
      return [...document.querySelectorAll('a[href], button, input, textarea, select, [tabindex]')]
        .filter((el) => el.tabIndex >= 0 && visible(el))
        .map((el) => el);
    }).then(() => page.evaluate(() => {
      const visible = (el) => !el.closest('[inert], [hidden]') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.disabled;
      return [...document.querySelectorAll('a[href], button, input, textarea, select, [tabindex]')].filter((el) => el.tabIndex >= 0 && visible(el)).length;
    }));
    const seen = [];
    const invisible = [];
    for (let i = 0; i < expected + 12; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(describeFocus);
      if (info === null) { seen.push(null); continue; }
      seen.push(info.key);
      if (!info.visibleFocus) invisible.push(`${info.tag} « ${info.name} »`);
    }
    const reached = new Set(seen.filter(Boolean));
    assert.deepEqual(invisible, [], 'tout élément qui reçoit le focus a un indicateur visible');
    assert.ok(reached.size >= expected * 0.9, `éléments atteints : ${reached.size} / ${expected} focalisables`);
    // Le cycle boucle : le premier élément atteint revient avant la fin.
    const firstReached = seen.find(Boolean);
    assert.ok(seen.indexOf(firstReached, 1) > 0, 'le parcours revient au premier contrôle (aucun piège)');
  });

  await step('clavier : chaque fenêtre s\'ouvre au clavier, garde le focus (Tab et Maj+Tab bouclent), se ferme avec Échap et rend le focus à son origine', async () => {
    const { page } = await open({ label: 'clavier fenêtres', query: 'dev=1' });
    await page.getByRole('button', { name: 'Commencer avec une disposition type' }).click();
    await page.waitForFunction(() => document.querySelectorAll('section.widget').length === 5);
    const insideModal = () => page.evaluate(() => !!document.activeElement?.closest('.modal__panel'));
    const label = () => page.evaluate(() => {
      const el = document.activeElement;
      return el ? (el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 30) || el.tagName) : null;
    });

    /** @param {string} name @param {() => Promise<void>} openIt @param {string} originName bouton qui doit récupérer le focus */
    async function exercise(name, openIt, originName) {
      await openIt();
      await page.getByRole('dialog').first().waitFor();
      await page.waitForFunction(() => !!document.activeElement?.closest('.modal__panel'), null, { timeout: 2000 }).catch(() => {});
      assert.ok(await insideModal(), `${name} : le focus est dans la fenêtre`);
      for (let i = 0; i < 14; i++) {
        await page.keyboard.press('Tab');
        assert.ok(await insideModal(), `${name} : Tab ne sort pas de la fenêtre (pas ${i + 1})`);
      }
      for (let i = 0; i < 14; i++) {
        await page.keyboard.press('Shift+Tab');
        assert.ok(await insideModal(), `${name} : Maj+Tab ne sort pas de la fenêtre (pas ${i + 1})`);
      }
      await page.keyboard.press('Escape');
      await page.getByRole('dialog').first().waitFor({ state: 'detached' });
      assert.equal(await label(), originName, `${name} : le focus revient à « ${originName} »`);
    }
    const press = async (button) => {
      await button.focus();
      await page.keyboard.press('Enter');
    };

    await exercise('catalogue', () => press(page.getByRole('button', { name: 'Ajouter un widget', exact: true }).first()), 'Ajouter un widget');
    await exercise('aide des raccourcis', () => press(page.getByRole('button', { name: 'Raccourcis', exact: true })), 'Raccourcis');
    await exercise('préférences', () => press(page.getByRole('button', { name: 'Préférences', exact: true })), 'Préférences');
    await exercise('exporter', async () => {
      await press(page.getByRole('button', { name: 'Sauvegarde', exact: true }));
      await page.getByRole('menuitem', { name: 'Exporter' }).focus();
      await page.keyboard.press('Enter');
    }, 'Sauvegarde');
    await exercise('importer', async () => {
      await press(page.getByRole('button', { name: 'Sauvegarde', exact: true }));
      await page.keyboard.press('ArrowDown');
      await page.getByRole('menuitem', { name: 'Importer' }).focus();
      await page.keyboard.press('Enter');
    }, 'Sauvegarde');
    await exercise('réglages d\'un widget', async () => {
      const w = page.locator('section.widget[data-widget-type="clock"]');
      await w.getByRole('button', { name: 'Options de Heure' }).focus();
      await page.keyboard.press('Enter');
      await page.getByRole('menuitem', { name: 'Réglages' }).focus();
      await page.keyboard.press('Enter');
    }, 'Options de Heure');
    await exercise('formulaire de raccourci', async () => {
      const w = page.locator('section.widget[data-widget-type="shortcuts"]');
      await press(w.getByRole('button', { name: 'Ajouter un raccourci' }).first());
    }, 'Ajouter un raccourci');
  });

  await step('clavier : tout se fait sans souris — ajouter, cocher, déplacer, redimensionner, renommer, supprimer et annuler', async () => {
    const { page } = await open({ label: 'clavier complet', query: 'dev=1' });
    await page.getByRole('button', { name: 'Commencer avec une disposition type' }).click();
    await page.waitForFunction(() => document.querySelectorAll('section.widget').length === 5);
    const todo = page.locator('section.widget[data-widget-type="todo"]');
    await todo.getByLabel('Nouvelle tâche').focus();
    await page.keyboard.type('Tâche au clavier');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Shift+Tab'); // vers « Ajouter » ou la dernière case
    assert.deepEqual(await todo.locator('.todo__text').allInnerTexts(), ['Tâche au clavier']);
    // Édition de la disposition : E (hors champ), flèches sur la poignée, Échap.
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press('e');
    const grip = todo.locator('.widget__grip');
    await grip.focus();
    const before = await page.evaluate(() => window.__dash.dashboard.getState().pages[0].instances.find((i) => i.type === 'todo').layout);
    await page.keyboard.press('Shift+ArrowDown');
    await sleep(SETTLE);
    const after = await page.evaluate(() => window.__dash.dashboard.getState().pages[0].instances.find((i) => i.type === 'todo').layout);
    assert.equal(after.h, before.h + 1);
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('button', { name: 'Terminer' }).count(), 0, 'Échap quitte l\'édition');
    // Supprimer un widget puis annuler, au clavier.
    await todo.getByRole('button', { name: 'Options de À faire' }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('menuitem', { name: 'Supprimer' }).focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('section.widget').length === 4);
    const undo = page.getByRole('button', { name: 'Annuler' }).first();
    await undo.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('section.widget').length === 5);
    assert.deepEqual(await todo.locator('.todo__text').allInnerTexts(), ['Tâche au clavier'], 'la liste est revenue intacte');
  });

  // Zoom et mouvement -------------------------------------------------------------------------------
  for (const [label, width, height] of [['200 %', 640, 450], ['400 %', 320, 256]]) {
    await step(`zoom ${label} (fenêtre équivalente ${width}×${height}) : pas de défilement horizontal, toutes les actions atteignables`, async () => {
      const { page } = await open({ label: `zoom ${label}`, query: 'dev=1', context: await newContext({ viewport: { width, height } }) });
      await page.getByRole('button', { name: 'Commencer avec une disposition type' }).click();
      await page.waitForFunction(() => document.querySelectorAll('section.widget').length === 5);
      const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.equal(await overflow(), 0, 'dashboard');
      for (const name of ['Ajouter un widget', 'Modifier la disposition', 'Clair', 'Sombre', 'Système', 'Sauvegarde', 'Raccourcis', 'Préférences']) {
        const button = page.getByRole('button', { name, exact: true }).first();
        await button.scrollIntoViewIfNeeded();
        const box = await button.boundingBox();
        assert.ok(box && box.x >= 0 && box.x + box.width <= width + 0.5, `${name} dépasse horizontalement : ${JSON.stringify(box)}`);
      }
      for (const [name, open] of [
        ['Raccourcis clavier', () => page.getByRole('button', { name: 'Raccourcis', exact: true }).click()],
        ['Préférences', () => page.getByRole('button', { name: 'Préférences', exact: true }).click()],
      ]) {
        await open();
        const dialog = page.getByRole('dialog', { name });
        await dialog.waitFor();
        const box = await dialog.boundingBox();
        assert.ok(box.x >= -0.5 && box.x + box.width <= width + 0.5, `${name} déborde : ${JSON.stringify(box)}`);
        assert.ok(await dialog.evaluate((el) => el.querySelector('.modal__body')?.scrollHeight >= 0), 'contenu présent');
        assert.equal(await overflow(), 0, `${name} : défilement horizontal`);
        // Le bouton de fermeture reste atteignable même si le contenu défile.
        const close = dialog.getByRole('button', { name: /Fermer|Terminé/ }).first();
        await close.scrollIntoViewIfNeeded();
        const closeBox = await close.boundingBox();
        assert.ok(closeBox.y >= -0.5 && closeBox.y + closeBox.height <= height + 0.5, `${name} : bouton de fermeture hors de l'écran`);
        await page.keyboard.press('Escape');
      }
    });
  }

  await step('mouvement réduit : aucune animation notable (grille, panneau, notification)', async () => {
    const { page } = await open({ label: 'mouvement réduit', query: 'dev=1', context: await newContext({ reducedMotion: 'reduce' }) });
    assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
    await page.getByRole('button', { name: 'Commencer avec une disposition type' }).click();
    await page.waitForFunction(() => document.querySelectorAll('section.widget').length === 5);
    assert.equal(await page.locator('.grid-stack-animate').count(), 0, 'la grille n\'est pas animée');
    await page.getByRole('button', { name: 'Ajouter un widget', exact: true }).first().click();
    await page.getByRole('dialog').waitFor();
    await page.keyboard.press('Escape');
    // Une notification (suppression d'un widget).
    const w = page.locator('section.widget[data-widget-type="notes"]');
    await w.hover();
    await w.getByRole('button', { name: 'Options de Notes' }).click();
    await page.getByRole('menuitem', { name: 'Supprimer' }).click();
    await page.locator('.toast').first().waitFor();
    const animations = await page.evaluate(() =>
      document.getAnimations().map((a) => ({ name: a.animationName || a.transitionProperty || '?', duration: a.effect?.getTiming().duration, iterations: a.effect?.getTiming().iterations }))
        .filter((a) => Number(a.duration) > 20),
    );
    assert.deepEqual(animations, [], 'aucune animation de plus de 20 ms');
    const durations = await page.evaluate(() =>
      [...document.querySelectorAll('.modal__panel, .toast, .widget, .grid-stack-item, .modal__backdrop')].flatMap((el) => {
        const style = getComputedStyle(el);
        const seconds = (list) => list.split(',').map((v) => parseFloat(v));
        return [...seconds(style.transitionDuration), ...seconds(style.animationDuration)];
      }),
    );
    assert.ok(durations.length > 0 && durations.every((d) => d < 0.001), `durées de transition et d'animation : ${[...new Set(durations)]}`);
  });

  await step('contrastes : les couleurs d\'accent et de texte secondaire restent lisibles sur les surfaces (thèmes clair et sombre)', async () => {
    // axe contrôle déjà color-contrast sur chaque écran ci-dessus ; ici on s'assure qu'il l'a vraiment fait.
    const { page } = await open({ label: 'contraste', query: 'dev=1' });
    await page.evaluate(axeSource);
    const rules = await page.evaluate(() => window.axe.getRules(['wcag2aa']).map((r) => r.ruleId));
    assert.ok(rules.includes('color-contrast'), 'la règle color-contrast est active');
  });
});
