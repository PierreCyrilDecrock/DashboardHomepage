// Registre des widgets : charge les dossiers listés dans manifest.js et les met à
// disposition par type. Le cœur n'importe jamais un widget directement, il passe ici.
//
// Un widget qui échoue au chargement est signalé (registryErrors) sans empêcher les autres.

import manifest from './manifest.js';
import { WIDGET_CATEGORIES, WIDGET_TYPE_PATTERN } from './types.js';

/** @typedef {import('./types.js').WidgetDefinition<any, any>} AnyDefinition */
/** @typedef {{ name: string, message: string }} RegistryError */

/** @type {Map<string, AnyDefinition>} */
let definitions = new Map();
/** @type {RegistryError[]} */
let errors = [];

/**
 * Chargeur par défaut : le module src/widgets/<nom>/index.js.
 * @param {string} name
 * @returns {Promise<any>}
 */
const defaultLoader = (name) => import('./' + name + '/index.js');

/**
 * Charge chaque dossier du manifeste. Une erreur dans un widget est notée dans
 * registryErrors ; les autres widgets se chargent normalement. Appeler de nouveau
 * recommence à zéro.
 * @param {(name: string) => Promise<any> | any} [loader]
 * @param {string[]} [names] dossiers à charger (le manifeste par défaut)
 * @returns {Promise<{ definitions: AnyDefinition[], errors: RegistryError[] }>}
 */
export async function loadRegistry(loader = defaultLoader, names = manifest) {
  /** @type {Map<string, AnyDefinition>} */
  const loaded = new Map();
  /** @type {RegistryError[]} */
  const failed = [];
  /** Dossiers déjà vus, pour signaler un doublon du manifeste. @type {Set<string>} */
  const seenNames = new Set();

  await Promise.all(
    names.map(async (name) => {
      if (seenNames.has(name)) {
        failed.push({ name, message: `Le dossier « ${name} » figure plusieurs fois dans manifest.js : type en double.` });
        return;
      }
      seenNames.add(name);
      if (!WIDGET_TYPE_PATTERN.test(name)) {
        failed.push({ name, message: `Nom de dossier invalide « ${name} » : il doit respecter /^[a-z][a-z0-9-]*$/.` });
        return;
      }
      try {
        const module = await loader(name);
        const definition = module?.definition;
        if (definition === undefined || definition === null || typeof definition !== 'object') {
          failed.push({ name, message: `Le module du widget « ${name} » n'exporte pas « definition ».` });
          return;
        }
        if (definition.type !== name) {
          failed.push({ name, message: `Le type du widget (${JSON.stringify(definition.type)}) doit être égal au nom de son dossier (« ${name} »).` });
          return;
        }
        loaded.set(name, definition);
      } catch (err) {
        failed.push({ name, message: `Le widget « ${name} » n'a pas pu être chargé : ${/** @type {Error} */ (err)?.message ?? String(err)}` });
      }
    }),
  );

  // L'ordre du manifeste, pas celui de fin des chargements.
  definitions = new Map(names.filter((n) => loaded.has(n)).map((n) => [n, /** @type {AnyDefinition} */ (loaded.get(n))]));
  errors = failed;
  for (const e of errors) console.error(e.message);
  return { definitions: [...definitions.values()], errors: [...errors] };
}

/** Widgets en échec au dernier chargement. @returns {RegistryError[]} */
export const registryErrors = () => [...errors];

/**
 * Définition d'un type, ou undefined s'il est inconnu.
 * @param {string} type
 * @returns {AnyDefinition | undefined}
 */
export const getDefinition = (type) => definitions.get(type);

/** Toutes les définitions, dans l'ordre du manifeste. @returns {AnyDefinition[]} */
export const listDefinitions = () => [...definitions.values()];

/**
 * Définitions regroupées par catégorie (toutes les catégories sont présentes, parfois vides).
 * @returns {Record<import('./types.js').WidgetCategory, AnyDefinition[]>}
 */
export function listByCategory() {
  const groups = /** @type {Record<import('./types.js').WidgetCategory, AnyDefinition[]>} */ (
    Object.fromEntries(WIDGET_CATEGORIES.map((c) => [c, []]))
  );
  for (const definition of definitions.values()) groups[definition.category]?.push(definition);
  return groups;
}

/** Vide le registre (tests). */
export function resetRegistry() {
  definitions = new Map();
  errors = [];
}
