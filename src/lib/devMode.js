// Mode développement : l'adresse avec ?dev=1 expose window.__dash et les boutons de test.

/**
 * @param {string} [search] partie « ?… » de l'adresse (celle de la page par défaut)
 * @returns {boolean}
 */
export function isDevMode(search = globalThis.location?.search ?? '') {
  return new URLSearchParams(search).get('dev') === '1';
}

/**
 * Mode développement : compte les rendus d'un cadre de widget dans `window.__dash.renders`
 * (identifiant d'instance → nombre de rendus). Sans `window.__dash` (mode normal), ne fait rien.
 * Sert au test « saisir dans un widget ne refait pas le rendu des autres ».
 * @param {string} instanceId
 * @param {any} [env]
 */
export function countRender(instanceId, env = globalThis) {
  const dash = env?.__dash;
  if (!dash || typeof dash.renders !== 'object' || dash.renders === null) return;
  dash.renders[instanceId] = (dash.renders[instanceId] ?? 0) + 1;
}
