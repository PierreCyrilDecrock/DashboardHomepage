// Widget Heure : heure et date, salutation facultative, fuseaux secondaires.

import { lazyComponent } from '../../ui/lazy.js';
import { defineWidget } from '../types.js';
import { ClockWidget } from './ClockWidget.js';
import { dataSchema, defaultData, defaultSettings, settingsSchema } from './schema.js';

/** @type {import('../types.js').WidgetDefinition<typeof defaultSettings, typeof defaultData>} */
export const definition = defineWidget({
  type: 'clock',
  name: 'Heure',
  description: 'L\'heure et la date, avec la salutation et les fuseaux horaires de ton choix.',
  icon: 'clock',
  category: 'temps',
  defaultSize: { w: 3, h: 3 },
  minSize: { w: 2, h: 2 },
  settingsSchema,
  defaultSettings,
  dataSchema,
  defaultData,
  version: 1,
  Component: ClockWidget,
  SettingsPanel: lazyComponent(() => import('./ClockSettings.js'), (m) => m.ClockSettings), // chargé à l'ouverture des réglages
  styleUrl: new URL('./style.css', import.meta.url),
});
