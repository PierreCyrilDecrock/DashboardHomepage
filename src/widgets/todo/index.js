// Widget À faire : liste de tâches (ajout, modification, suppression avec annulation, réordonnancement).

import { lazyComponent } from '../../ui/lazy.js';
import { defineWidget } from '../types.js';
import { TodoWidget } from './TodoWidget.js';
import { dataSchema, defaultData, defaultSettings, settingsSchema } from './schema.js';

/** @type {import('../types.js').WidgetDefinition<typeof defaultSettings, typeof defaultData>} */
export const definition = defineWidget({
  type: 'todo',
  name: 'À faire',
  description: 'Une liste de tâches à cocher, à réordonner et à modifier.',
  icon: 'square-check',
  category: 'organisation',
  defaultSize: { w: 4, h: 4 },
  minSize: { w: 3, h: 3 },
  settingsSchema,
  defaultSettings,
  dataSchema,
  defaultData,
  version: 1,
  Component: TodoWidget,
  SettingsPanel: lazyComponent(() => import('./TodoSettings.js'), (m) => m.TodoSettings), // chargé à l'ouverture des réglages
  styleUrl: new URL('./style.css', import.meta.url),
});
