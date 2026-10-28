// Logique pure du cadre de widget (sans Preact) : validation des réglages et des données
// d'une instance avec les schémas de son type, et repli sur les valeurs par défaut.

/**
 * @template T
 * @typedef {Object} Resolved
 * @property {T} value valeur à donner au widget (validée, ou valeur par défaut)
 * @property {boolean} valid faux si la valeur enregistrée a dû être écartée
 * @property {string} [reason] première erreur du schéma
 */

/**
 * Valide `raw` avec le schéma ; retombe sur une copie de `fallback` si la validation échoue.
 * `raw === undefined` (rien d'enregistré) n'est pas une erreur : on prend la valeur par défaut.
 * @template T
 * @param {{ safeParse: (v: unknown) => any }} schema
 * @param {unknown} raw
 * @param {T} fallback
 * @returns {Resolved<T>}
 */
export function resolveValue(schema, raw, fallback) {
  if (raw === undefined) return { value: structuredClone(fallback), valid: true };
  const result = schema.safeParse(raw);
  if (result.success) return { value: result.data, valid: true };
  const issue = result.error?.issues?.[0];
  const where = issue?.path?.length ? `${issue.path.map(String).join('.')} : ` : '';
  return { value: structuredClone(fallback), valid: false, reason: `${where}${issue?.message ?? 'données invalides'}` };
}

/**
 * Prépare le nouveau contenu des données après `updater`. Renvoie `null` si rien ne change
 * ou si le résultat ne passe pas le schéma (le widget ne peut pas écrire de données invalides).
 * @template D
 * @param {{ safeParse: (v: unknown) => any }} schema
 * @param {D} current données actuelles, déjà validées
 * @param {(current: D) => D} updater
 * @returns {{ ok: true, data: D } | { ok: false, reason: string } | null}
 */
export function applyDataUpdate(schema, current, updater) {
  const next = updater(current);
  if (Object.is(next, current)) return null;
  const result = schema.safeParse(next);
  if (result.success) return { ok: true, data: result.data };
  const issue = result.error?.issues?.[0];
  return { ok: false, reason: `${issue?.path?.length ? issue.path.map(String).join('.') + ' : ' : ''}${issue?.message ?? 'données invalides'}` };
}
