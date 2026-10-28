// Widget Raccourcis : une grille de liens favoris (http et https uniquement).

import { lazyComponent } from '../../ui/lazy.js';
import { defineWidget } from '../types.js';
import { ShortcutsWidget } from './ShortcutsWidget.js';
import { dataSchema, defaultData, defaultSettings, settingsSchema } from './schema.js';

/** @type {import('../types.js').WidgetDefinition<typeof defaultSettings, typeof defaultData>} */
export const definition = defineWidget({
  type: 'shortcuts',
  name: 'Raccourcis',
  description: 'Une grille de liens vers vos sites favoris.',
  icon: 'link',
  category: 'liens',
  defaultSize: { w: 4, h: 3 },
  minSize: { w: 2, h: 2 },
  settingsSchema,
  defaultSettings,
  dataSchema,
  defaultData,
  version: 1,
  Component: ShortcutsWidget,
  SettingsPanel: lazyComponent(() => import('./ShortcutsSettings.js'), (m) => m.ShortcutsSettings), // chargé à l'ouverture des réglages
  styleUrl: new URL('./style.css', import.meta.url),
});
