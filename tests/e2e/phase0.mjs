// Parcours navigateur de la phase 0 : le site exporté s'affiche sous sa politique de
// sécurité, sans erreur, avec le bon thème et les bibliothèques copiées.
//
//   node tests/e2e/phase0.mjs

import { assert, runJourney } from './helpers.mjs';

await runJourney('Parcours phase 0', async ({ site, step, open }) => {
  const light = await open({ label: 'clair' });
  const { page, log } = light;
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const setAttr = (value) => page.evaluate((v) => (v === null ? document.documentElement.removeAttribute('data-theme') : document.documentElement.setAttribute('data-theme', v)), value);

  await step('la page affiche le titre « Dashboard Homepage »', async () => {
    assert.equal(await page.title(), 'Dashboard Homepage');
    assert.equal((await page.locator('h1.app__title').innerText()).trim(), 'Dashboard Homepage');
    assert.equal(await page.locator('h1.app__title svg[aria-hidden="true"]').count(), 1);
  });

  await step('la balise meta de politique de sécurité est présente dans le document exporté', async () => {
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    assert.match(csp, /script-src 'self'/);
    assert.ok(!csp.includes('unsafe-eval'));
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'fr');
  });

  await step('aucune requête hors de l\'origine (pas de CDN)', async () => {
    assert.deepEqual(log.foreign, []);
  });

  await step('thème clair par défaut (préférence système claire)', async () => {
    assert.equal(await bg(), 'rgb(245, 243, 240)');
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), null);
  });

  await step('data-theme="dark" force le sombre, data-theme="light" force le clair', async () => {
    await setAttr('dark');
    assert.equal(await bg(), 'rgb(22, 20, 18)');
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), 'dark');
    await setAttr('light');
    assert.equal(await bg(), 'rgb(245, 243, 240)');
    await setAttr(null);
  });

  await step('la préférence système sombre est suivie ; data-theme="light" la contredit', async () => {
    await page.emulateMedia({ colorScheme: 'dark' });
    assert.equal(await bg(), 'rgb(22, 20, 18)');
    await setAttr('light');
    assert.equal(await bg(), 'rgb(245, 243, 240)');
    await setAttr(null);
    await page.emulateMedia({ colorScheme: 'light' });
  });

  await step('les polices auto-hébergées sont chargées (Instrument Sans, DM Mono)', async () => {
    const r = await page.evaluate(async () => {
      await document.fonts.load('600 32px "Instrument Sans"');
      await document.fonts.load('400 16px "DM Mono"');
      return {
        sans: document.fonts.check('600 32px "Instrument Sans"'),
        mono: document.fonts.check('400 16px "DM Mono"'),
        loaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.weight}`),
      };
    });
    assert.ok(r.sans && r.mono, JSON.stringify(r));
    assert.ok(r.loaded.some((l) => l.includes('Instrument Sans')), JSON.stringify(r.loaded));
  });

  await step('GridStack et SortableJS se chargent comme modules ES dans le navigateur', async () => {
    const r = await page.evaluate(async () => {
      const g = await import('./vendor/gridstack.js');
      const s = await import('./vendor/sortable.js');
      const z = await import('./vendor/zod.js');
      return {
        gridstack: typeof g.GridStack?.init,
        sortable: typeof s.Sortable?.create,
        sortableDefault: typeof s.default?.create,
        zod: z.z.string().safeParse('a').success,
      };
    });
    assert.deepEqual(r, { gridstack: 'function', sortable: 'function', sortableDefault: 'function', zod: true });
  });

  await step('vendor/gridstack.css est servi et ne charge aucune ressource distante', async () => {
    const res = await page.request.get(site.url + 'vendor/gridstack.css');
    assert.equal(res.status(), 200);
    assert.match(res.headers()['content-type'], /text\/css/);
    // L'espace de noms xmlns d'un SVG en data: contient « http:// » sans faire de requête :
    // on contrôle donc les url(...), pas le texte.
    const urls = [...(await res.text()).matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g)].map((m) => m[2]);
    assert.ok(urls.length > 0 && urls.every((u) => u.startsWith('data:') || u.startsWith('./') || u.startsWith('../')), JSON.stringify(urls.map((u) => u.slice(0, 40))));
  });

  await step('aucun débordement horizontal à 390, 768 et 1440 px', async () => {
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      const r = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth,
        padL: parseFloat(getComputedStyle(document.body).paddingLeft),
      }));
      assert.ok(r.sw <= r.cw, `débordement à ${width}px : ${r.sw} > ${r.cw}`);
      assert.ok(r.padL >= 16, `gouttière trop étroite : ${r.padL}px`);
    }
  });

  await step('index.html exporté : theme-init.js dans le head, aucun script en ligne', async () => {
    const r = await page.evaluate(() => ({
      headScripts: [...document.head.querySelectorAll('script')].map((s) => s.getAttribute('src')),
      inline: [...document.querySelectorAll('script')].filter((s) => !s.src).length,
    }));
    assert.deepEqual(r.headScripts, ['./theme-init.js']);
    assert.equal(r.inline, 0);
  });

  await step('le thème choisi (état et miroir « dark ») est appliqué par theme-init.js dès le départ, sans basculer', async () => {
    const dark = await open({
      label: 'miroir sombre',
      init: () => {
        // Prépare un état « sombre » enregistré, une seule fois, et note chaque valeur de data-theme.
        try {
          if (!localStorage.getItem('dash:state')) {
            localStorage.setItem('dash:theme-mirror', 'dark');
            localStorage.setItem(
              'dash:state',
              JSON.stringify({ version: 1, theme: 'dark', activePageId: 'p', pages: [{ id: 'p', name: 'Principal', instances: [] }] }),
            );
          }
        } catch {}
        window.__themes = [];
        new MutationObserver((_, observer) => {
          const root = document.documentElement;
          if (!root) return;
          observer.disconnect();
          window.__themes.push(root.getAttribute('data-theme'));
          new MutationObserver(() => window.__themes.push(root.getAttribute('data-theme'))).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
        }).observe(document, { childList: true });
      },
    });
    assert.equal(await dark.page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark');
    assert.equal(await dark.page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(22, 20, 18)');
    const seen = await dark.page.evaluate(() => window.__themes);
    // La première valeur observée (null = pas encore posé) peut précéder theme-init.js ; ensuite, toujours « dark ».
    assert.ok(seen.filter((v) => v !== null).every((v) => v === 'dark'), `valeurs observées : ${JSON.stringify(seen)}`);
    assert.ok(!seen.slice(1).includes(null), `le thème a basculé : ${JSON.stringify(seen)}`);
  });

  await step('avec localStorage refusé, la page s\'affiche quand même, sans erreur', async () => {
    const refused = await open({
      label: 'stockage refusé',
      init: () => {
        Object.defineProperty(window, 'localStorage', {
          configurable: true,
          get() {
            throw new DOMException('refusé', 'SecurityError');
          },
        });
      },
    });
    assert.equal((await refused.page.locator('h1.app__title').innerText()).trim(), 'Dashboard Homepage');
  });
});
