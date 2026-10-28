// Logique pure de la grille (sans GridStack ni Preact) : conversions entre les instances
// du dashboardStore et les éléments de la grille, déplacements et redimensionnements au clavier.
// Unités : colonnes et lignes de la grille (12 colonnes).

/** Nombre de colonnes de la grille. */
export const GRID_COLUMNS = 12;

/** Taille minimale d'un widget dont le type est inconnu. */
export const UNKNOWN_MIN_SIZE = Object.freeze({ w: 2, h: 2 });

/** @typedef {{ x: number, y: number, w: number, h: number }} Rect */
/** @typedef {{ id: string, x: number, y: number, w: number, h: number, minW: number, minH: number }} GridItem */

/**
 * Éléments de la grille pour des instances, avec la taille minimale de leur définition
 * (2×2 si le type est inconnu). La taille enregistrée ne descend jamais sous le minimum
 * et reste dans les `cols` colonnes.
 * @param {import('../types.js').WidgetInstance[]} instances
 * @param {(type: string) => { minSize: { w: number, h: number } } | undefined} getDefinition
 * @param {number} [cols]
 * @returns {GridItem[]}
 */
export function toGridItems(instances, getDefinition, cols = GRID_COLUMNS) {
  return instances.map((instance) => {
    const min = getDefinition(instance.type)?.minSize ?? UNKNOWN_MIN_SIZE;
    const minW = Math.min(min.w, cols);
    const minH = min.h;
    const w = Math.min(Math.max(instance.layout.w, minW), cols);
    const h = Math.max(instance.layout.h, minH);
    const x = Math.min(Math.max(instance.layout.x, 0), cols - w);
    return { id: instance.id, x, y: Math.max(instance.layout.y, 0), w, h, minW, minH };
  });
}

/**
 * Convertit les nœuds de GridStack en table identifiant → position. Les nœuds sans
 * identifiant ou sans position entière sont ignorés.
 * @param {Array<{ id?: unknown, x?: unknown, y?: unknown, w?: unknown, h?: unknown }>} nodes
 * @returns {Record<string, Rect>}
 */
export function fromGridNodes(nodes) {
  /** @type {Record<string, Rect>} */
  const layout = {};
  for (const node of nodes) {
    const { id, x, y, w, h } = node;
    if (typeof id !== 'string' || id === '') continue;
    if (![x, y, w, h].every((n) => typeof n === 'number' && Number.isInteger(n))) continue;
    layout[id] = { x: /** @type {number} */ (x), y: /** @type {number} */ (y), w: /** @type {number} */ (w), h: /** @type {number} */ (h) };
  }
  return layout;
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

/**
 * Nouvelle position d'un widget déplacé de (dx, dy) cases, bornée à la grille
 * (0 ≤ x ≤ cols − w, y ≥ 0). `null` si l'instance n'existe pas dans la disposition.
 * @param {Record<string, Rect>} layout
 * @param {string} id
 * @param {number} dx
 * @param {number} dy
 * @param {number} [cols]
 * @returns {Rect | null}
 */
export function moveBy(layout, id, dx, dy, cols = GRID_COLUMNS) {
  const rect = Object.hasOwn(layout, id) ? layout[id] : undefined;
  if (!rect) return null;
  return { ...rect, x: clamp(rect.x + dx, 0, cols - rect.w), y: Math.max(0, rect.y + dy) };
}

/**
 * Nouvelle taille d'un widget redimensionné de (dw, dh) cases : jamais sous `minSize`,
 * et sans sortir de la grille (x + w ≤ cols). `null` si l'instance n'existe pas.
 * @param {Record<string, Rect>} layout
 * @param {string} id
 * @param {number} dw
 * @param {number} dh
 * @param {number} [cols]
 * @param {{ w: number, h: number }} [minSize]
 * @returns {Rect | null}
 */
export function resizeBy(layout, id, dw, dh, cols = GRID_COLUMNS, minSize = UNKNOWN_MIN_SIZE) {
  const rect = Object.hasOwn(layout, id) ? layout[id] : undefined;
  if (!rect) return null;
  return {
    ...rect,
    w: clamp(rect.w + dw, Math.min(minSize.w, cols - rect.x), cols - rect.x),
    h: Math.max(minSize.h, rect.h + dh),
  };
}
