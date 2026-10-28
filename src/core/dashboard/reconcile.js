// Réconciliation : met les instances enregistrées en accord avec les définitions chargées.
// S'exécute après hydrate et après loadRegistry, avant le premier rendu.
//
//  - type inconnu            → rien n'est modifié (le cadre affichera « Widget indisponible ») ;
//  - version plus ancienne   → migrate de la définition, résultat validé par les schémas ;
//  - données invalides       → remplacées par defaultData (l'ancien texte est déjà dans
//                              dash:backup:<id>, copié par hydrate) ;
//  - données absentes        → initialisées avec defaultData (une clé par instance).
// En lecture seule, rien n'est modifié.

/**
 * @typedef {Object} ReconcileReport
 * @property {string[]} migrated instances migrées vers la version de leur définition
 * @property {string[]} reset instances dont les données invalides ont été remplacées par les valeurs par défaut
 * @property {string[]} initialized instances qui n'avaient aucune donnée
 * @property {Array<{ id: string, reason: string }>} failed migrations impossibles (l'instance reste telle quelle)
 */

/**
 * @param {{
 *   dashboardStore: ReturnType<typeof import('../store/dashboardStore.js').createDashboardStore>,
 *   dataStore: ReturnType<typeof import('../store/dataStore.js').createDataStore>,
 *   getDefinition: (type: string) => import('../../widgets/types.js').WidgetDefinition<any, any> | undefined,
 *   invalidInstanceIds?: string[],
 *   readOnly?: boolean,
 *   now?: () => number,
 * }} options
 * @returns {ReconcileReport}
 */
export function reconcile({ dashboardStore, dataStore, getDefinition, invalidInstanceIds = [], readOnly = false, now = () => Date.now() }) {
  /** @type {ReconcileReport} */
  const report = { migrated: [], reset: [], initialized: [], failed: [] };
  if (readOnly) return report;
  const invalid = new Set(invalidInstanceIds);

  for (const page of dashboardStore.getState().pages) {
    for (const instance of page.instances) {
      const definition = getDefinition(instance.type);
      if (definition === undefined) continue; // type inconnu : on ne touche à rien

      const entry = dataStore.getData(instance.id);
      const dataIsInvalid = invalid.has(instance.id);

      if (instance.version < definition.version && typeof definition.migrate === 'function') {
        const outcome = tryMigrate(definition, instance, dataIsInvalid ? undefined : entry?.data);
        if (outcome.ok) {
          dashboardStore.migrateInstance(instance.id, { settings: outcome.settings, version: definition.version });
          dataStore.putEntry(instance.id, { version: definition.version, data: outcome.data, updatedAt: now() });
          report.migrated.push(instance.id);
          continue;
        }
        report.failed.push({ id: instance.id, reason: outcome.reason });
        console.error(`Migration impossible pour l'instance ${instance.id} (${instance.type}) : ${outcome.reason}`);
      }

      if (dataIsInvalid || entry === undefined) {
        dataStore.putEntry(instance.id, { version: definition.version, data: structuredClone(definition.defaultData), updatedAt: now() });
        (dataIsInvalid ? report.reset : report.initialized).push(instance.id);
      }
    }
  }
  return report;
}

/**
 * @param {import('../../widgets/types.js').WidgetDefinition<any, any>} definition
 * @param {import('../types.js').WidgetInstance} instance
 * @param {unknown} data
 * @returns {{ ok: true, settings: unknown, data: unknown } | { ok: false, reason: string }}
 */
function tryMigrate(definition, instance, data) {
  let result;
  try {
    result = /** @type {Function} */ (definition.migrate)({ settings: instance.settings, data }, instance.version);
  } catch (err) {
    return { ok: false, reason: `migrate a échoué : ${/** @type {Error} */ (err)?.message ?? String(err)}` };
  }
  if (result === null || typeof result !== 'object' || !('settings' in result) || !('data' in result)) {
    return { ok: false, reason: 'migrate doit renvoyer { settings, data }' };
  }
  const settings = definition.settingsSchema.safeParse(result.settings);
  if (!settings.success) return { ok: false, reason: `réglages migrés invalides : ${settings.error?.issues?.[0]?.message ?? '?'}` };
  const parsedData = definition.dataSchema.safeParse(result.data);
  if (!parsedData.success) return { ok: false, reason: `données migrées invalides : ${parsedData.error?.issues?.[0]?.message ?? '?'}` };
  return { ok: true, settings: settings.data, data: parsedData.data };
}
