// Le service d'alarme : tout ce que la minuterie demande à la plateforme (son, notification,
// planification). Le hook et le widget n'appellent QUE cette interface ; l'implémentation web est dans
// webAlarmService.js, et l'extension navigateur la remplacera en phase 12 avec setAlarmService.

import { createWebAlarmService } from './webAlarmService.js';

/** @typedef {'granted' | 'denied' | 'default' | 'unsupported'} PermissionState */

/**
 * @typedef {Object} AlarmService
 * @property {() => void} primeAudio
 *   Crée ou reprend le contexte audio. À appeler depuis un clic de l'utilisateur : avant, les navigateurs bloquent le son.
 * @property {(key: string) => Promise<boolean>} playAlarm
 *   Joue le son d'alarme. `key` identifie CETTE fin (par exemple « instance:endsAt ») : avec deux onglets
 *   ouverts sur la même origine, un seul joue. Résultat : le son a-t-il été joué ici ?
 * @property {() => Promise<PermissionState>} requestPermission
 *   Demande la permission d'afficher des notifications. UNIQUEMENT depuis un clic explicite, jamais automatiquement.
 * @property {() => PermissionState} getPermissionState
 * @property {(title: string, body: string, key: string) => Promise<boolean>} notify
 *   Affiche une notification (rien si la permission n'est pas accordée), dédupliquée comme l'alarme.
 * @property {(key: string, endsAt: number, label: string) => void} scheduleCompletion
 *   Prévient la plateforme qu'une fin aura lieu à `endsAt` (inutile sur le web, où la page est ouverte).
 * @property {(key: string) => void} cancelCompletion
 */

/** @type {AlarmService | null} */
let current = null;

/**
 * Le service en vigueur : celui du web tant qu'aucun autre n'a été installé.
 * @returns {AlarmService}
 */
export function getAlarmService() {
  if (current === null) current = createWebAlarmService();
  return current;
}

/**
 * Installe une autre implémentation (l'extension, ou une doublure de test). `null` revient au service web.
 * @param {AlarmService | null} implementation
 */
export function setAlarmService(implementation) {
  current = implementation;
}
