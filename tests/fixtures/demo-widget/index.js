// Widget de démonstration : un libellé et un compteur. Il sert à éprouver le contrat de
// widget (phase 2) ; il est supprimé en phase 10, quand les vrais widgets existent.

import { defineWidget } from '../types.js';
import { DemoSettings } from './DemoSettings.js';
import { DemoWidget } from './DemoWidget.js';
import { dataSchema, defaultData, defaultSettings, settingsSchema } from './schema.js';

/** @type {import('../types.js').WidgetDefinition<{ label: string }, { count: number }>} */
export const definition = defineWidget({
  type: 'demo',
  name: 'Démo',
  description: 'Un compteur pour tester le cadre des widgets.',
  icon: 'layout-grid',
  category: 'focus',
  defaultSize: { w: 3, h: 4 },
  minSize: { w: 2, h: 2 },
  settingsSchema,
  defaultSettings,
  dataSchema,
  defaultData,
  version: 1,
  Component: DemoWidget,
  SettingsPanel: DemoSettings,
  styleUrl: new URL('./style.css', import.meta.url),
});
