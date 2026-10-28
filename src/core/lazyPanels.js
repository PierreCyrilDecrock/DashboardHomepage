// Panneaux et boîtes de dialogue chargés à la demande : catalogue, réglages, renommage, aide,
// préférences et sauvegarde ne pèsent pas sur le premier affichage. Chaque panneau est demandé
// la première fois qu'il doit s'ouvrir (déclencheur : un état du uiStore), puis reste monté ;
// il se ferme tout seul (il ne dessine rien quand son état est fermé).
//
// Pour que la première ouverture soit immédiate, `prefetchLazyPanels` les charge une fois la page
// affichée, pendant un moment d'inactivité.

import { html, useRef } from '../lib/vendor.js';
import { lazyComponent } from '../ui/lazy.js';
import { uiStore } from './store/uiStore.js';
import { useStore } from './store/useStore.js';

/**
 * @param {ReturnType<typeof lazyComponent<any>>} Lazy
 * @param {(state: import('./store/uiStore.js').UiState) => boolean} wanted
 */
function onDemand(Lazy, wanted) {
  return function OnDemand() {
    const needed = useStore(uiStore, wanted);
    const armed = useRef(false);
    if (needed) armed.current = true;
    return armed.current ? html`<${Lazy} />` : null;
  };
}

const catalog = lazyComponent(() => import('./catalog/WidgetCatalog.js'), (m) => m.WidgetCatalog);
const settings = lazyComponent(() => import('./settings/SettingsDrawer.js'), (m) => m.SettingsDrawer);
const rename = lazyComponent(() => import('./dashboard/RenameDialog.js'), (m) => m.RenameDialog);
const help = lazyComponent(() => import('./shortcuts/ShortcutsHelp.js'), (m) => m.ShortcutsHelp);
const preferences = lazyComponent(() => import('./shortcuts/ShortcutsHelp.js'), (m) => m.PreferencesDialog);
const backup = lazyComponent(() => import('./backup/BackupDialog.js'), (m) => m.BackupDialog);

export const LazyCatalog = onDemand(catalog, (s) => s.catalogOpen);
export const LazySettings = onDemand(settings, (s) => s.settingsFor !== null);
export const LazyRename = onDemand(rename, (s) => s.renameFor !== null);
export const LazyHelp = onDemand(help, (s) => s.dialog === 'help' || s.dialog === 'preferences');
export const LazyPreferences = onDemand(preferences, (s) => s.dialog === 'preferences' || s.dialog === 'help');
export const LazyBackup = onDemand(backup, (s) => s.dialog === 'export' || s.dialog === 'import' || s.dialog === 'reset');

/** Charge tous les panneaux pendant un moment d'inactivité (après le premier affichage). */
export function prefetchLazyPanels(env = globalThis) {
  const run = () => {
    for (const panel of [catalog, settings, rename, help, backup]) void panel.preload();
  };
  if (typeof env.requestIdleCallback === 'function') env.requestIdleCallback(run, { timeout: 4000 });
  else setTimeout(run, 2000);
}
