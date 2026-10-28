// Widget Notes : bloc-notes à onglets dont la saisie n'est jamais perdue.

import { lazyComponent } from '../../ui/lazy.js';
import { defineWidget } from '../types.js';
import { NotesWidget } from './NotesWidget.js';
import { dataSchema, defaultData, defaultSettings, settingsSchema } from './schema.js';

/** @type {import('../types.js').WidgetDefinition<typeof defaultSettings, typeof defaultData>} */
export const definition = defineWidget({
  type: 'notes',
  name: 'Notes',
  description: 'Un bloc-notes à onglets, pour écrire librement.',
  icon: 'file-text',
  category: 'organisation',
  defaultSize: { w: 5, h: 4 },
  minSize: { w: 3, h: 3 },
  settingsSchema,
  defaultSettings,
  dataSchema,
  defaultData,
  version: 1,
  Component: NotesWidget,
  SettingsPanel: lazyComponent(() => import('./NotesSettings.js'), (m) => m.NotesSettings), // chargé à l'ouverture des réglages
  styleUrl: new URL('./style.css', import.meta.url),
});
