// Store de la disposition : DashboardState (pages, instances, positions, réglages, thème).
// Les données propres aux widgets sont dans dataStore.js, pas ici : déplacer un
// widget ne réécrit donc jamais ses notes.
//
// Chaque action ne remplace que ce qui change : une instance inchangée garde sa
// référence, ce qui permet aux sélecteurs fins de ne redessiner que le nécessaire.

import { createDefaultState } from '../storage/defaultState.js';
import { layoutSchema, preferencesSchema, themeSchema, widgetInstanceSchema } from '../storage/schemas.js';
import { createStore } from './createStore.js';

/** @typedef {import('../types.js').DashboardState} DashboardState */
/** @typedef {import('../types.js').WidgetInstance} WidgetInstance */

/** Page active (ou la première si l'identifiant n'existe plus). @param {DashboardState} state */
export const selectActivePage = (state) => state.pages.find((p) => p.id === state.activePageId) ?? state.pages[0];

/** Instances de la page active. @param {DashboardState} state */
export const selectInstances = (state) => selectActivePage(state).instances;

/**
 * Sélecteur d'une instance, quelle que soit sa page.
 * @param {string} id
 * @returns {(state: DashboardState) => WidgetInstance | undefined}
 */
export const selectInstance = (id) => (state) => {
  for (const page of state.pages) {
    const found = page.instances.find((i) => i.id === id);
    if (found) return found;
  }
  return undefined;
};

/**
 * Emplacement d'une instance : sa page, son rang dans la page et l'instance elle-même.
 * @param {DashboardState} state
 * @param {string} id
 * @returns {{ pageId: string, index: number, instance: WidgetInstance } | undefined}
 */
export function findInstance(state, id) {
  for (const page of state.pages) {
    const index = page.instances.findIndex((i) => i.id === id);
    if (index !== -1) return { pageId: page.id, index, instance: page.instances[index] };
  }
  return undefined;
}

/**
 * Applique `fn` à chaque instance de chaque page ; renvoie le patch d'état, ou null si rien ne change.
 * @param {DashboardState} state
 * @param {(instance: WidgetInstance) => WidgetInstance | null} fn  renvoie la même référence si rien ne change, null pour retirer
 * @returns {Partial<DashboardState> | null}
 */
function mapInstances(state, fn) {
  let changed = false;
  const pages = state.pages.map((page) => {
    let pageChanged = false;
    /** @type {WidgetInstance[]} */
    const instances = [];
    for (const instance of page.instances) {
      const next = fn(instance);
      if (next !== instance) pageChanged = true;
      if (next !== null) instances.push(next);
    }
    if (!pageChanged) return page;
    changed = true;
    return { ...page, instances };
  });
  return changed ? { pages } : null;
}

/**
 * Crée un store de disposition isolé (les tests en créent un par cas).
 * @param {DashboardState} [initialState]
 */
export function createDashboardStore(initialState = createDefaultState()) {
  const store = createStore(initialState);

  return {
    ...store,

    /**
     * Ajoute une instance à la fin de la page active.
     * @param {WidgetInstance} instance
     */
    addInstance(instance) {
      const check = widgetInstanceSchema.safeParse(instance);
      if (!check.success) throw new TypeError(`Instance invalide : ${check.error.issues[0]?.message ?? 'forme inattendue'}`);
      store.setState((state) => {
        if (state.pages.some((p) => p.instances.some((i) => i.id === instance.id))) {
          throw new Error(`Une instance porte déjà l'identifiant ${instance.id}`);
        }
        const index = Math.max(0, state.pages.findIndex((p) => p.id === state.activePageId));
        const pages = state.pages.map((p, i) => (i === index ? { ...p, instances: [...p.instances, instance] } : p));
        return { pages };
      });
    },

    /**
     * Insère une instance à un emplacement précis (duplication, annulation d'une suppression).
     * Si la page n'existe plus, la page active est utilisée ; l'index est borné à la liste.
     * @param {WidgetInstance} instance
     * @param {{ pageId?: string, index?: number }} [where]
     */
    insertInstance(instance, { pageId, index } = {}) {
      const check = widgetInstanceSchema.safeParse(instance);
      if (!check.success) throw new TypeError(`Instance invalide : ${check.error.issues[0]?.message ?? 'forme inattendue'}`);
      store.setState((state) => {
        if (state.pages.some((p) => p.instances.some((i) => i.id === instance.id))) {
          throw new Error(`Une instance porte déjà l'identifiant ${instance.id}`);
        }
        let target = state.pages.findIndex((p) => p.id === pageId);
        if (target === -1) target = Math.max(0, state.pages.findIndex((p) => p.id === state.activePageId));
        const pages = state.pages.map((p, i) => {
          if (i !== target) return p;
          const at = Math.min(Math.max(index ?? p.instances.length, 0), p.instances.length);
          return { ...p, instances: [...p.instances.slice(0, at), instance, ...p.instances.slice(at)] };
        });
        return { pages };
      });
    },

    /**
     * Remplace entièrement les réglages d'une instance (réinitialisation, réglages invalides).
     * @param {string} id
     * @param {unknown} settings
     */
    replaceInstanceSettings(id, settings) {
      store.setState((state) => mapInstances(state, (instance) => (instance.id === id ? { ...instance, settings } : instance)));
    },

    /** Retire l'instance (ses données sont retirées séparément, dans dataStore). @param {string} id */
    removeInstance(id) {
      store.setState((state) => mapInstances(state, (i) => (i.id === id ? null : i)));
    },

    /**
     * Met à jour les positions : `layouts` associe un identifiant d'instance à { x, y, w, h }.
     * Les instances déjà à cette position, et les entrées invalides, sont ignorées.
     * @param {Record<string, {x:number,y:number,w:number,h:number}>} layouts
     */
    updateLayouts(layouts) {
      store.setState((state) =>
        mapInstances(state, (instance) => {
          const l = layouts[instance.id];
          if (!l || !layoutSchema.safeParse(l).success) return instance;
          const cur = instance.layout;
          if (cur.x === l.x && cur.y === l.y && cur.w === l.w && cur.h === l.h) return instance;
          return { ...instance, layout: { ...cur, x: l.x, y: l.y, w: l.w, h: l.h } };
        }),
      );
    },

    /**
     * Fusionne `patch` dans les réglages de l'instance (la validation par le schéma du type
     * se fait dans le cadre du widget, phase 2).
     * @param {string} id
     * @param {Record<string, unknown>} patch
     */
    updateInstanceSettings(id, patch) {
      store.setState((state) =>
        mapInstances(state, (instance) => {
          if (instance.id !== id) return instance;
          const current = instance.settings !== null && typeof instance.settings === 'object' ? instance.settings : {};
          const merged = { ...current, ...patch };
          const same = Object.keys(merged).every((k) => Object.is(/** @type {any} */ (current)[k], merged[k]));
          return same ? instance : { ...instance, settings: merged };
        }),
      );
    },

    /**
     * Remplace les réglages ET la version de format d'une instance (migration au démarrage).
     * @param {string} id
     * @param {{ settings: unknown, version: number }} next
     */
    migrateInstance(id, { settings, version }) {
      if (!Number.isInteger(version) || version < 1) throw new TypeError(`Version invalide : ${version}`);
      store.setState((state) =>
        mapInstances(state, (instance) => (instance.id === id ? { ...instance, settings, version } : instance)),
      );
    },

    /** Titre personnalisé ; un titre vide revient au nom du type. @param {string} id @param {string} title */
    setInstanceTitle(id, title) {
      const clean = String(title ?? '').trim();
      store.setState((state) =>
        mapInstances(state, (instance) => {
          if (instance.id !== id) return instance;
          if (clean === '') {
            if (instance.title === undefined) return instance;
            const { title: _removed, ...rest } = instance;
            return rest;
          }
          return instance.title === clean ? instance : { ...instance, title: clean };
        }),
      );
    },

    /** @param {import('../types.js').Theme} theme */
    setTheme(theme) {
      if (!themeSchema.safeParse(theme).success) throw new TypeError(`Thème inconnu : ${theme}`);
      store.setState({ theme });
    },

    /**
     * Modifie les préférences (fusion). Une valeur invalide est refusée.
     * @param {Partial<import('../types.js').Preferences>} patch
     */
    setPreferences(patch) {
      store.setState((state) => {
        const next = { ...state.preferences, ...patch };
        if (!preferencesSchema.safeParse(next).success) throw new TypeError('Préférences invalides');
        const same = Object.keys(next).every((k) => Object.is(/** @type {any} */ (state.preferences)[k], /** @type {any} */ (next)[k]));
        return same ? null : { preferences: next };
      });
    },

    /** Remplace tout l'état (chargement, import). @param {DashboardState} state */
    replaceAll(state) {
      store.setState(state, true);
    },
  };
}

/** Le store de l'application. */
export const dashboardStore = createDashboardStore();
