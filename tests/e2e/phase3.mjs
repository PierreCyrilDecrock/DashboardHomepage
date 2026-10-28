// Parcours navigateur de la phase 3 : grille 12 colonnes, mode édition, souris et clavier,
// rechargement, une colonne sur écran étroit, écritures dans le stockage.
//
//   node tests/e2e/phase3.mjs

import { assert, readStorage, runJourney, sleep } from './helpers.mjs';

const SETTLE = 700; // les écritures sont regroupées 300 ms

/** Note chaque écriture dans localStorage (clé et instant). */
const spyInit = () => {
  window.__writes = [];
  const original = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    if (key !== 'dash:probe') window.__writes.push(key);
    return original.call(this, key, value);
  };
};

await runJourney('Parcours phase 3', async ({ site, step, open }) => {
  const first = await open({ label: 'grille', query: 'dev=1', init: spyInit });
  const { page, log } = first;

  const addDemo = () => page.evaluate(() => window.__dash.actions.addWidget('demo'));
  const frames = page.locator('section.widget');
  const frame = (n) => frames.nth(n);
  const layouts = () => page.evaluate(() => window.__dash.dashboard.getState().pages[0].instances.map((i) => ({ id: i.id, ...i.layout })));
  const writes = () => page.evaluate(() => window.__writes.slice());
  const boxes = async () => {
    const out = [];
    for (let i = 0; i < (await frames.count()); i++) out.push(await frame(i).boundingBox());
    return out;
  };
  const overlap = (a, b) => a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;
  const assertNoOverlap = async (label) => {
    const list = await boxes();
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) assert.ok(!overlap(list[i], list[j]), `${label} : les widgets ${i} et ${j} se chevauchent ${JSON.stringify([list[i], list[j]])}`);
    }
  };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const gridItem = (n) => frame(n).locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " grid-stack-item ")][1]');

  await step('dashboard vide : message « Ton dashboard est vide » avec une phrase d\'aide', async () => {
    assert.equal(await frames.count(), 0);
    assert.equal((await page.locator('.dashboard__empty-title').innerText()).trim(), 'Ton dashboard est vide');
    assert.ok((await page.locator('.dashboard__empty-text').innerText()).length > 20);
    assert.equal((await page.getByTestId('page-name').innerText()).trim(), 'Principal');
  });

  await step('six démonstrations se placent sur 12 colonnes sans se chevaucher', async () => {
    for (let i = 0; i < 6; i++) await addDemo();
    assert.equal(await frames.count(), 6);
    assert.equal(await page.locator('.dashboard__empty').count(), 0);
    const list = await layouts();
    assert.ok(list.every((l) => l.x >= 0 && l.x + l.w <= 12), JSON.stringify(list));
    // Pas de chevauchement dans la disposition ni à l'écran.
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        assert.ok(!(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h), `chevauchement ${i}/${j}`);
      }
    }
    await assertNoOverlap('à l\'ajout');
    assert.equal(await page.evaluate(() => window.__dash.dashboard.getState().pages[0].instances.every((i) => i.layout.y < 1000)), true);
    // 12 colonnes, lignes de 80 px, 20 px entre deux widgets.
    const [a, b] = await boxes();
    assert.equal(await page.locator('.grid-stack').evaluate((el) => el.gridstack.getColumn()), 12);
    assert.ok(Math.abs(b.x - a.x - (a.width + 20)) <= 1, `écart horizontal : ${b.x - a.x - a.width}`);
    assert.ok(Math.abs(a.height - (4 * 80 - 20)) <= 1, `hauteur d'un widget de 4 lignes : ${a.height}`);
  });

  await step('hors mode édition : un glisser à la souris ne déplace rien, les boutons fonctionnent, pas de poignée', async () => {
    const before = await layouts();
    const box = await frame(0).locator('.widget__bar').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 500, box.y + 400, { steps: 12 });
    await page.mouse.up();
    await sleep(SETTLE);
    assert.ok(same(await layouts(), before), 'la disposition a changé hors mode édition');
    assert.equal(await page.locator('.widget__grip:visible').count(), 0);
    // Redimensionner : poignée masquée ou inactive.
    const handleVisible = await gridItem(0).locator('.ui-resizable-se').evaluate((el) => getComputedStyle(el).display !== 'none').catch(() => false);
    assert.equal(handleVisible, false);
    await frame(0).getByRole('button', { name: '+1', exact: true }).click();
    assert.equal((await frame(0).getByTestId('demo-count').innerText()).trim(), '1');
    assert.equal(await page.getByRole('button', { name: 'Modifier la disposition' }).count(), 1);
  });

  await step('« Modifier la disposition » → « Terminer », aide, poignées visibles, contenu inerte', async () => {
    await page.getByRole('button', { name: 'Modifier la disposition' }).click();
    assert.equal(await page.getByRole('button', { name: 'Terminer' }).count(), 1);
    assert.match(await page.locator('.toolbar__help').innerText(), /Glisse les widgets pour les déplacer, tire les coins pour les redimensionner\./);
    assert.equal(await page.locator('.widget__grip:visible').count(), 6);
    assert.equal(await frame(0).evaluate((el) => el.classList.contains('widget--editing')), true);
    assert.equal(await frame(0).evaluate((el) => getComputedStyle(el).borderTopStyle), 'dashed');
    assert.equal(await frame(0).locator('.widget__body').evaluate((el) => el.inert), true);
    const box = await frame(0).locator('.widget__grip:visible').boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44, JSON.stringify(box));
    const label = await frame(0).locator('.widget__grip:visible').getAttribute('aria-label');
    assert.match(label, /Déplacer Démo/);
  });

  await step('mode édition : seule la barre de titre sert de poignée (glisser depuis le contenu ne déplace rien)', async () => {
    await sleep(SETTLE);
    const before = await layouts();
    const body = await frame(2).locator('.demo__count').boundingBox();
    await page.mouse.move(body.x + 10, body.y + 10);
    await page.mouse.down();
    await page.mouse.move(body.x + 500, body.y + 300, { steps: 12 });
    await page.mouse.up();
    await sleep(SETTLE);
    assert.ok(same(await layouts(), before), 'le glisser depuis le contenu a déplacé le widget');
  });

  await step('mode édition : glisser par la poignée déplace le widget, sans aucune écriture pendant le geste, un seul groupe à la fin', async () => {
    await sleep(SETTLE); // laisse partir l'écriture du « +1 » précédent
    const before = await layouts();
    const startWrites = (await writes()).length;
    const target = (await boxes())[5];
    const grip = await frame(0).locator('.widget__grip:visible').boundingBox();
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width + 300, target.y + 60, { steps: 20 });
    await sleep(SETTLE);
    assert.equal((await writes()).length, startWrites, 'écriture pendant le glisser');
    assert.ok(same(await layouts(), before), 'le store a changé pendant le glisser');
    await page.mouse.up();
    await sleep(SETTLE);
    const after = await layouts();
    assert.ok(!same(after, before), 'rien n\'a bougé');
    assert.deepEqual((await writes()).slice(startWrites), ['dash:state']);
    await assertNoOverlap('après le glisser');
    // Le store reflète exactement la grille.
    const fromGrid = await page.evaluate(() => [...document.querySelectorAll('.grid-stack-item')].map((el) => ({ id: el.gridstackNode.id, x: el.gridstackNode.x, y: el.gridstackNode.y, w: el.gridstackNode.w, h: el.gridstackNode.h })));
    for (const l of after) assert.deepEqual(fromGrid.find((g) => g.id === l.id), l);
  });

  await step('redimensionner par un coin : plus grand, puis jamais sous la taille minimale', async () => {
    await sleep(SETTLE);
    const rid = await frame(1).getAttribute('data-instance-id');
    const layoutOf = async () => (await layouts()).find((l) => l.id === rid);
    const start = await layoutOf();
    const handle = await gridItem(1).locator('.ui-resizable-se').boundingBox();
    assert.ok(handle.width >= 24 && handle.height >= 24, JSON.stringify(handle));
    const startWrites = (await writes()).length;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + 130, handle.y + 90, { steps: 12 });
    assert.equal((await writes()).length, startWrites, 'écriture pendant le redimensionnement');
    await page.mouse.up();
    await sleep(SETTLE);
    const grown = await layoutOf();
    assert.ok(grown.w > start.w || grown.h > start.h, `${JSON.stringify(start)} → ${JSON.stringify(grown)}`);
    assert.deepEqual((await writes()).slice(startWrites), ['dash:state']);
    await assertNoOverlap('après agrandissement');

    // Réduire très au-delà du minimum (2×2 pour la démo).
    const h2 = await gridItem(1).locator('.ui-resizable-se').boundingBox();
    await page.mouse.move(h2.x + h2.width / 2, h2.y + h2.height / 2);
    await page.mouse.down();
    await page.mouse.move(h2.x - 1000, h2.y - 1000, { steps: 15 });
    await page.mouse.up();
    await sleep(SETTLE);
    const small = await layoutOf();
    assert.deepEqual([small.w, small.h], [2, 2], JSON.stringify(small));
    await assertNoOverlap('après réduction');
  });

  await step('clavier : Tab atteint la poignée, flèches déplacent d\'une case, position annoncée', async () => {
    await page.getByRole('button', { name: 'Terminer' }).focus();
    let reached = false;
    for (let i = 0; i < 12 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(() => document.activeElement?.classList.contains('widget__grip'));
    }
    assert.ok(reached, 'Tab n\'atteint pas la poignée');
    const owner = await page.evaluate(() => document.activeElement.closest('section.widget').getAttribute('data-instance-id'));
    const get = async () => (await layouts()).find((l) => l.id === owner);
    const start = await get();
    await page.keyboard.press('ArrowRight');
    const moved = await get();
    // Au bord droit, la flèche ne déplace plus : on teste dans le sens libre.
    if (moved.x === start.x) await page.keyboard.press('ArrowLeft');
    const now = await get();
    assert.notEqual(now.x, start.x, `${JSON.stringify(start)} → ${JSON.stringify(now)}`);
    assert.equal(Math.abs(now.x - start.x), 1);
    assert.equal(await page.evaluate(() => document.activeElement.classList.contains('widget__grip')), true, 'le focus a quitté la poignée');
    const said = await page.evaluate(() => document.activeElement.closest('section.widget').querySelector('[data-testid="placement"]').textContent);
    assert.match(said, new RegExp(`^Démo : colonne ${now.x + 1}, ligne ${now.y + 1}, ${now.w} colonnes sur ${now.h} lignes`));
    await sleep(SETTLE);
    assert.equal((await get()).x, now.x);
    await assertNoOverlap('après déplacement au clavier');
  });

  await step('clavier : Maj + flèches redimensionnent d\'une case, jamais sous le minimum ni hors de la grille', async () => {
    const owner = await page.evaluate(() => document.activeElement.closest('section.widget').getAttribute('data-instance-id'));
    const get = async () => (await layouts()).find((l) => l.id === owner);
    const start = await get();
    await page.keyboard.press('Shift+ArrowDown');
    const taller = await get();
    assert.equal(taller.h, start.h + 1);
    await page.keyboard.press('Shift+ArrowUp');
    await page.keyboard.press('Shift+ArrowUp');
    await page.keyboard.press('Shift+ArrowUp');
    await page.keyboard.press('Shift+ArrowUp');
    assert.equal((await get()).h, 2, 'hauteur sous le minimum');
    for (let i = 0; i < 14; i++) await page.keyboard.press('Shift+ArrowLeft');
    assert.equal((await get()).w, 2, 'largeur sous le minimum');
    for (let i = 0; i < 14; i++) await page.keyboard.press('Shift+ArrowRight');
    const wide = await get();
    assert.equal(wide.x + wide.w <= 12, true, JSON.stringify(wide));
    const said = await page.evaluate(() => document.activeElement.closest('section.widget').querySelector('[data-testid="placement"]').textContent);
    assert.match(said, /^Démo : colonne \d+, ligne \d+, \d+ colonnes sur \d+ lignes/);
    await sleep(SETTLE);
    await assertNoOverlap('après redimensionnement au clavier');
  });

  let saved;
  await step('rechargement : la disposition est identique', async () => {
    await sleep(SETTLE);
    saved = await layouts();
    const stored = JSON.parse((await readStorage(page))['dash:state']).pages[0].instances.map((i) => ({ id: i.id, ...i.layout }));
    assert.ok(same(stored, saved), 'le stockage diffère du store');
    await first.reload();
    assert.equal(await frames.count(), 6);
    assert.ok(same(await layouts(), saved), 'disposition différente après rechargement');
    await assertNoOverlap('après rechargement');
    // Le chargement lui-même n'écrit pas la disposition.
    assert.deepEqual((await writes()).filter((k) => k === 'dash:state'), []);
  });

  await step('Échap quitte le mode édition (le mode n\'est pas conservé au rechargement)', async () => {
    assert.equal(await page.locator('.widget__grip:visible').count(), 0, 'le mode édition ne doit pas survivre au rechargement');
    await page.getByRole('button', { name: 'Modifier la disposition' }).click();
    assert.equal(await page.locator('.widget__grip:visible').count(), 6);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.widget__grip:visible').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Modifier la disposition' }).count(), 1);
    assert.equal(await frame(0).locator('.widget__body').evaluate((el) => el.inert), false);
    // Les boutons refonctionnent.
    const before = Number((await frame(2).getByTestId('demo-count').innerText()).trim());
    await frame(2).getByRole('button', { name: '+1', exact: true }).click();
    assert.equal(Number((await frame(2).getByTestId('demo-count').innerText()).trim()), before + 1);
  });

  await step('à 390 px : une seule colonne, pas de débordement, pas de glisser, aucune écriture de disposition', async () => {
    await sleep(SETTLE);
    const startWrites = (await writes()).length;
    await page.setViewportSize({ width: 390, height: 800 });
    await sleep(800);
    assert.equal(await page.locator('.grid-stack').evaluate((el) => el.gridstack.getColumn()), 1);
    const dims = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    assert.ok(dims.sw <= dims.cw, `débordement horizontal ${dims.sw} > ${dims.cw}`);
    const list = await boxes();
    const left = Math.min(...list.map((b) => b.x));
    assert.ok(list.every((b) => Math.abs(b.x - left) <= 1), 'les widgets ne sont pas alignés sur une colonne');
    assert.ok(list.every((b) => b.x >= 0 && b.x + b.width <= 390), JSON.stringify(list));
    await assertNoOverlap('une colonne');
    // Mode édition en une colonne : ni glisser, ni redimensionner.
    await page.getByRole('button', { name: 'Modifier la disposition' }).click();
    const grip = await frame(1).locator('.widget__grip:visible').boundingBox();
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + 10, grip.y - 150, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.press('Escape');
    await sleep(SETTLE);
    assert.ok(same(await layouts(), saved), 'la disposition à 12 colonnes a été modifiée par l\'affichage une colonne');
    assert.deepEqual((await writes()).slice(startWrites), [], 'écriture de disposition en mode une colonne');
  });

  await step('retour à la largeur normale : la disposition à 12 colonnes est restituée', async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await sleep(900);
    assert.equal(await page.locator('.grid-stack').evaluate((el) => el.gridstack.getColumn()), 12);
    const nodes = await page.evaluate(() => [...document.querySelectorAll('.grid-stack-item')].map((el) => ({ id: el.gridstackNode.id, x: el.gridstackNode.x, y: el.gridstackNode.y, w: el.gridstackNode.w, h: el.gridstackNode.h })));
    for (const l of saved) assert.deepEqual(nodes.find((n) => n.id === l.id), l);
    await assertNoOverlap('retour à 12 colonnes');
  });

  await step('chargement direct à 390 px avec une disposition enregistrée : une colonne, puis 12 colonnes intactes', async () => {
    const narrow = await first.context.newPage();
    const problems = [];
    narrow.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
    narrow.on('pageerror', (e) => problems.push(e.message));
    await narrow.setViewportSize({ width: 390, height: 800 });
    await narrow.goto(site.url + '?dev=1');
    await narrow.waitForSelector('section.widget');
    await sleep(600);
    assert.equal(await narrow.locator('.grid-stack').evaluate((el) => el.gridstack.getColumn()), 1);
    const dims = await narrow.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    assert.ok(dims.sw <= dims.cw, `débordement ${dims.sw} > ${dims.cw}`);
    assert.deepEqual(await narrow.evaluate(() => window.__writes.filter((k) => k === 'dash:state')), [], 'écriture de disposition au chargement en une colonne');
    await narrow.setViewportSize({ width: 1280, height: 900 });
    await sleep(900);
    const back = await narrow.evaluate(() => window.__dash.dashboard.getState().pages[0].instances.map((i) => ({ id: i.id, ...i.layout })));
    assert.ok(same(back, saved), 'la disposition enregistrée a changé');
    const nodes = await narrow.evaluate(() => [...document.querySelectorAll('.grid-stack-item')].map((el) => ({ id: el.gridstackNode.id, x: el.gridstackNode.x, y: el.gridstackNode.y, w: el.gridstackNode.w, h: el.gridstackNode.h })));
    for (const l of saved) assert.deepEqual(nodes.find((n) => n.id === l.id), l);
    assert.deepEqual(problems, []);
    await narrow.close();
  });

  await step('ajout et suppression d\'instances après coup : la grille suit le store', async () => {
    await addDemo();
    assert.equal(await frames.count(), 7);
    const id = (await layouts())[0].id;
    await page.evaluate((i) => {
      window.__dash.dashboard.removeInstance(i);
      window.__dash.data.removeData(i);
    }, id);
    assert.equal(await frames.count(), 6);
    assert.equal(await page.locator(`[data-instance-id="${id}"]`).count(), 0);
    await sleep(600); // fin de l'animation de la grille
    await assertNoOverlap('après suppression');
  });

  await step('aucune erreur de console (les avertissements éventuels sont listés)', async () => {
    assert.deepEqual(log.errors, []);
    if (log.warnings.length) console.log(`      avertissements : ${JSON.stringify(log.warnings)}`);
  });
}, { demoFixture: true });
