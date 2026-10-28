import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAlarmService, setAlarmService } from './alarmService.js';
import { LOCK_HOLD_MS, createWebAlarmService } from './webAlarmService.js';

/** Laisse passer les micro-tâches en attente. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

/** Un « navigateur » de test : verrous partagés, minuteurs manuels, contexte audio et notifications espions. */
function fakeBrowser({ locks = true, audio = true, permission = 'granted', requestResult = 'granted' } = {}) {
  const timers = [];
  const held = new Set();
  const log = { contexts: 0, beeps: 0, resumed: 0, notifications: [], lockRequests: [] };
  class FakeAudioContext {
    constructor() {
      log.contexts++;
      this.state = 'suspended';
      this.currentTime = 1;
      this.destination = {};
    }
    resume() {
      log.resumed++;
      this.state = 'running';
      return Promise.resolve();
    }
    createOscillator() {
      return { frequency: {}, connect() {}, start() { log.beeps++; }, stop() {} };
    }
    createGain() {
      return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {} };
    }
  }
  class FakeNotification {
    constructor(title, options) {
      log.notifications.push({ title, ...options });
    }
    static permission = permission;
    static requestPermission() {
      FakeNotification.permission = requestResult;
      return Promise.resolve(requestResult);
    }
  }
  const lockApi = {
    request(name, options, callback) {
      log.lockRequests.push(name);
      if (held.has(name)) return Promise.resolve(callback(null));
      held.add(name);
      return Promise.resolve(callback({ name })).finally(() => held.delete(name));
    },
  };
  const environment = {
    getAudioContextClass: () => (audio ? FakeAudioContext : undefined),
    getLocks: () => (locks ? lockApi : undefined),
    getNotificationClass: () => FakeNotification,
    setTimer: (callback) => timers.push(callback),
  };
  return {
    log,
    held,
    Notification: FakeNotification,
    environment,
    /** Un second onglet : mêmes verrous, son propre service et son propre contexte audio. */
    service: (overrides = {}) => createWebAlarmService({ ...environment, ...overrides }),
    /** Écoule le délai de conservation des verrous. */
    async releaseLocks() {
      while (timers.length) timers.shift()();
      await settle();
    },
  };
}

test('primeAudio : crée le contexte audio une seule fois et le reprend s\'il est suspendu', async () => {
  const b = fakeBrowser();
  const service = b.service();
  service.primeAudio();
  service.primeAudio();
  assert.equal(b.log.contexts, 1);
  assert.equal(b.log.resumed, 1, 'repris une fois, puis il tourne');
});

test('primeAudio : sans AudioContext, sans erreur', () => {
  const b = fakeBrowser({ audio: false });
  assert.doesNotThrow(() => b.service().primeAudio());
  assert.equal(b.log.contexts, 0);
});

test('playAlarm : joue trois bips', async () => {
  const b = fakeBrowser();
  const service = b.service();
  service.primeAudio();
  assert.equal(await service.playAlarm('a:1'), true);
  assert.equal(b.log.beeps, 3);
});

test('playAlarm : reprend un contexte suspendu avant de jouer', async () => {
  const b = fakeBrowser();
  const service = b.service();
  assert.equal(await service.playAlarm('a:1'), true, 'même sans primeAudio préalable');
  assert.equal(b.log.resumed, 1);
  assert.equal(b.log.beeps, 3);
});

test('playAlarm : le verrou porte le préfixe dash-alarm: et est demandé « si disponible »', async () => {
  const b = fakeBrowser();
  await b.service().playAlarm('inst:123');
  assert.deepEqual(b.log.lockRequests, ['dash-alarm:inst:123']);
});

test('playAlarm : une seconde demande pour la même fin, pendant que le verrou est tenu, ne joue rien', async () => {
  const b = fakeBrowser();
  const service = b.service();
  assert.equal(await service.playAlarm('a:1'), true);
  assert.equal(await service.playAlarm('a:1'), false);
  assert.equal(b.log.beeps, 3, 'un seul son');
  assert.ok(b.held.has('dash-alarm:a:1'), 'le verrou est encore tenu');
});

test('playAlarm : une autre clé joue ; la même clé rejoue une fois le verrou relâché (3 s)', async () => {
  const b = fakeBrowser();
  const service = b.service();
  await service.playAlarm('a:1');
  assert.equal(await service.playAlarm('b:1'), true, 'autre minuteur : clé distincte');
  assert.equal(b.log.beeps, 6);
  await b.releaseLocks();
  assert.equal(b.held.size, 0);
  assert.equal(await service.playAlarm('a:1'), true);
  assert.equal(b.log.beeps, 9);
  assert.equal(LOCK_HOLD_MS, 3000);
});

test('playAlarm : deux onglets, une seule alarme', async () => {
  const b = fakeBrowser();
  const tabA = b.service();
  const tabB = b.service();
  const [a, c] = await Promise.all([tabA.playAlarm('a:1'), tabB.playAlarm('a:1')]);
  assert.deepEqual([a, c].sort(), [false, true]);
  assert.equal(b.log.beeps, 3);
  assert.equal(b.log.contexts, 1, 'celui qui n\'a pas le verrou ne crée même pas de contexte audio');
});

test('playAlarm : sans API de verrous, le son est joué', async () => {
  const b = fakeBrowser({ locks: false });
  const service = b.service();
  assert.equal(await service.playAlarm('a:1'), true);
  assert.equal(b.log.beeps, 3);
});

test('playAlarm : verrous refusés par le navigateur (aperçu isolé) : le son est joué une fois', async () => {
  const b = fakeBrowser();
  const service = b.service({ getLocks: () => ({ request: () => Promise.reject(new DOMException('opaque origin', 'SecurityError')) }) });
  assert.equal(await service.playAlarm('a:1'), true);
  assert.equal(b.log.beeps, 3);
  const throwing = b.service({ getLocks: () => ({ request: () => { throw new Error('boom'); } }) });
  assert.equal(await throwing.playAlarm('a:2'), true);
  assert.equal(b.log.beeps, 6);
});

test('playAlarm : sans AudioContext, rend false sans lever d\'erreur', async () => {
  const b = fakeBrowser({ audio: false });
  assert.equal(await b.service().playAlarm('a:1'), false);
});

test('playAlarm : un contexte audio qui plante ne fait pas planter l\'alarme', async () => {
  const b = fakeBrowser();
  const service = b.service({
    getAudioContextClass: () => class {
      constructor() { throw new Error('refusé'); }
    },
  });
  assert.equal(await service.playAlarm('a:1'), false);
});

test('getPermissionState : reflète Notification.permission, « unsupported » sans Notification', () => {
  for (const permission of ['granted', 'denied', 'default']) {
    assert.equal(fakeBrowser({ permission }).service().getPermissionState(), permission);
  }
  const none = createWebAlarmService({ getNotificationClass: () => undefined });
  assert.equal(none.getPermissionState(), 'unsupported');
  const odd = fakeBrowser({ permission: 'bizarre' });
  assert.equal(odd.service().getPermissionState(), 'unsupported');
  const throwing = createWebAlarmService({ getNotificationClass: () => ({ get permission() { throw new Error('refusé'); } }) });
  assert.equal(throwing.getPermissionState(), 'unsupported');
});

test('requestPermission : renvoie la réponse du navigateur ; « unsupported » sans Notification', async () => {
  const granted = fakeBrowser({ permission: 'default', requestResult: 'granted' });
  assert.equal(await granted.service().requestPermission(), 'granted');
  assert.equal(granted.service().getPermissionState(), 'granted');
  const denied = fakeBrowser({ permission: 'default', requestResult: 'denied' });
  assert.equal(await denied.service().requestPermission(), 'denied');
  const dismissed = fakeBrowser({ permission: 'default', requestResult: 'default' });
  assert.equal(await dismissed.service().requestPermission(), 'default');
  assert.equal(await createWebAlarmService({ getNotificationClass: () => undefined }).requestPermission(), 'unsupported');
  const refusing = createWebAlarmService({ getNotificationClass: () => ({ permission: 'default', requestPermission: () => Promise.reject(new Error('bloqué')) }) });
  assert.equal(await refusing.requestPermission(), 'unsupported');
});

test('la permission n\'est JAMAIS demandée par le service lui-même (ni par notify, ni par playAlarm)', async () => {
  const b = fakeBrowser({ permission: 'default' });
  let asked = 0;
  b.Notification.requestPermission = () => {
    asked++;
    return Promise.resolve('granted');
  };
  const service = b.service();
  service.primeAudio();
  await service.playAlarm('a:1');
  await service.notify('Terminé', 'corps', 'a:1');
  service.scheduleCompletion('a', Date.now() + 1000, 'x');
  assert.equal(asked, 0);
});

test('notify : rien sans permission accordée', async () => {
  for (const permission of ['default', 'denied']) {
    const b = fakeBrowser({ permission });
    assert.equal(await b.service().notify('Titre', 'Corps', 'a:1'), false);
    assert.deepEqual(b.log.notifications, []);
  }
  const none = createWebAlarmService({ getNotificationClass: () => undefined });
  assert.equal(await none.notify('Titre', 'Corps', 'a:1'), false);
});

test('notify : affiche la notification (titre, corps, tag = clé) et dédoublonne entre onglets', async () => {
  const b = fakeBrowser();
  const tabA = b.service();
  const tabB = b.service();
  const [a, c] = await Promise.all([tabA.notify('Minuteur terminé', 'Thé', 'a:1'), tabB.notify('Minuteur terminé', 'Thé', 'a:1')]);
  assert.deepEqual([a, c].sort(), [false, true]);
  assert.deepEqual(b.log.notifications, [{ title: 'Minuteur terminé', body: 'Thé', tag: 'a:1' }]);
});

test('le son et la notification de la même fin ne se bloquent pas mutuellement', async () => {
  const b = fakeBrowser();
  const service = b.service();
  assert.equal(await service.playAlarm('a:1'), true);
  assert.equal(await service.notify('T', 'C', 'a:1'), true);
  assert.deepEqual(b.log.lockRequests, ['dash-alarm:a:1', 'dash-alarm:a:1:notify']);
});

test('scheduleCompletion et cancelCompletion ne font rien sur le web', () => {
  const b = fakeBrowser();
  const service = b.service();
  assert.equal(service.scheduleCompletion('a', Date.now() + 1000, 'Thé'), undefined);
  assert.equal(service.cancelCompletion('a'), undefined);
  assert.equal(b.log.contexts, 0);
  assert.deepEqual(b.log.notifications, []);
});

test('getAlarmService / setAlarmService : service web par défaut, remplaçable', () => {
  setAlarmService(null);
  const web = getAlarmService();
  assert.equal(typeof web.playAlarm, 'function');
  assert.equal(getAlarmService(), web, 'toujours le même objet');
  const fake = { name: 'extension' };
  setAlarmService(/** @type {any} */ (fake));
  assert.equal(getAlarmService(), fake);
  setAlarmService(null);
  assert.notEqual(getAlarmService(), fake);
  setAlarmService(null);
});
