// Types du modèle de données (JSDoc) et constantes de version.
// Ce fichier ne contient aucun code exécutable à part les constantes.

/**
 * État global du dashboard : la disposition, légère, qui change souvent.
 * Les données des widgets sont stockées à part (voir StoredData).
 * @typedef {Object} DashboardState
 * @property {number} version version du format global
 * @property {'light'|'dark'|'system'} theme
 * @property {Preferences} preferences préférences de l'utilisateur (version 2 du format)
 * @property {string} activePageId
 * @property {Page[]} pages le MVP n'expose qu'une page
 */

/**
 * @typedef {Object} Preferences
 * @property {boolean} singleKeyShortcuts les raccourcis à une touche (E, A, ?) sont actifs
 */

/**
 * @typedef {Object} Page
 * @property {string} id
 * @property {string} name
 * @property {WidgetInstance[]} instances
 */

/**
 * Un exemplaire d'un widget placé sur le dashboard.
 * @typedef {Object} WidgetInstance
 * @property {string} id UUID, clé des données de l'instance
 * @property {string} type référence au registre
 * @property {string} [title] titre personnalisé (permet deux Todo nommés)
 * @property {{x:number,y:number,w:number,h:number}} layout en colonnes et lignes de grille
 * @property {unknown} settings validé par le settingsSchema du type
 * @property {number} version version du format de l'instance
 */

/**
 * Enveloppe des données d'une instance, stockée sous dash:data:<instanceId>.
 * @template D
 * @typedef {Object} StoredData
 * @property {number} version version du format de données du widget
 * @property {D} data
 * @property {number} updatedAt millisecondes depuis 1970
 */

/** @typedef {'light'|'dark'|'system'} Theme */

/** Version du format de DashboardState écrit par ce code. */
export const CURRENT_STATE_VERSION = 2;

/** Valeurs possibles du thème. */
export const THEMES = /** @type {const} */ (['light', 'dark', 'system']);
