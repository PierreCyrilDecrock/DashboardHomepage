// Parcours navigateur de la phase 1 : état, stockage, persistance, thème, plusieurs onglets.
//
//   node tests/e2e/phase1.mjs
//
// Toute la couche de données est vérifiée dans Chromium, sur le site exporté (avec sa
// politique de sécurité), en pilotant les stores par la console (?dev=1).

import { assert, readStorage, runJourney, sleep } from './helpers.mjs';

const INSTANCE = (id, over = {}) => ({
  id,
  type: 'sonde', // type absent du registre : le cadre affiche « Widget indisponible » et ne touche à rien
  layout: { x: 0, y: 0, w: 4, h: 4 },
  settings: {},
  version: 1,
  ...over,
});

/** Note chaque clé écrite dans localStorage (la clé de sonde dash:probe est ignorée par les tests). */
const spyInit = () => {
  window.__writes = [];
  const original = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    if (key !== 'dash:probe') window.__writes.push(key);
    return original.call(this, key, value);
  };
};
const writes = (page) => page.evaluate(() => window.__writes);

await runJourney('Parcours phase 1', async ({ step, open }) => {
  // --- Premier lancement ---------------------------------------------------------------
  const first = await open({ label: 'premier lancement', query: 'dev=1', init: spyInit });
  const { page } = first;

  await step('premier lancement : __dash.dashboard.getState() renvoie une page « Principal » vide', async () => {
    const state = await page.evaluate(() => window.__dash.dashboard.getState());
    assert.equal(state.version, 2);
    assert.deepEqual(state.preferences, { singleKeyShortcuts: true });
    assert.equal(state.theme, 'system');
    assert.equal(state.pages.length, 1);
    assert.equal(state.pages[0].name, 'Principal');
    assert.deepEqual(state.pages[0].instances, []);
    assert.equal(state.activePageId, state.pages[0].id);
    assert.deepEqual(await page.evaluate(() => window.__dash.status.getState()), { storageFull: false, readOnly: false, storageUnavailable: false, resetNotice: null });
    assert.deepEqual(await page.evaluate(() => window.__dash.data.getState()), { byId: {} });
  });

  await step('au chargement, rien n\'est écrit à part le miroir du thème ; aucun bandeau, écran de chargement disparu', async () => {
    assert.deepEqual(Object.keys(await readStorage(page)), ['dash:theme-mirror']);
    assert.deepEqual(await writes(page), ['dash:theme-mirror']);
    assert.equal(await page.locator('.banner').count(), 0);
    assert.equal(await page.locator('.loading').count(), 0);
    assert.equal((await page.locator('h1.app__title').innerText()).trim(), 'Dashboard Homepage');
  });

  await step('sans ?dev=1, window.__dash n\'existe pas', async () => {
    const other = await open({ label: 'sans dev', context: first.context });
    assert.equal(await other.page.evaluate(() => typeof window.__dash), 'undefined');
    await other.page.close();
  });

  // --- Ajout depuis la console, rechargement ----------------------------------------
  await step('ajouter une instance et ses données depuis la console, recharger : elles sont toujours là', async () => {
    await page.evaluate((inst) => {
      window.__dash.dashboard.addInstance(inst);
      window.__dash.data.setData(inst.id, { count: 3 }, { version: 1 });
    }, INSTANCE('i1', { title: 'Compteur' }));
    await sleep(450); // écriture regroupée au bout de 300 ms
    const stored = await readStorage(page);
    assert.deepEqual(Object.keys(stored), ['dash:data:i1', 'dash:state', 'dash:theme-mirror']);
    await first.reload();
    const state = await page.evaluate(() => window.__dash.dashboard.getState());
    assert.deepEqual(state.pages[0].instances.map((i) => [i.id, i.title]), [['i1', 'Compteur']]);
    assert.deepEqual(await page.evaluate(() => window.__dash.data.getData('i1')), {
      version: 1,
      data: { count: 3 },
      updatedAt: await page.evaluate(() => window.__dash.data.getData('i1').updatedAt),
    });
    assert.equal(await page.evaluate(() => window.__dash.data.getData('i1').data.count), 3);
  });

  await step('une modification suivie d\'un rechargement immédiat n\'est pas perdue (écriture forcée à la fermeture)', async () => {
    await page.evaluate(() => window.__dash.data.setData('i1', (cur) => ({ count: cur.count + 1 })));
    await first.reload(); // pas d'attente : pagehide doit forcer l'écriture
    assert.equal(await page.evaluate(() => window.__dash.data.getData('i1').data.count), 4);
  });

  // --- État corrompu ----------------------------------------------------------------
  await step('état corrompu : la page se charge avec l\'état par défaut et dash:backup:state garde l\'ancien texte', async () => {
    await page.evaluate(() => localStorage.setItem('dash:state', '{ceci n\'est pas du json'));
    first.log.warnings.length = 0;
    await first.reload();
    const state = await page.evaluate(() => window.__dash.dashboard.getState());
    assert.equal(state.pages[0].name, 'Principal');
    assert.deepEqual(state.pages[0].instances, []);
    const stored = await readStorage(page);
    assert.equal(stored['dash:backup:state'], '{ceci n\'est pas du json');
    assert.ok(first.log.warnings.some((w) => w.includes('dash:backup:state')), 'avertissement attendu dans la console');
    // Les données d'instance, elles, sont conservées.
    assert.equal(await page.evaluate(() => window.__dash.data.getData('i1').data.count), 4);
    first.log.warnings.length = 0;
  });

  await step('données d\'instance invalides : copiées dans dash:backup:<id>, les autres instances se chargent', async () => {
    await page.evaluate(() => {
      localStorage.setItem('dash:data:i1', '{"version":1}');
      localStorage.setItem('dash:data:i2', JSON.stringify({ version: 1, data: { ok: true }, updatedAt: 1 }));
    });
    await first.reload();
    const stored = await readStorage(page);
    assert.equal(stored['dash:backup:i1'], '{"version":1}');
    assert.equal(await page.evaluate(() => window.__dash.data.getData('i1') === undefined), true, 'la donnée invalide n\'est pas chargée');
    assert.deepEqual(await page.evaluate(() => window.__dash.data.getData('i2').data), { ok: true });
    first.log.warnings.length = 0;
  });

  // --- N'écrit que ce qui a changé ------------------------------------------------------
  const spy = await open({ label: 'écritures', query: 'dev=1', init: spyInit, colorScheme: 'light' });
  await step('modifier les données d\'une instance n\'écrit que sa propre clé', async () => {
    await spy.page.evaluate(
      ([a, b]) => {
        window.__dash.dashboard.addInstance(a);
        window.__dash.dashboard.addInstance(b);
        window.__dash.data.setData(a.id, { n: 1 }, { version: 1 });
        window.__dash.data.setData(b.id, { n: 1 }, { version: 1 });
      },
      [INSTANCE('a'), INSTANCE('b', { layout: { x: 4, y: 0, w: 4, h: 4 } })],
    );
    await sleep(450);
    await spy.page.evaluate(() => (window.__writes.length = 0));

    await spy.page.evaluate(() => window.__dash.data.setData('b', { n: 2 }));
    await sleep(450);
    assert.deepEqual(await writes(spy.page), ['dash:data:b']);
  });

  await step('déplacer un widget n\'écrit que dash:state ; un changement de réglages aussi', async () => {
    await spy.page.evaluate(() => (window.__writes.length = 0));
    await spy.page.evaluate(() => window.__dash.dashboard.updateLayouts({ a: { x: 2, y: 3, w: 4, h: 4 } }));
    await sleep(450);
    assert.deepEqual(await writes(spy.page), ['dash:state']);
    await spy.page.evaluate(() => (window.__writes.length = 0));
    await spy.page.evaluate(() => window.__dash.dashboard.updateInstanceSettings('a', { x: 1 }));
    await sleep(450);
    assert.deepEqual(await writes(spy.page), ['dash:state']);
  });

  await step('une rafale de 200 modifications donne une seule écriture', async () => {
    await spy.page.evaluate(() => (window.__writes.length = 0));
    await spy.page.evaluate(async () => {
      for (let i = 0; i < 200; i++) {
        window.__dash.data.setData('a', { n: i });
        await new Promise((r) => setTimeout(r, 2));
      }
    });
    await sleep(450);
    assert.deepEqual(await writes(spy.page), ['dash:data:a']);
    assert.equal(JSON.parse((await readStorage(spy.page))['dash:data:a']).data.n, 199);
  });

  await step('supprimer les données d\'une instance supprime sa clé', async () => {
    await spy.page.evaluate(() => {
      window.__dash.dashboard.removeInstance('a');
      window.__dash.data.removeData('a');
    });
    await sleep(450);
    const stored = await readStorage(spy.page);
    assert.equal('dash:data:a' in stored, false);
    assert.ok('dash:data:b' in stored);
  });

  // --- Stockage refusé -----------------------------------------------------------------
  await step('stockage refusé : la page se charge, un bandeau prévient que rien ne sera conservé', async () => {
    const refused = await open({
      label: 'stockage refusé',
      query: 'dev=1',
      init: () => {
        Object.defineProperty(window, 'localStorage', {
          configurable: true,
          get() {
            throw new DOMException('Accès refusé', 'SecurityError');
          },
        });
      },
    });
    const banner = refused.page.locator('.banner', { hasText: 'Stockage indisponible : rien ne sera conservé' });
    assert.equal(await banner.count(), 1);
    assert.equal(await banner.getAttribute('role'), 'status');
    assert.equal((await refused.page.evaluate(() => window.__dash.status.getState())).storageUnavailable, true);

    // L'application fonctionne quand même, en mémoire.
    await refused.page.evaluate((inst) => window.__dash.dashboard.addInstance(inst), INSTANCE('m1'));
    assert.equal(await refused.page.evaluate(() => window.__dash.dashboard.getState().pages[0].instances.length), 1);
    await sleep(450);
    await refused.reload();
    assert.equal(await refused.page.evaluate(() => window.__dash.dashboard.getState().pages[0].instances.length), 0, 'rien n\'est conservé');
    assert.equal(await refused.page.locator('.banner').count(), 1);
    assert.equal(refused.log.warnings.length, 0);
  });

  // --- Quota ---------------------------------------------------------------------------
  await step('quota dépassé : bandeau « Stockage plein », qui disparaît quand une écriture réussit', async () => {
    const quota = await open({
      label: 'quota',
      query: 'dev=1',
      init: () => {
        window.__full = true;
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (window.__full && (key === 'dash:state' || key.startsWith('dash:data:'))) {
            throw new DOMException('Quota dépassé', 'QuotaExceededError');
          }
          return original.call(this, key, value);
        };
      },
    });
    assert.equal(await quota.page.locator('.banner').count(), 0, 'pas de bandeau avant l\'échec');
    await quota.page.evaluate((inst) => window.__dash.dashboard.addInstance(inst), INSTANCE('q1'));
    await quota.page.waitForSelector('.banner:has-text("Stockage plein")');
    assert.equal(await quota.page.locator('.banner', { hasText: 'Stockage plein' }).getAttribute('role'), 'alert');
    assert.equal((await quota.page.evaluate(() => window.__dash.status.getState())).storageFull, true);

    await quota.page.evaluate(() => {
      window.__full = false;
      window.__dash.dashboard.setTheme('dark');
    });
    await quota.page.waitForSelector('.banner', { state: 'detached' });
    assert.equal((await quota.page.evaluate(() => window.__dash.status.getState())).storageFull, false);
  });

  // --- Version plus récente : lecture seule ---------------------------------------------
  await step('données d\'une version plus récente : lecture seule, bandeau, aucune écriture', async () => {
    const newerState = {
      version: 7,
      theme: 'dark',
      preferences: { singleKeyShortcuts: true },
      activePageId: 'p1',
      pages: [{ id: 'p1', name: 'Futur', instances: [INSTANCE('n1')] }],
      champFutur: true,
    };
    const raw = JSON.stringify(newerState);
    const readonly = await open({
      label: 'lecture seule',
      query: 'dev=1',
      init: {
        fn: (seed) => {
          if (!localStorage.getItem('dash:state')) {
            localStorage.setItem('dash:state', seed.raw);
            localStorage.setItem('dash:data:n1', JSON.stringify({ version: 1, data: { x: 1 }, updatedAt: 1 }));
          }
          window.__writes = [];
          const original = Storage.prototype.setItem;
          Storage.prototype.setItem = function (key, value) {
            if (key !== 'dash:probe') window.__writes.push(key); // la sonde d'écriture, effacée aussitôt, n'est pas une donnée
            return original.call(this, key, value);
          };
        },
        arg: { raw },
      },
    });
    const p = readonly.page;
    assert.equal((await p.evaluate(() => window.__dash.status.getState())).readOnly, true);
    assert.equal(await p.locator('.banner', { hasText: 'Lecture seule' }).count(), 1);
    assert.equal(await p.evaluate(() => window.__dash.dashboard.getState().pages[0].name), 'Futur');

    await p.evaluate(() => {
      window.__dash.dashboard.setTheme('light');
      window.__dash.dashboard.updateLayouts({ n1: { x: 6, y: 6, w: 2, h: 2 } });
      window.__dash.data.setData('n1', { x: 2 });
    });
    await sleep(450);
    await readonly.reload();
    assert.equal((await readStorage(p))['dash:state'], raw, 'l\'état enregistré est intact');
    assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('dash:data:n1')).data.x), 1);
    assert.deepEqual(await writes(p), [], 'aucun appel à setItem en lecture seule (miroir du thème compris)');
    assert.equal(await p.evaluate(() => localStorage.getItem('dash:theme-mirror')), null);
    assert.equal(await p.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('dash:backup:'))), false);
  });

  // --- Thème -----------------------------------------------------------------------------
  await step('thème : data-theme et miroir suivent le choix, le choix survit au rechargement', async () => {
    const t = await open({ label: 'thème', query: 'dev=1', init: spyInit });
    const attr = () => t.page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    const mirror = () => t.page.evaluate(() => localStorage.getItem('dash:theme-mirror'));
    assert.equal(await attr(), null);
    assert.equal(await mirror(), 'system');

    await t.page.evaluate(() => window.__dash.dashboard.setTheme('dark'));
    assert.equal(await attr(), 'dark');
    assert.equal(await mirror(), 'dark');
    assert.equal(await t.page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(22, 20, 18)');
    await sleep(450);
    assert.equal(JSON.parse((await readStorage(t.page))['dash:state']).theme, 'dark');

    await t.reload();
    assert.equal(await attr(), 'dark');
    assert.equal(await t.page.evaluate(() => window.__dash.dashboard.getState().theme), 'dark');

    await t.page.evaluate(() => window.__dash.dashboard.setTheme('light'));
    assert.equal(await attr(), 'light');
    assert.equal(await t.page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(245, 243, 240)');

    await t.page.evaluate(() => window.__dash.dashboard.setTheme('system'));
    assert.equal(await attr(), null);
    assert.equal(await mirror(), 'system');
  });

  await step('un thème imposé par l\'hôte (data-theme déjà posé) n\'est pas retiré en mode système', async () => {
    const host = await open({
      label: 'hôte',
      query: 'dev=1',
      init: () => {
        new MutationObserver((_, observer) => {
          if (document.documentElement) {
            document.documentElement.setAttribute('data-theme', 'dark');
            observer.disconnect();
          }
        }).observe(document, { childList: true });
      },
    });
    assert.equal(await host.page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark');
    assert.equal(await host.page.evaluate(() => window.__dash.dashboard.getState().theme), 'system');
  });

  // --- useStore : rendus --------------------------------------------------------------
  await step('useStore : un composant n\'est rendu de nouveau que si SA valeur sélectionnée change', async () => {
    const r = await page.evaluate(async () => {
      const { createStore } = await import('./src/core/store/createStore.js');
      const { useStore } = await import('./src/core/store/useStore.js');
      const { html, render } = await import('./src/lib/vendor.js');
      const store = createStore({ a: 0, b: 0 });
      const counts = { A: 0, B: 0 };
      function A() {
        counts.A++;
        const a = useStore(store, (s) => s.a);
        return html`<p>A=${a}</p>`;
      }
      function B() {
        counts.B++;
        const b = useStore(store, (s) => s.b);
        return html`<p>B=${b}</p>`;
      }
      const mount = document.createElement('div');
      document.body.append(mount);
      render(html`<${A} /><${B} />`, mount);
      const wait = () => new Promise((resolve) => setTimeout(resolve, 60));
      await wait();
      const initial = { ...counts };
      store.setState({ b: 1 });
      await wait();
      store.setState({ b: 2 });
      await wait();
      store.setState({ b: 2 }); // même valeur : aucun rendu
      await wait();
      const afterB = { ...counts, text: mount.textContent };
      store.setState({ a: 1 });
      await wait();
      const afterA = { ...counts, text: mount.textContent };
      render(null, mount); // démontage : plus d'abonnement
      store.setState({ a: 5, b: 5 });
      await wait();
      const afterUnmount = { ...counts };
      mount.remove();
      return { initial, afterB, afterA, afterUnmount };
    });
    assert.deepEqual(r.initial, { A: 1, B: 1 });
    assert.deepEqual(r.afterB, { A: 1, B: 3, text: 'A=0B=2' }, 'changer b ne redessine pas A');
    assert.deepEqual(r.afterA, { A: 2, B: 3, text: 'A=1B=2' }, 'changer a ne redessine pas B');
    assert.deepEqual(r.afterUnmount, { A: 2, B: 3 });
  });

  // --- Deux onglets ----------------------------------------------------------------------
  await step('deux onglets : un changement fait dans l\'un apparaît dans l\'autre, sans réécriture en retour', async () => {
    const one = await open({ label: 'onglet 1', query: 'dev=1', init: spyInit });
    const two = await open({ label: 'onglet 2', query: 'dev=1', context: one.context });
    await two.page.evaluate(() => (window.__writes = []));
    // Le deuxième onglet n'a pas le script d'espionnage : on l'installe à la main.
    await two.page.evaluate(() => {
      window.__writes = [];
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        window.__writes.push(key);
        return original.call(this, key, value);
      };
    });

    await one.page.evaluate((inst) => {
      window.__dash.dashboard.addInstance(inst);
      window.__dash.data.setData(inst.id, { note: 'écrit dans l\'onglet 1' }, { version: 1 });
    }, INSTANCE('shared'));
    await two.page.waitForFunction(() => window.__dash.data.getData('shared') !== undefined);
    await two.page.waitForFunction(() => window.__dash.dashboard.getState().pages[0].instances.some((i) => i.id === 'shared'));
    assert.equal(await two.page.evaluate(() => window.__dash.data.getData('shared').data.note), 'écrit dans l\'onglet 1');

    await two.page.evaluate(() => window.__dash.data.setData('shared', { note: 'modifié dans l\'onglet 2' }));
    await one.page.waitForFunction(() => window.__dash.data.getData('shared').data.note === 'modifié dans l\'onglet 2');

    await sleep(500);
    assert.deepEqual([...new Set(await writes(two.page))], ['dash:data:shared'], 'l\'onglet 2 n\'écrit que sa propre modification');
    assert.equal(await one.page.evaluate(() => window.__writes.filter((k) => k === 'dash:data:shared').length), 1, 'l\'onglet 1 n\'a pas réécrit ce que l\'onglet 2 venait d\'écrire');
  });
});
