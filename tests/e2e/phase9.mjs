// Parcours navigateur de la phase 9 : widget Minuteur (moteur de décompte, alarme, titre d'onglet).
//
//   node tests/e2e/phase9.mjs
//
// Le temps est simulé (page.clock) : une minute de minuteur dure quelques millisecondes de test.
// Les API audio et de notification sont remplacées par des doubles injectés avant le chargement :
//   - window.__beeps    : nombre de bips démarrés (une alarme = 3) ;
//   - window.__notifs   : notifications créées ;
//   - window.__permRequests : nombre de demandes de permission.
// Les parcours à deux onglets utilisent le vrai navigator.locks et le temps réel.

import { assert, readStorage, runJourney, sleep } from './helpers.mjs';

const T0 = new Date('2026-10-27T14:00:00');

/** Doubles d'AudioContext et de Notification (exécuté dans la page, avant tout script). */
function installDoubles({ permission, grant }) {
  window.__beeps = 0;
  window.__notifs = [];
  window.__permRequests = 0;
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} });
  class FakeAudioContext {
    constructor() {
      this.state = 'running';
      this.currentTime = 0;
      this.destination = {};
    }
    resume() {
      return Promise.resolve();
    }
    close() {
      return Promise.resolve();
    }
    createOscillator() {
      return { type: '', frequency: param(), connect() {}, disconnect() {}, start() { window.__beeps++; }, stop() {}, addEventListener() {} };
    }
    createGain() {
      return { gain: param(), connect() {}, disconnect() {} };
    }
  }
  window.AudioContext = FakeAudioContext;
  window.webkitAudioContext = FakeAudioContext;
  if (permission === null) {
    delete window.Notification;
  } else {
    let current = permission;
    window.Notification = class {
      constructor(title, options) {
        window.__notifs.push({ title, body: options?.body ?? '', tag: options?.tag ?? '' });
      }
      static get permission() {
        return current;
      }
      static requestPermission() {
        window.__permRequests++;
        current = grant ? 'granted' : 'denied';
        return Promise.resolve(current);
      }
    };
  }
}

await runJourney('Parcours phase 9 (widget Minuteur)', async ({ step, browser, open }) => {
  /** Contexte avec doubles ; `clock: false` garde le temps réel. */
  async function makeContext({ permission = 'default', grant = true, reduced = false, clock = true } = {}) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
    await context.addInitScript(installDoubles, { permission, grant });
    if (clock) await context.clock.install({ time: T0 });
    return context;
  }
  /** Ouvre l'application dans un contexte ; le temps simulé est ensuite figé (il n'avance que par runFor). */
  async function start(options = {}) {
    const context = await makeContext(options);
    const session = await open({ label: options.label ?? 'minuteur', query: 'dev=1', context });
    if (options.clock !== false) await freeze(session.page);
    return session;
  }
  async function freeze(page) {
    const now = await page.evaluate(() => Date.now());
    await page.clock.pauseAt(new Date(now + 1000));
  }
  const tick = async (page, ms) => {
    await page.clock.runFor(ms);
    await page.clock.runFor(50);
  };
  const addTimer = async (page, settings = {}) => {
    const id = await page.evaluate(() => window.__dash.actions.addWidget('timer'));
    await page.clock.runFor(100);
    const ids = await page.evaluate(() => window.__dash.dashboard.getState().pages[0].instances.filter((i) => i.type === 'timer').map((i) => i.id));
    const instanceId = ids.at(-1);
    if (Object.keys(settings).length) {
      await page.evaluate(([i, s]) => window.__dash.dashboard.updateInstanceSettings(i, s), [instanceId, settings]);
      await page.clock.runFor(100);
    }
    return instanceId;
  };
  const widget = (page, index = 0) => page.locator('section.widget[data-widget-type="timer"]').nth(index);
  const status = (w) => w.locator('.timer').getAttribute('data-status');
  const timeText = async (w) => (await w.locator('[data-testid="timer-time"]').textContent()).trim();
  /** Temps affiché, en secondes. */
  const seconds = async (w) => (await timeText(w)).split(':').map(Number).reduce((total, part) => total * 60 + part, 0);
  const beeps = (page) => page.evaluate(() => window.__beeps);
  const notifs = (page) => page.evaluate(() => window.__notifs);
  const primary = (w) => w.locator('.timer__primary');
  const live = async (w) => (await w.locator('[data-testid="timer-live"]').textContent()).trim();
  const baseTitle = 'Dashboard Homepage';

  async function openSettings(page, w, name = 'Minuteur') {
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
  const settingsOf = (page, id) => page.evaluate((i) => window.__dash.dashboard.getState().pages[0].instances.find((x) => x.id === i).settings, id);

  await step('départ : un minuteur de 1 min décompte, sonne une seule fois et affiche « Terminé à HH:MM »', async () => {
    const { page } = await start();
    await addTimer(page);
    const w = widget(page);
    assert.equal(await timeText(w), '05:00', 'durée par défaut de 5 minutes');
    await w.getByRole('button', { name: '1 min', exact: true }).click();
    assert.equal(await w.getByRole('button', { name: '1 min', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await w.getByRole('button', { name: '5 min', exact: true }).getAttribute('aria-pressed'), 'false');
    assert.equal(await timeText(w), '01:00');
    await primary(w).click();
    await tick(page, 0);
    assert.equal(await status(w), 'running');
    assert.equal(await primary(w).textContent(), 'Pause');
    assert.ok(await primary(w).evaluate((el) => el === document.activeElement), 'le focus reste sur le bouton principal');
    assert.equal(await w.getByRole('group', { name: 'Durées prédéfinies' }).count(), 0, 'les durées ne se changent pas en marche');
    assert.equal(await w.getByLabel('Autre durée').count(), 0);
    await tick(page, 30_000);
    assert.equal(await timeText(w), '00:30');
    await tick(page, 29_000);
    assert.equal(await beeps(page), 0, 'pas de son avant la fin');
    await tick(page, 2_000);
    assert.equal(await status(w), 'done');
    assert.equal(await beeps(page), 3, 'trois bips, une seule fois');
    assert.match((await w.locator('[data-testid="timer-done"]').textContent()).trim(), /^Terminé à 14:01$/);
    assert.equal(await live(w), 'Minuteur terminé');
    assert.equal(await w.locator('[data-testid="timer-live"]').getAttribute('aria-live'), 'assertive');
    await tick(page, 20_000);
    assert.equal(await beeps(page), 3, 'aucune seconde alarme');
    assert.deepEqual(await notifs(page), [], 'pas de notification : option désactivée');
    assert.equal(await page.title(), baseTitle, 'titre d\'onglet restauré');
    // « OK » ramène au repos, focus sur le bouton principal.
    await w.getByRole('button', { name: 'OK' }).click();
    await page.waitForFunction(() => document.activeElement?.classList.contains('timer__primary'), null, { timeout: 3000 });
    assert.equal(await status(w), 'idle');
    assert.equal(await timeText(w), '01:00', 'la durée choisie est conservée');
  });

  await step('pause et reprise : le temps restant est conservé à la seconde près', async () => {
    const { page } = await start();
    await addTimer(page);
    const w = widget(page);
    await w.getByRole('button', { name: '1 min', exact: true }).click();
    await primary(w).click();
    await tick(page, 20_000);
    await primary(w).click(); // Pause
    assert.equal(await status(w), 'paused');
    assert.equal(await timeText(w), '00:40');
    assert.equal(await primary(w).textContent(), 'Reprendre');
    assert.ok(await primary(w).evaluate((el) => el === document.activeElement), 'focus conservé');
    await tick(page, 0);
    assert.equal(await page.title(), baseTitle, 'le titre d\'onglet n\'affiche plus rien en pause');
    await tick(page, 60_000);
    assert.equal(await timeText(w), '00:40', 'figé pendant la pause');
    await primary(w).click(); // Reprendre
    await tick(page, 10_000);
    assert.equal(await timeText(w), '00:30');
    await tick(page, 30_000);
    assert.equal(await status(w), 'done');
    assert.equal(await beeps(page), 3);
    // Réinitialiser pendant le décompte.
    await w.getByRole('button', { name: 'OK' }).click();
    await primary(w).click();
    await tick(page, 5_000);
    await w.getByRole('button', { name: 'Réinitialiser' }).click();
    await page.waitForFunction(() => document.activeElement?.classList.contains('timer__primary'), null, { timeout: 3000 });
    assert.equal(await status(w), 'idle');
    assert.equal(await timeText(w), '01:00');
  });

  await step('durées : préréglages, champ « Autre durée » (Entrée applique sans démarrer), erreur claire', async () => {
    const { page } = await start();
    await addTimer(page);
    const w = widget(page);
    const field = w.getByLabel('Autre durée');
    await field.fill('5:30');
    await field.press('Enter');
    await tick(page, 0);
    assert.equal(await timeText(w), '05:30');
    assert.equal(await status(w), 'idle', 'Entrée ne démarre pas');
    assert.equal(await field.inputValue(), '', 'champ vidé après application');
    for (const name of ['1 min', '5 min', '10 min', '15 min']) assert.equal(await w.getByRole('button', { name, exact: true }).getAttribute('aria-pressed'), 'false');
    await field.fill('abc');
    await primary(w).click();
    await tick(page, 0);
    assert.equal(await status(w), 'idle', 'durée invalide : pas de démarrage');
    assert.match(await w.getByRole('alert').textContent(), /Durée invalide/);
    assert.equal(await field.getAttribute('aria-invalid'), 'true');
    assert.ok(await field.evaluate((el) => el === document.activeElement), 'focus sur le champ en erreur');
    await field.fill('0:45');
    await primary(w).click(); // Démarrer applique la durée saisie puis démarre.
    await tick(page, 0);
    assert.equal(await status(w), 'running');
    assert.equal(await timeText(w), '00:45');
    await tick(page, 46_000);
    assert.equal(await status(w), 'done');
    assert.equal(await beeps(page), 3);
  });

  await step('état en marche restauré après rechargement, puis une seule alarme', async () => {
    const session = await start();
    const { page } = session;
    await addTimer(page);
    const w = widget(page);
    await w.getByLabel('Autre durée').fill('2:00');
    await primary(w).click();
    await tick(page, 30_000);
    await tick(page, 500); // laisse passer l'écriture différée
    const stored = await readStorage(page);
    assert.ok(Object.values(stored).some((v) => v.includes('"running"')), 'l\'état en marche est enregistré');
    await session.reload();
    await freeze(page);
    await tick(page, 100);
    const after = await seconds(widget(page));
    assert.ok(after >= 88 && after <= 90, `environ 1 min 30 restantes après rechargement (lu : ${after})`);
    assert.equal(await status(widget(page)), 'running');
    await tick(page, 91_000);
    assert.equal(await status(widget(page)), 'done');
    assert.equal(await beeps(page), 3, 'une alarme après rechargement');
  });

  await step('fin pendant que la page était fermée : message « Terminé », aucun son', async () => {
    const context = await makeContext();
    const first = await open({ label: 'avant fermeture', query: 'dev=1', context });
    await freeze(first.page);
    await addTimer(first.page);
    const w = widget(first.page);
    await w.getByLabel('Autre durée').fill('0:20');
    await primary(w).click();
    await tick(first.page, 600);
    const now = await first.page.evaluate(() => Date.now());
    await first.page.close();
    await context.clock.setSystemTime(new Date(now + 30_000));
    const second = await open({ label: 'après réouverture', query: 'dev=1', context });
    const page = second.page;
    await page.clock.runFor(500);
    const w2 = widget(page);
    assert.equal(await status(w2), 'done');
    assert.match(await w2.locator('[data-testid="timer-done"]').textContent(), /Terminé à \d\d:\d\d/);
    assert.equal(await live(w2), 'Minuteur terminé');
    await page.clock.runFor(5000);
    assert.equal(await beeps(page), 0, 'fin tardive : pas de son');
    assert.deepEqual(await notifs(page), [], 'fin tardive : pas de notification');
    assert.equal(await w2.locator('.timer__time--celebrate').count(), 0, 'pas d\'animation pour une fin tardive');
  });

  await step('deux minuteurs indépendants : titre d\'onglet = celui qui finit en premier, une alarme chacun', async () => {
    const { page } = await start();
    const a = await addTimer(page, { label: 'Pâtes' });
    const b = await addTimer(page, { label: 'Thé' });
    assert.notEqual(a, b);
    const [wa, wb] = [widget(page, 0), widget(page, 1)];
    assert.equal(await wa.locator('.timer__label').textContent(), 'Pâtes');
    await wa.getByLabel('Autre durée').fill('0:40');
    await wb.getByLabel('Autre durée').fill('0:20');
    await primary(wa).click();
    await primary(wb).click();
    await tick(page, 5_000);
    assert.equal(await page.title(), '00:15 · Thé', 'le plus proche de la fin');
    assert.equal(await timeText(wa), '00:35');
    assert.equal(await timeText(wb), '00:15');
    await tick(page, 16_000);
    assert.equal(await status(wb), 'done');
    assert.equal(await status(wa), 'running');
    assert.equal(await beeps(page), 3, 'une alarme : celle du Thé');
    assert.equal(await page.title(), '00:19 · Pâtes', 'le titre passe à l\'autre minuteur');
    await tick(page, 20_000);
    assert.equal(await status(wa), 'done');
    assert.equal(await beeps(page), 6, 'chaque minuteur sonne une fois');
    assert.equal(await page.title(), baseTitle);
  });

  await step('deux minuteurs qui finissent à la même seconde sonnent chacun (clés distinctes)', async () => {
    const { page } = await start();
    await addTimer(page);
    await addTimer(page);
    for (const i of [0, 1]) await widget(page, i).getByLabel('Autre durée').fill('0:10');
    for (const i of [0, 1]) await primary(widget(page, i)).click();
    await tick(page, 11_000);
    assert.equal(await beeps(page), 6, 'deux alarmes de trois bips');
  });

  await step('deux onglets du même navigateur : une seule alarme (verrous Web Locks)', async () => {
    const context = await makeContext({ clock: false });
    const a = await open({ label: 'onglet A', query: 'dev=1', context });
    await addTimer2(a.page);
    const w = widget(a.page);
    await w.getByLabel('Autre durée').fill('0:03');
    await primary(w).click();
    await sleep(700); // écriture différée
    const b = await open({ label: 'onglet B', query: 'dev=1', context });
    assert.equal(await status(widget(b.page)), 'running', 'le second onglet voit le minuteur en marche');
    await sleep(3500);
    assert.equal(await status(widget(a.page)), 'done');
    assert.equal(await status(widget(b.page)), 'done');
    const total = (await beeps(a.page)) + (await beeps(b.page));
    assert.equal(total, 3, `une seule alarme pour les deux onglets (lu : ${total})`);
    async function addTimer2(page) {
      await page.evaluate(() => window.__dash.actions.addWidget('timer'));
      await widget(page).waitFor();
    }
  });

  await step('onglet masqué pendant une minute : le bon temps s\'affiche immédiatement au retour', async () => {
    const { page } = await start();
    await addTimer(page);
    const w = widget(page);
    await w.getByLabel('Autre durée').fill('3:00');
    await primary(w).click();
    await tick(page, 1_000);
    // Le navigateur gèle les minuteries d'un onglet masqué : l'horloge saute sans exécuter les rappels.
    await page.clock.setSystemTime(new Date((await page.evaluate(() => Date.now())) + 60_000));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForFunction(() => document.querySelector('[data-testid="timer-time"]')?.textContent.trim() === '01:59', null, { timeout: 3000 }).catch(() => {});
    const shown = await seconds(w);
    assert.ok(shown >= 118 && shown <= 120, `environ 1 min 59 s, lu : ${shown}`);
  });

  await step('réglages : libellé, durées prédéfinies (1 à 4, valeurs contrôlées), son', async () => {
    const { page } = await start();
    const id = await addTimer(page);
    const w = widget(page);
    const dialog = await openSettings(page, w);
    await dialog.getByLabel('Libellé').fill('Révisions');
    await tick(page, 400);
    assert.equal(await w.locator('.timer__label').textContent(), 'Révisions');
    assert.equal((await settingsOf(page, id)).label, 'Révisions');
    const first = dialog.getByLabel('Durée 1 (minutes)');
    await first.fill('7');
    await tick(page, 400);
    assert.deepEqual((await settingsOf(page, id)).presetsMinutes, [7, 5, 10, 15]);
    assert.equal(await w.locator('.timer__preset').first().textContent(), '7 min');
    await first.fill('0');
    assert.ok(await dialog.getByRole('alert').first().isVisible(), 'erreur pour une durée invalide');
    await tick(page, 400);
    assert.deepEqual((await settingsOf(page, id)).presetsMinutes, [7, 5, 10, 15], 'valeur invalide non enregistrée');
    await first.fill('7');
    const add = dialog.getByRole('button', { name: 'Ajouter une durée' });
    assert.ok(await add.isDisabled(), 'au plus 4 durées');
    await dialog.getByRole('button', { name: 'Retirer la durée 4' }).click();
    await tick(page, 400);
    assert.equal((await settingsOf(page, id)).presetsMinutes.length, 3);
    await add.click();
    await tick(page, 400);
    assert.equal((await settingsOf(page, id)).presetsMinutes.length, 4);
    // Son désactivé : la fin est affichée mais silencieuse.
    await dialog.locator('label.toggle', { hasText: 'Son à la fin' }).click();
    await tick(page, 400);
    assert.equal((await settingsOf(page, id)).sound, false);
    await closeSettings(dialog);
    await w.getByLabel('Autre durée').fill('0:05');
    await primary(w).click();
    await tick(page, 6_000);
    assert.equal(await status(w), 'done');
    assert.equal(await beeps(page), 0, 'sans son');
  });

  await step('notifications : permission demandée uniquement par le bouton des réglages, puis notification à la fin', async () => {
    const { page } = await start({ permission: 'default', grant: true });
    const id = await addTimer(page);
    const w = widget(page);
    const dialog = await openSettings(page, w);
    assert.match(await dialog.locator('[data-testid="timer-permission"]').textContent(), /non demandées/);
    await dialog.locator('label.toggle', { hasText: 'Notification à la fin' }).click();
    await primary(w).evaluate(() => {});
    assert.equal(await page.evaluate(() => window.__permRequests), 0, 'rien n\'est demandé en ouvrant les réglages ni en basculant l\'option');
    await dialog.getByRole('button', { name: 'Activer les notifications' }).click();
    await page.waitForFunction(() => window.__permRequests === 1);
    await tick(page, 400);
    assert.match(await dialog.locator('[data-testid="timer-permission"]').textContent(), /autorisées/);
    assert.equal((await settingsOf(page, id)).notify, true);
    await closeSettings(dialog);
    assert.equal(await page.evaluate(() => window.__permRequests), 1);
    await w.getByLabel('Autre durée').fill('0:05');
    await primary(w).click();
    await tick(page, 6_000);
    const list = await notifs(page);
    assert.equal(list.length, 1, 'une seule notification');
    assert.equal(list[0].title, 'Minuteur terminé');
    assert.match(list[0].body, /Terminé à \d\d:\d\d/);
    assert.equal(await beeps(page), 3, 'le son sonne aussi');
  });

  await step('notifications refusées ou indisponibles : état expliqué, aucune demande', async () => {
    const denied = await start({ permission: 'denied', label: 'refusées' });
    await addTimer(denied.page);
    let dialog = await openSettings(denied.page, widget(denied.page));
    assert.match(await dialog.locator('[data-testid="timer-permission"]').textContent(), /refusées/);
    assert.equal(await dialog.getByRole('button', { name: 'Activer les notifications' }).count(), 0, 'pas de bouton si refusées');
    assert.match(await dialog.textContent(), /réglages du navigateur|paramètres du navigateur|navigateur/i, 'explique comment réactiver');
    assert.equal(await denied.page.evaluate(() => window.__permRequests), 0);

    const none = await start({ permission: null, label: 'indisponibles' });
    await addTimer(none.page);
    dialog = await openSettings(none.page, widget(none.page));
    assert.match(await dialog.locator('[data-testid="timer-permission"]').textContent(), /non disponibles ici/);
    assert.ok(await dialog.locator('label.toggle', { hasText: 'Notification à la fin' }).locator('input').isDisabled(), 'interrupteur désactivé');
    // Le minuteur fonctionne quand même, sans erreur.
    await closeSettings(dialog);
    const w = widget(none.page);
    await w.getByLabel('Autre durée').fill('0:03');
    await primary(w).click();
    await tick(none.page, 4_000);
    assert.equal(await status(w), 'done');
    assert.equal(await beeps(none.page), 3);
  });

  await step('mouvement réduit : l\'animation de fin est désactivée ; sinon elle est active', async () => {
    const animationOf = (page) => widget(page).locator('[data-testid="timer-time"]').evaluate((el) => getComputedStyle(el).animationName);
    for (const reduced of [false, true]) {
      const { page } = await start({ reduced, label: reduced ? 'mouvement réduit' : 'mouvement normal' });
      await addTimer(page);
      const w = widget(page);
      await w.getByLabel('Autre durée').fill('0:03');
      await primary(w).click();
      await tick(page, 4_000);
      assert.equal(await status(w), 'done');
      assert.equal(await animationOf(page), reduced ? 'none' : 'timer-pulse');
    }
  });

  await step('accessibilité : régions nommées, minuteur annoncé, bouton principal stable', async () => {
    const { page } = await start();
    await addTimer(page);
    const w = widget(page);
    assert.equal(await w.locator('[data-testid="timer-time"]').getAttribute('role'), 'timer');
    assert.equal(await w.locator('[data-testid="timer-time"]').getAttribute('aria-label'), 'Temps restant');
    // Navigation clavier : Tab atteint les préréglages, le champ, puis le bouton ; Entrée/Espace activent.
    await w.getByRole('button', { name: '10 min' }).focus();
    await page.keyboard.press('Space');
    assert.equal(await timeText(w), '10:00');
    await primary(w).focus();
    await page.keyboard.press('Enter');
    await tick(page, 0);
    assert.equal(await status(w), 'running');
    assert.ok(await primary(w).evaluate((el) => el === document.activeElement), 'focus conservé après Entrée');
    await page.keyboard.press('Space');
    assert.equal(await status(w), 'paused');
    assert.ok(await primary(w).evaluate((el) => el === document.activeElement), 'focus conservé après Espace');
  });
});
