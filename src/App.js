// Composant racine : en-tête (Toolbar), bandeaux d'état du stockage, grille (Dashboard) et
// panneaux (catalogue, réglages, renommage, aide, préférences, sauvegarde : chargés à la demande,
// voir core/lazyPanels.js), notifications et raccourcis clavier globaux.

import { html } from './lib/vendor.js';
import { LazyBackup, LazyCatalog, LazyHelp, LazyPreferences, LazyRename, LazySettings } from './core/lazyPanels.js';
import { StatusBanners } from './core/StatusBanners.js';
import { ToastHost } from './core/ToastHost.js';
import { Dashboard } from './core/dashboard/Dashboard.js';
import { Toolbar } from './core/dashboard/Toolbar.js';
import { useGlobalShortcuts } from './core/shortcuts/useGlobalShortcuts.js';

export function App() {
  // E, A, ? et Échap (voir core/shortcuts).
  useGlobalShortcuts();

  return html`
    <main class="app">
      <${StatusBanners} />
      <${Toolbar} />
      <${Dashboard} />
    </main>
    <${LazyCatalog} />
    <${LazySettings} />
    <${LazyRename} />
    <${LazyHelp} />
    <${LazyPreferences} />
    <${LazyBackup} />
    <${ToastHost} />
  `;
}
