// Parcours navigateur de la phase 5 : widget Heure, avec l'horloge simulée de Playwright (page.clock).
//
//   node tests/e2e/phase5.mjs

import { assert, readStorage, runJourney, sleep } from './helpers.mjs';
import { formatDate, formatTime } from '../../src/widgets/clock/clockLogic.js';

const TZ = 'Europe/Paris';
const START = '2026-10-26T13:05:09.400Z'; // 14:05:09 à Paris, 08:05:09 à New York (heure d'été : UTC−4)
const PAUSE_AT = '2026-10-26T13:10:00.000Z';
const SETTLE = 700;

await runJourney('Parcours phase 5 (widget Heure)', async ({ step, browser, open }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: TZ, locale: 'fr-FR', colorScheme: 'light' });
  await context.clock.install({ time: new Date(START) });
  const session = await open({ label: 'heure', query: 'dev=1', context });
  const { page, log } = session;
  const clockOf = (id) => page.locator(`section[data-instance-id="${id}"]`);
  const timeOf = async (id) => (await clockOf(id).locator('.clock__time').innerText()).trim();
  const nowMs = () => page.evaluate(() => Date.now());
  const fmt = (ms, tz, timeFormat = '24h', showSeconds = true) => formatTime(new Date(ms), tz, { timeFormat, showSeconds });
  const instances = () => page.evaluate(() => window.__dash.dashboard.getState().pages[0].instances.map((i) => ({ id: i.id, type: i.type, settings: i.settings, layout: i.layout })));
  // L'horloge est figée : Preact planifie ses effets avec requestAnimationFrame / setTimeout,
  // donc après chaque changement on laisse s'écouler quelques millisecondes simulées.
  const flush = () => page.clock.runFor(50);
  const setSettings = async (id, patch) => {
    await page.evaluate(([i, p]) => window.__dash.dashboard.updateInstanceSettings(i, p), [id, patch]);
    await flush();
  };
  const setLayout = async (id, layout) => {
    await page.evaluate(([i, l]) => window.__dash.dashboard.updateLayouts({ [i]: l }), [id, layout]);
    await flush();
  };
  /** Saute à un instant sans faire tourner les minuteurs, puis simule le retour sur l'onglet. */
  const jumpTo = async (iso) => {
    await page.clock.setSystemTime(new Date(iso));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await flush();
  };
  const dialogSwitch = (dialog, name) => dialog.locator('label.toggle', { hasText: name });
  const switchChecked = (dialog, name) => dialog.getByRole('switch', { name }).isChecked();
  const freeze = async (iso = PAUSE_AT) => {
    await page.clock.pauseAt(new Date(iso));
    await sleep(100);
  };

  let a;
  let b;

  await step('le catalogue propose « Heure » ; l\'ajout fonctionne et seul manifest.js change hors du dossier', async () => {
    await page.getByRole('button', { name: 'Ajouter un widget' }).first().click();
    await flush();
    const item = page.locator('.catalog__item[data-widget-type="clock"]');
    assert.equal(await item.count(), 1);
    assert.match(await item.innerText(), /Heure/);
    assert.match(await page.locator('.catalog__group-title').first().innerText(), /Temps/i);
    await page.getByRole('button', { name: 'Ajouter Heure' }).click();
    await flush();
    await page.locator('section.widget[data-widget-type="clock"]').waitFor();
    [a] = (await instances()).map((i) => i.id);
    const layout = (await instances())[0].layout;
    assert.deepEqual({ w: layout.w, h: layout.h }, { w: 3, h: 3 }, 'taille par défaut 3×3');
    assert.equal(await page.locator('section.widget .widget__title').innerText(), 'Heure');
  });

  await step('l\'heure est celle du moment, au format 24 h avec secondes, la date en français, un élément <time>', async () => {
    await freeze();
    await page.clock.runFor(300);
    assert.equal(await timeOf(a), '14:10:00');
    assert.equal(await timeOf(a), fmt(await nowMs(), TZ));
    assert.equal((await clockOf(a).locator('.clock__date').innerText()).trim(), 'lundi 26 octobre');
    const dt = await clockOf(a).locator('time.clock__time').getAttribute('datetime');
    assert.equal(new Date(dt).getTime(), Math.floor((await nowMs()) / 1000) * 1000, 'datetime : l\'instant du dernier top');
    assert.equal(await clockOf(a).locator('.widget__body [aria-live]').count(), 0, 'pas d\'aria-live : annoncer chaque seconde serait insupportable');
    assert.equal(await clockOf(a).locator('.clock__greeting').count(), 0, 'salutation désactivée par défaut');
  });

  await step('l\'heure change pile au début de chaque seconde', async () => {
    // t = 13:10:00.300 → la seconde suivante commence dans 700 ms.
    await page.clock.runFor(699);
    assert.equal(await timeOf(a), '14:10:00', 'à 13:10:00.999 la seconde n\'a pas encore changé');
    await page.clock.runFor(1);
    assert.equal(await timeOf(a), '14:10:01', 'à 13:10:01.000 pile, elle a changé');
    for (let i = 2; i <= 5; i++) {
      await page.clock.runFor(999);
      assert.equal(await timeOf(a), `14:10:0${i - 1}`);
      await page.clock.runFor(1);
      assert.equal(await timeOf(a), `14:10:0${i}`);
    }
  });

  await step('après plusieurs minutes, l\'heure est exacte (aucune dérive)', async () => {
    await page.clock.runFor(7 * 60_000 + 123); // 13:17:05.123 ; 123 ms après le début de la seconde
    const ms = await nowMs();
    assert.equal(ms % 1000, 123);
    assert.equal(await timeOf(a), fmt(ms, TZ));
    assert.equal(await timeOf(a), '14:17:05');
    await page.clock.runFor(877);
    assert.equal(await nowMs() % 1000, 0);
    assert.equal(await timeOf(a), '14:17:06');
  });

  await step('après une minute dans un autre onglet, l\'heure est correcte dès le retour (visibilitychange)', async () => {
    // L'horloge saute d'une minute sans que les minuteurs aient tourné : l'affichage est périmé.
    await page.clock.setSystemTime(new Date(await nowMs() + 61_000));
    assert.equal(await timeOf(a), '14:17:06', 'rien ne s\'est mis à jour pendant le saut');
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForFunction((id) => document.querySelector(`section[data-instance-id="${id}"] .clock__time`).textContent === '14:18:07', a);
    assert.equal(await timeOf(a), fmt(await nowMs(), TZ));
    // Et le rythme reste calé sur le début de seconde.
    await page.clock.runFor(1000);
    assert.equal(await timeOf(a), '14:18:08');
  });

  await step('un widget masqué par fastForward se resynchronise au tick suivant', async () => {
    await page.clock.fastForward(5 * 60_000);
    await page.clock.runFor(1000);
    assert.equal(await timeOf(a), fmt(await nowMs(), TZ));
  });

  await step('deux widgets Heure coexistent avec des réglages différents (12 h + New York / 24 h sans secondes)', async () => {
    await page.evaluate(() => window.__dash.actions.addWidget('clock'));
    await flush();
    await page.locator('section.widget[data-widget-type="clock"]').nth(1).waitFor();
    b = (await instances()).map((i) => i.id).find((id) => id !== a);
    await setLayout(a, { x: 0, y: 0, w: 3, h: 3 });
    await setLayout(b, { x: 3, y: 0, w: 3, h: 3 });
    await setSettings(b, { timeFormat: '12h', secondaryZones: [{ timeZone: 'America/New_York', label: '' }] });
    await setSettings(a, { showSeconds: false });
    await sleep(200);
    const ms = await nowMs();
    assert.equal(await timeOf(a), fmt(ms, TZ, '24h', false));
    assert.match(await timeOf(a), /^\d\d:\d\d$/);
    assert.equal(await timeOf(b), fmt(ms, TZ, '12h', true));
    assert.match(await timeOf(b), /^\d\d:\d\d:\d\d [AP]M$/);
    const zone = clockOf(b).locator('.clock__zone');
    assert.equal(await zone.count(), 1);
    assert.equal((await zone.locator('.clock__zone-label').innerText()).trim(), 'New York');
    assert.equal((await zone.locator('time').innerText()).trim(), fmt(ms, 'America/New_York', '12h', true));
    assert.equal(await clockOf(a).locator('.clock__zone').count(), 0);
  });

  await step('sans secondes : le widget ne change qu\'au début de chaque minute', async () => {
    const ms = await nowMs();
    const toMinute = 60_000 - (ms % 60_000);
    const before = await timeOf(a);
    await page.clock.runFor(toMinute - 1);
    assert.equal(await timeOf(a), before);
    await page.clock.runFor(1);
    assert.equal(await timeOf(a), fmt(await nowMs(), TZ, '24h', false));
    assert.notEqual(await timeOf(a), before);
    assert.equal((await nowMs()) % 60_000, 0);
  });

  await step('réglages par le panneau : interrupteurs, prénom, fuseaux (ajout, nom, refus, maximum, retrait)', async () => {
    await clockOf(b).hover();
    await page.getByRole('button', { name: 'Options de Heure' }).nth(1).click();
    await flush();
    await page.getByRole('menuitem', { name: 'Réglages' }).click();
    await flush();
    const dialog = page.getByRole('dialog', { name: 'Réglages : Heure' });
    await dialog.waitFor();
    assert.equal(await switchChecked(dialog, 'Format 12 heures'), true);
    assert.equal(await switchChecked(dialog, 'Afficher les secondes'), true);
    assert.equal(await switchChecked(dialog, 'Afficher la salutation'), false);
    assert.equal(await dialog.getByLabel('Prénom').count(), 0, 'le prénom n\'apparaît qu\'avec la salutation');

    await dialogSwitch(dialog, 'Afficher la salutation').click();
    await flush();
    await dialog.getByLabel('Prénom').fill('Camille');
    await flush();
    await dialogSwitch(dialog, 'Afficher les secondes').click();
    await flush();
    assert.equal((await clockOf(b).locator('.clock__greeting').innerText()).trim(), 'Bonjour Camille');
    assert.match(await timeOf(b), /^\d\d:\d\d [AP]M$/);

    const add = async (text) => {
      await dialog.getByLabel('Ajouter un fuseau').fill(text);
      await dialog.getByRole('button', { name: 'Ajouter', exact: true }).click();
      await flush();
    };
    await add('Mars/Olympus');
    assert.match(await dialog.locator('.field__error').innerText(), /n'est pas un fuseau horaire valide/);
    assert.equal((await instances()).find((i) => i.id === b).settings.secondaryZones.length, 1, 'un fuseau invalide n\'est pas ajouté');
    await add('america/new_york');
    assert.match(await dialog.locator('.field__error').innerText(), /déjà dans la liste/);
    await add('Tokyo');
    await add('Asia/Dubai');
    await add('Europe/London');
    assert.equal(await dialog.locator('.clock-zones__item').count(), 4);
    assert.equal(await dialog.getByLabel('Ajouter un fuseau').isDisabled(), true, 'maximum de 4 fuseaux');
    assert.equal(await dialog.getByRole('button', { name: 'Ajouter', exact: true }).isDisabled(), true);
    await dialog.getByLabel('Nom pour Asia/Tokyo').fill('Bureau de Tokyo');
    await dialog.getByRole('button', { name: 'Retirer Dubai' }).click();
    await flush();
    assert.equal(await dialog.locator('.clock-zones__item').count(), 3);
    assert.equal(await dialog.getByLabel('Ajouter un fuseau').isDisabled(), false);
    assert.deepEqual(
      (await instances()).find((i) => i.id === b).settings.secondaryZones,
      [
        { timeZone: 'America/New_York', label: '' },
        { timeZone: 'Asia/Tokyo', label: 'Bureau de Tokyo' },
        { timeZone: 'Europe/London', label: '' },
      ],
    );
    await dialog.getByRole('button', { name: 'Terminé' }).click();
    await flush();
    await dialog.waitFor({ state: 'detached' });
    // Réglages de l'autre instance intacts.
    assert.deepEqual((await instances()).find((i) => i.id === a).settings, {
      timeFormat: '24h', showSeconds: false, showDate: true, showGreeting: false, userName: '', secondaryZones: [],
    });
  });

  await step('mention « +1 j » / « −1 j » quand la date du fuseau secondaire diffère', async () => {
    // 23 h 30 à Paris : Tokyo est déjà le lendemain ; New York est le même jour.
    await jumpTo('2026-10-26T21:30:00.000Z');
    const rows = clockOf(b).locator('.clock__zone');
    const row = async (label) => (await rows.filter({ hasText: label }).innerText()).replace(/\s+/g, ' ').trim();
    assert.match(await row('Bureau de Tokyo'), /^Bureau de Tokyo \+1 j 06:30 AM$/);
    assert.match(await row('New York'), /^New York 05:30 PM$/);
    // 00 h 30 à Paris : New York est la veille.
    await jumpTo('2026-10-25T23:30:00.000Z');
    assert.match(await row('New York'), /^New York \u22121 j 07:30 PM$/);
    assert.equal((await clockOf(b).locator('.clock__greeting').innerText()).trim(), 'Bonsoir Camille');
    await jumpTo('2026-10-26T04:59:00.000Z'); // 05 h 59 à Paris
    assert.equal((await clockOf(b).locator('.clock__greeting').innerText()).trim(), 'Bonjour Camille');
    await jumpTo('2026-10-26T16:59:30.000Z'); // 17 h 59 à Paris
    assert.equal((await clockOf(b).locator('.clock__greeting').innerText()).trim(), 'Bonjour Camille');
    await page.clock.runFor(30_000); // 18 h 00
    assert.equal((await clockOf(b).locator('.clock__greeting').innerText()).trim(), 'Bonsoir Camille');
    await jumpTo('2026-10-26T13:10:00.000Z');
  });

  await step('les fuseaux secondaires sont masqués sous 3 lignes de haut', async () => {
    assert.equal(await clockOf(b).locator('.clock__zone').count(), 3);
    await setLayout(b, { x: 3, y: 0, w: 3, h: 2 });
    await sleep(300);
    assert.equal(await clockOf(b).locator('.clock__zone').count(), 0);
    await setLayout(b, { x: 3, y: 0, w: 3, h: 3 });
    await sleep(300);
    assert.equal(await clockOf(b).locator('.clock__zone').count(), 3);
  });

  /** Mesure : l'heure tient dans le conteneur, sans débordement horizontal ni vertical. */
  const measure = (id) =>
    page.evaluate((instanceId) => {
      const root = document.querySelector(`section[data-instance-id="${instanceId}"]`);
      const clock = root.querySelector('.clock');
      const time = root.querySelector('.clock__time');
      const c = clock.getBoundingClientRect();
      const t = time.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(time);
      const text = range.getBoundingClientRect();
      return {
        fontSize: parseFloat(getComputedStyle(time).fontSize),
        textRight: text.right - c.right,
        textLeft: c.left - text.left,
        timeTop: c.top - t.top,
        timeBottom: t.bottom - c.bottom,
        scrollW: clock.scrollWidth - clock.clientWidth,
        scrollH: clock.scrollHeight - clock.clientHeight,
        width: c.width,
        height: c.height,
      };
    }, id);
  const fits = (m, label) => {
    assert.ok(m.textRight <= 1, `${label} : l'heure dépasse à droite de ${m.textRight}px`);
    assert.ok(m.textLeft <= 1, `${label} : l'heure dépasse à gauche`);
    assert.ok(m.timeTop <= 1 && m.timeBottom <= 1, `${label} : l'heure dépasse verticalement (${m.timeTop}, ${m.timeBottom})`);
    assert.ok(m.scrollW <= 1, `${label} : débordement horizontal du widget`);
    assert.ok(m.scrollH <= 1, `${label} : débordement vertical du widget (${m.scrollH}px)`);
  };

  await step('agrandir et réduire (clavier : Maj + flèches) adapte les chiffres, sans débordement', async () => {
    // Widget B est le plus chargé : 12 h, prénom, date, 3 fuseaux. A : le plus simple.
    await setSettings(a, { showSeconds: true });
    await setLayout(a, { x: 0, y: 0, w: 3, h: 3 });
    await setLayout(b, { x: 6, y: 0, w: 3, h: 3 });
    await sleep(400);
    const sizes = [];
    for (const id of [a, b]) {
      const label = id === a ? 'A' : 'B';
      await page.getByRole('button', { name: 'Modifier la disposition' }).click();
      await flush();
      await clockOf(id).locator('.widget__grip').focus();
      const small = await measure(id);
      fits(small, `${label} 3×3`);
      for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowRight');
      for (let i = 0; i < 2; i++) await page.keyboard.press('Shift+ArrowDown');
      await sleep(500);
      const big = await measure(id);
      fits(big, `${label} 7×5`);
      assert.ok(big.fontSize > small.fontSize * 1.5, `${label} : les chiffres doivent grandir (${small.fontSize} → ${big.fontSize})`);
      for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowLeft');
      for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowUp');
      await sleep(500);
      const tiny = await measure(id);
      fits(tiny, `${label} 2×2`);
      assert.ok(tiny.fontSize < small.fontSize, `${label} : les chiffres doivent rétrécir (${small.fontSize} → ${tiny.fontSize})`);
      const placed = (await instances()).find((i) => i.id === id).layout;
      assert.deepEqual({ w: placed.w, h: placed.h }, { w: 2, h: 2 }, 'la taille minimale 2×2 est respectée');
      sizes.push([small.fontSize, big.fontSize, tiny.fontSize]);
      for (let i = 0; i < 1; i++) await page.keyboard.press('Shift+ArrowRight');
      await page.keyboard.press('Shift+ArrowDown');
      await sleep(400);
      await page.keyboard.press('Escape');
      await sleep(200);
    }
    console.log('      tailles de police (3×3, 7×5, 2×2) :', JSON.stringify(sizes.map((s) => s.map((n) => Math.round(n)))));
  });

  await step('aucun débordement sur un balayage de tailles (de 2×2 à 12×6) et en mode sombre', async () => {
    for (const id of [a, b]) {
      for (const [w, h] of [[2, 2], [2, 3], [3, 2], [4, 3], [6, 2], [12, 2], [12, 6], [2, 6], [5, 4], [3, 3]]) {
        await setLayout(id, { x: 0, y: 0, w, h });
        await sleep(250);
        fits(await measure(id), `${id === a ? 'A' : 'B'} ${w}×${h}`);
      }
    }
    await page.emulateMedia({ colorScheme: 'dark' });
    await sleep(200);
    fits(await measure(a), 'A sombre');
    await page.emulateMedia({ colorScheme: 'light' });
  });

  await step('recharger : réglages et fuseaux conservés', async () => {
    await sleep(SETTLE);
    const before = await instances();
    const keys = Object.keys(await readStorage(page));
    await session.reload();
    await page.clock.pauseAt(new Date((await nowMs()) + 500)).catch(() => {});
    await page.clock.runFor(500);
    const after = await instances();
    assert.deepEqual(after.map((i) => ({ id: i.id, settings: i.settings })), before.map((i) => ({ id: i.id, settings: i.settings })));
    assert.equal(after.find((i) => i.id === b).settings.secondaryZones.length, 3);
    assert.equal(await clockOf(b).locator('.clock__zone').count(), 3);
    assert.equal((await clockOf(b).locator('.clock__greeting').innerText()).trim(), 'Bonjour Camille');
    assert.equal(await timeOf(a), fmt(await nowMs(), TZ));
    assert.deepEqual(Object.keys(await readStorage(page)), keys);
  });

  await step('le widget n\'écrit aucune donnée : chaque seconde qui passe ne produit aucune écriture', async () => {
    await page.evaluate(() => {
      window.__writes = 0;
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (...args) {
        window.__writes++;
        return set.apply(this, args);
      };
    });
    await page.clock.runFor(30_000);
    await sleep(500);
    assert.equal(await page.evaluate(() => window.__writes), 0);
  });

  await step('console propre', async () => {
    assert.deepEqual(log.errors, []);
  });
});
