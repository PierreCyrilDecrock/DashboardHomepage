// Le contrat de widget : ce que tout widget doit fournir, et la vérification de ce contrat.
//
// Le cœur de l'application (src/core) ne connaît aucun widget précis : il ne manipule que
// ces définitions, obtenues par le registre (registry.js). Un widget reçoit uniquement des
// props (WidgetProps) ; il n'importe ni le cœur, ni un autre widget, ni le stockage.

import { ICON_PATHS } from '../ui/iconData.js';

/** @typedef {'temps'|'organisation'|'liens'|'focus'} WidgetCategory */
/** @typedef {{ w: number, h: number }} WidgetSize */

/**
 * Props reçues par le composant d'un widget.
 * @template S, D
 * @typedef {Object} WidgetProps
 * @property {string} instanceId identifiant de l'instance (UUID)
 * @property {S} settings réglages, déjà validés par le settingsSchema
 * @property {D} data données, déjà validées par le dataSchema
 * @property {boolean} isEditing vrai en mode édition du dashboard
 * @property {WidgetSize} size taille actuelle, en cellules de grille
 * @property {(patch: Partial<S>) => void} updateSettings fusionne `patch` dans les réglages
 * @property {(updater: (current: D) => D) => void} updateData remplace les données par le résultat de `updater`
 */

/**
 * Props du panneau de réglages d'un widget.
 * @template S
 * @typedef {Object} WidgetSettingsProps
 * @property {S} settings
 * @property {(patch: Partial<S>) => void} onChange
 */

/**
 * Définition d'un widget : tout ce que le cœur doit savoir pour l'afficher, le régler,
 * le valider et le migrer.
 * @template S, D
 * @typedef {Object} WidgetDefinition
 * @property {string} type identifiant stable, en minuscules (/^[a-z][a-z0-9-]*$/) ; égal au nom du dossier
 * @property {string} name nom affiché (titre par défaut, catalogue)
 * @property {string} description phrase de présentation (catalogue)
 * @property {string} icon nom d'une icône de src/ui/icons.js
 * @property {WidgetCategory} category
 * @property {WidgetSize} defaultSize taille à l'ajout, en cellules de grille
 * @property {WidgetSize} minSize taille minimale, en cellules de grille
 * @property {{ safeParse: (value: unknown) => any }} settingsSchema schéma Zod des réglages
 * @property {S} defaultSettings
 * @property {{ safeParse: (value: unknown) => any }} dataSchema schéma Zod des données
 * @property {D} defaultData
 * @property {number} version version du format (réglages et données), entier ≥ 1
 * @property {(old: unknown, fromVersion: number) => { settings: S, data: D }} [migrate]
 *   convertit { settings, data } enregistrés avec la version `fromVersion` vers la version courante
 * @property {(props: WidgetProps<S, D>) => any} Component composant Preact
 * @property {(props: WidgetSettingsProps<S>) => any} [SettingsPanel] formulaire de réglages
 * @property {(data: D) => D} [cloneData] copie profonde pour la duplication (sinon structuredClone)
 * @property {string | URL} [styleUrl] feuille de style du widget, chargée une seule fois par le cadre
 */

export const WIDGET_CATEGORIES = /** @type {const} */ (['temps', 'organisation', 'liens', 'focus']);

/** Forme d'un identifiant de type de widget. */
export const WIDGET_TYPE_PATTERN = /^[a-z][a-z0-9-]*$/;

/** @param {unknown} v */
const isPositiveInt = (v) => typeof v === 'number' && Number.isInteger(v) && v >= 1;

/** @param {unknown} v */
const isNonEmptyString = (v) => typeof v === 'string' && v.trim() !== '';

/** @param {unknown} v */
const hasSafeParse = (v) => v !== null && typeof v === 'object' && typeof (/** @type {any} */ (v).safeParse) === 'function';

/**
 * Contrôle une définition et renvoie la liste de TOUS les problèmes (vide si elle est valide).
 * @param {unknown} definition
 * @returns {string[]}
 */
export function checkWidgetDefinition(definition) {
  if (definition === null || typeof definition !== 'object' || Array.isArray(definition)) {
    return ['la définition doit être un objet'];
  }
  const d = /** @type {Record<string, any>} */ (definition);
  /** @type {string[]} */
  const problems = [];

  // Champs de texte.
  if (!isNonEmptyString(d.type)) problems.push('« type » est obligatoire (texte non vide)');
  else if (!WIDGET_TYPE_PATTERN.test(d.type)) {
    problems.push(`« type » (${JSON.stringify(d.type)}) doit respecter /^[a-z][a-z0-9-]*$/ : minuscules, chiffres et tirets, en commençant par une lettre`);
  }
  if (!isNonEmptyString(d.name)) problems.push('« name » est obligatoire (texte non vide)');
  if (!isNonEmptyString(d.description)) problems.push('« description » est obligatoire (texte non vide)');
  if (!isNonEmptyString(d.icon)) problems.push('« icon » est obligatoire (nom d\'une icône de src/ui/icons.js)');
  else if (!Object.hasOwn(ICON_PATHS, d.icon)) problems.push(`« icon » : l'icône ${JSON.stringify(d.icon)} n'existe pas dans src/ui/icons.js`);
  if (d.category === undefined) problems.push(`« category » est obligatoire (${WIDGET_CATEGORIES.join(', ')})`);
  else if (!WIDGET_CATEGORIES.includes(d.category)) {
    problems.push(`« category » (${JSON.stringify(d.category)}) doit valoir ${WIDGET_CATEGORIES.map((c) => `'${c}'`).join(', ')}`);
  }

  // Tailles.
  /** @type {Record<string, boolean>} */
  const sizeOk = {};
  for (const field of ['defaultSize', 'minSize']) {
    const size = d[field];
    if (size === undefined) {
      problems.push(`« ${field} » est obligatoire ({ w, h })`);
      sizeOk[field] = false;
    } else if (size === null || typeof size !== 'object' || !isPositiveInt(size.w) || !isPositiveInt(size.h)) {
      problems.push(`« ${field} » doit être { w, h } avec des entiers ≥ 1`);
      sizeOk[field] = false;
    } else {
      sizeOk[field] = true;
    }
  }
  if (sizeOk.defaultSize && sizeOk.minSize && (d.minSize.w > d.defaultSize.w || d.minSize.h > d.defaultSize.h)) {
    problems.push('« minSize » ne peut pas être plus grand que « defaultSize »');
  }

  // Schémas et valeurs par défaut.
  for (const [schemaField, valueField] of /** @type {const} */ ([
    ['settingsSchema', 'defaultSettings'],
    ['dataSchema', 'defaultData'],
  ])) {
    const hasSchema = hasSafeParse(d[schemaField]);
    if (d[schemaField] === undefined) problems.push(`« ${schemaField} » est obligatoire (schéma Zod)`);
    else if (!hasSchema) problems.push(`« ${schemaField} » doit être un schéma Zod (avec une méthode safeParse)`);
    if (!(valueField in d) || d[valueField] === undefined) {
      problems.push(`« ${valueField} » est obligatoire`);
    } else if (hasSchema) {
      let result;
      try {
        result = d[schemaField].safeParse(d[valueField]);
      } catch (err) {
        problems.push(`« ${schemaField} » a planté sur « ${valueField} » : ${/** @type {Error} */ (err).message}`);
        continue;
      }
      if (!result || result.success !== true) {
        const issue = result?.error?.issues?.[0];
        const where = issue && issue.path?.length ? ` (${issue.path.map(String).join('.')} : ${issue.message})` : issue ? ` (${issue.message})` : '';
        problems.push(`« ${valueField} » ne passe pas « ${schemaField} »${where}`);
      }
    }
  }

  // Version, composants et fonctions facultatives.
  if (d.version === undefined) problems.push('« version » est obligatoire (entier ≥ 1)');
  else if (!isPositiveInt(d.version)) problems.push('« version » doit être un entier ≥ 1');
  if (d.Component === undefined) problems.push('« Component » est obligatoire (composant Preact)');
  else if (typeof d.Component !== 'function') problems.push('« Component » doit être une fonction (composant Preact)');
  for (const field of ['migrate', 'SettingsPanel', 'cloneData']) {
    if (d[field] !== undefined && typeof d[field] !== 'function') problems.push(`« ${field} » est présent mais n'est pas une fonction`);
  }
  if (d.styleUrl !== undefined && typeof d.styleUrl !== 'string' && !(d.styleUrl instanceof URL)) {
    problems.push('« styleUrl » doit être une adresse (texte ou URL)');
  }
  return problems;
}

/**
 * Contrôle la définition au chargement et la renvoie. Lance UNE erreur qui liste TOUS les
 * problèmes : c'est l'équivalent de la vérification de types d'un compilateur.
 * @template S, D
 * @param {WidgetDefinition<S, D>} definition
 * @returns {WidgetDefinition<S, D>}
 */
export function defineWidget(definition) {
  const problems = checkWidgetDefinition(definition);
  if (problems.length > 0) {
    const type = typeof (/** @type {any} */ (definition))?.type === 'string' ? ` « ${/** @type {any} */ (definition).type} »` : '';
    throw new Error(`Définition de widget${type} invalide (${problems.length} problème${problems.length > 1 ? 's' : ''}) :\n- ${problems.join('\n- ')}`);
  }
  return definition;
}
