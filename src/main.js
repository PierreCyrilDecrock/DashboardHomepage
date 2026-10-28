// Point d'entrée : choisit l'adaptateur de stockage, charge l'état (hydratation),
// branche la persistance et le thème, puis affiche l'application.
// Phase 10 : sauvegarde (export, import, réinitialisation) et barrière d'erreur de la page.
// Phase 2 : le registre des widgets est chargé en parallèle, puis les instances
// enregistrées sont mises en accord avec leurs définitions (reconcile).

import { App } from './App.js';
import { configureBackup } from './core/backup/backupContext.js';
import { PageErrorBoundary } from './core/PageErrorBoundary.js';
import { createLocalStorageAdapter, isLocalStorageUsable } from './core/storage/localStorageAdapter.js';
import { createMemoryAdapter } from './core/storage/memoryAdapter.js';
import { configureInstanceBackup } from './core/dashboard/instanceBackup.js';
import { dashboardActions } from './core/dashboard/actions.js';
import { prefetchLazyPanels } from './core/lazyPanels.js';
import { reconcile } from './core/dashboard/reconcile.js';
import { hydrate } from './core/storage/hydrate.js';
import { startPersistence } from './core/storage/persistence.js';
import { writeThemeMirror } from './core/storage/themeMirror.js';
import { dashboardStore } from './core/store/dashboardStore.js';
import { dataStore } from './core/store/dataStore.js';
import { statusStore } from './core/store/statusStore.js';
import { uiStore } from './core/store/uiStore.js';
import { startThemeSync } from './core/theme.js';
import { isDevMode } from './lib/devMode.js';
import { html, render } from './lib/vendor.js';
import { getDefinition, listDefinitions, loadRegistry, registryErrors } from './widgets/registry.js';

async function start() {
  const root = document.getElementById('app');
  if (!root) return;
  render(html`<p class="loading" role="status">Chargement…</p>`, root);

  // 1. Adaptateur : localStorage s'il fonctionne, sinon la mémoire (rien ne sera conservé).
  const usable = isLocalStorageUsable();
  const adapter = usable ? createLocalStorageAdapter() : createMemoryAdapter();
  if (!usable) statusStore.setState({ storageUnavailable: true });

  // 2. Chargement complet en mémoire (état, données et registre des widgets) avant d'afficher quoi que ce soit.
  const [loaded] = await Promise.all([hydrate(adapter), loadRegistry()]);
  for (const warning of loaded.warnings) console.warn(warning);
  dashboardStore.replaceAll(loaded.state);
  dataStore.replaceAll(loaded.data);
  statusStore.setState({ readOnly: loaded.readOnly });

  // 3. Persistance (après le chargement : charger n'écrit rien), copies de sauvegarde des
  //    instances, réconciliation (ses changements sont écrits comme les autres) et thème.
  const persistence = startPersistence({ adapter, dashboardStore, dataStore, statusStore });
  configureInstanceBackup(adapter, () => statusStore.getState().readOnly);
  if (loaded.migrated) persistence.markStateDirty();
  const reconciled = reconcile({
    dashboardStore,
    dataStore,
    getDefinition,
    invalidInstanceIds: loaded.invalidInstanceIds,
    readOnly: loaded.readOnly,
  });
  // Des données invalides remplacées au démarrage : un bandeau fermable l'explique (copies dans dash:backup:*).
  if (loaded.stateWasReset || reconciled.reset.length > 0) {
    statusStore.setState({ resetNotice: { state: loaded.stateWasReset, instanceIds: reconciled.reset } });
  }
  configureBackup({
    adapter,
    dashboardStore,
    dataStore,
    flush: () => persistence.flush(),
    reconcile: () => reconcile({ dashboardStore, dataStore, getDefinition }),
    isReadOnly: () => statusStore.getState().readOnly,
  });
  startThemeSync(dashboardStore, {
    // Jamais d'écriture en lecture seule, pas même le miroir du thème.
    writeMirror: (theme) => {
      if (!statusStore.getState().readOnly) writeThemeMirror(theme);
    },
  });

  // 4. Aide de développement : ?dev=1 expose les stores dans la console.
  if (isDevMode()) {
    /** @type {any} */ (window).__dash = {
      dashboard: dashboardStore,
      data: dataStore,
      status: statusStore,
      ui: uiStore,
      actions: dashboardActions,
      registry: { listDefinitions, registryErrors },
      reconciled,
      renders: {},
    };
  }

  render(html`<${PageErrorBoundary}><${App} /><//>`, root);
  prefetchLazyPanels(); // les panneaux sont chargés à la demande, et d'avance quand le navigateur est inactif
}

start().catch((err) => {
  console.error('Démarrage impossible :', err);
  const root = document.getElementById('app');
  if (root) root.textContent = 'Le dashboard n\'a pas pu démarrer. Recharge la page.';
});
