// Logique pure du catalogue de widgets : recherche, regroupement par catégorie, comptage.

/** Catégories dans l'ordre d'affichage, avec leur libellé. */
export const CATEGORY_LABELS = /** @type {const} */ ({
  temps: 'Temps',
  organisation: 'Organisation',
  liens: 'Liens',
  focus: 'Focus',
});

/**
 * Minuscules sans accents, pour comparer sans se soucier des majuscules ni des accents.
 * @param {string} text
 */
export function normalize(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Définitions dont le nom ou la description contient la recherche (tous les mots doivent y figurer).
 * @template {{ name: string, description: string }} T
 * @param {T[]} definitions
 * @param {string} query
 * @returns {T[]}
 */
export function filterDefinitions(definitions, query) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return definitions;
  return definitions.filter((d) => {
    const haystack = normalize(`${d.name} ${d.description}`);
    return words.every((w) => haystack.includes(w));
  });
}

/**
 * Regroupe par catégorie, dans l'ordre d'affichage ; les catégories vides sont omises.
 * @template {{ category: string }} T
 * @param {T[]} definitions
 * @returns {Array<{ category: keyof typeof CATEGORY_LABELS, label: string, items: T[] }>}
 */
export function groupByCategory(definitions) {
  return /** @type {Array<keyof typeof CATEGORY_LABELS>} */ (Object.keys(CATEGORY_LABELS))
    .map((category) => ({ category, label: CATEGORY_LABELS[category], items: definitions.filter((d) => d.category === category) }))
    .filter((group) => group.items.length > 0);
}

/**
 * Nombre d'exemplaires de chaque type sur le dashboard (toutes pages confondues).
 * @param {import('../types.js').DashboardState} state
 * @returns {Record<string, number>}
 */
export function countByType(state) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const page of state.pages) for (const i of page.instances) counts[i.type] = (counts[i.type] ?? 0) + 1;
  return counts;
}

/**
 * « 2 sur le dashboard », ou « Pas encore ajouté ».
 * @param {number} count
 */
export function describeCount(count) {
  return count > 0 ? `${count} sur le dashboard` : 'Pas encore ajouté';
}
