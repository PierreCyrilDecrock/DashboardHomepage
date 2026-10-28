// Implémentation web du service d'alarme : AudioContext, verrous Web Locks, Notification.
//
// Seul fichier (avec favicon.js) à toucher ces API de plateforme. Tout est lu au moment de l'appel et
// protégé : un navigateur ou un aperçu qui refuse l'audio, les verrous ou les notifications ne fait
// jamais planter la minuterie ; l'alarme est alors simplement muette ou affichée autrement.

import { playBeeps } from '../alarmSound.js';

/** Durée pendant laquelle un onglet garde le verrou d'une alarme : les autres onglets ne jouent pas. */
export const LOCK_HOLD_MS = 3000;
const LOCK_PREFIX = 'dash-alarm:';

/**
 * Accès aux API du navigateur, lues à chaque appel (les doublures des tests passent ici).
 * @typedef {Object} AlarmEnvironment
 * @property {() => (new () => any) | undefined} getAudioContextClass
 * @property {() => { request?: (...args: any[]) => Promise<any> } | undefined} getLocks
 * @property {() => any} getNotificationClass
 * @property {(callback: () => void, ms: number) => unknown} [setTimer]
 */

/** @type {AlarmEnvironment} */
const browserEnvironment = {
  getAudioContextClass: () => /** @type {any} */ (globalThis).AudioContext ?? /** @type {any} */ (globalThis).webkitAudioContext,
  getLocks: () => {
    try {
      return /** @type {any} */ (globalThis).navigator?.locks;
    } catch {
      return undefined;
    }
  },
  getNotificationClass: () => {
    try {
      return /** @type {any} */ (globalThis).Notification;
    } catch {
      return undefined;
    }
  },
};

/**
 * @param {Partial<AlarmEnvironment>} [overrides] doublures pour les tests
 * @returns {import('./alarmService.js').AlarmService}
 */
export function createWebAlarmService(overrides = {}) {
  const env = { ...browserEnvironment, ...overrides };
  const setTimer = env.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
  /** @type {any} */
  let audioContext = null;

  /** Le contexte audio, créé à la première demande ; null si le navigateur n'en a pas ou le refuse. */
  const getContext = () => {
    if (audioContext) return audioContext;
    try {
      const Context = env.getAudioContextClass();
      if (typeof Context !== 'function') return null;
      audioContext = new Context();
    } catch {
      audioContext = null;
    }
    return audioContext;
  };

  /**
   * Exécute `action` si ce navigateur obtient le verrou `name` (et le garde LOCK_HOLD_MS). Sans API de
   * verrous, ou si elle est refusée (aperçu isolé), on exécute l'action : mieux vaut sonner deux fois que jamais.
   * @param {string} name
   * @param {() => Promise<boolean> | boolean} action
   * @returns {Promise<boolean>}
   */
  const withLock = (name, action) => {
    const safe = async () => {
      try {
        return Boolean(await action());
      } catch {
        return false;
      }
    };
    const locks = env.getLocks();
    if (!locks || typeof locks.request !== 'function') return safe();
    return new Promise((resolve) => {
      let entered = false;
      const onLock = async (/** @type {unknown} */ lock) => {
        entered = true;
        if (!lock) {
          resolve(false);
          return;
        }
        resolve(await safe());
        await new Promise((release) => setTimer(() => release(undefined), LOCK_HOLD_MS));
      };
      try {
        Promise.resolve(locks.request(LOCK_PREFIX + name, { ifAvailable: true }, onLock)).catch(async () => {
          if (!entered) resolve(await safe());
        });
      } catch {
        safe().then(resolve);
      }
    });
  };

  const getNotification = () => {
    const Notification = env.getNotificationClass();
    return typeof Notification === 'function' ? Notification : null;
  };

  return {
    primeAudio() {
      const context = getContext();
      try {
        if (context && context.state === 'suspended') Promise.resolve(context.resume()).catch(() => {});
      } catch {
        /* le navigateur refuse : l'alarme sera muette, la minuterie fonctionne quand même */
      }
    },

    playAlarm(key) {
      return withLock(key, async () => {
        const context = getContext();
        if (!context) return false;
        if (context.state === 'suspended') await Promise.resolve(context.resume()).catch(() => {});
        playBeeps(context);
        return true;
      });
    },

    async requestPermission() {
      const Notification = getNotification();
      if (!Notification) return 'unsupported';
      try {
        const result = await Notification.requestPermission();
        return result === 'granted' || result === 'denied' ? result : Notification.permission === 'granted' ? 'granted' : Notification.permission === 'denied' ? 'denied' : 'default';
      } catch {
        return 'unsupported';
      }
    },

    getPermissionState() {
      const Notification = getNotification();
      if (!Notification) return 'unsupported';
      try {
        const permission = Notification.permission;
        return permission === 'granted' || permission === 'denied' || permission === 'default' ? permission : 'unsupported';
      } catch {
        return 'unsupported';
      }
    },

    notify(title, body, key) {
      const Notification = getNotification();
      if (!Notification || this.getPermissionState() !== 'granted') return Promise.resolve(false);
      // Verrou distinct de celui du son (même mécanisme) : sinon le son empêcherait la notification.
      return withLock(`${key}:notify`, () => {
        new Notification(title, { body, tag: key });
        return true;
      });
    },

    scheduleCompletion() {
      /* La page est ouverte : le minuteur de la page suffit. L'extension s'en servira (phase 12). */
    },

    cancelCompletion() {
      /* Rien à annuler sur le web. */
    },
  };
}
