// Widget Minuteur : compte à rebours calculé depuis une heure de fin, avec alarme sonore.

import { lazyComponent } from '../../ui/lazy.js';
import { defineWidget } from '../types.js';
import { TimerWidget } from './TimerWidget.js';
import { dataSchema, defaultData, defaultSettings, settingsSchema } from './schema.js';

/** @type {import('../types.js').WidgetDefinition<typeof defaultSettings, typeof defaultData>} */
export const definition = defineWidget({
  type: 'timer',
  name: 'Minuteur',
  description: 'Un compte à rebours précis, qui sonne à la fin et reste juste même si la page est fermée.',
  icon: 'hourglass',
  category: 'temps',
  defaultSize: { w: 3, h: 3 },
  minSize: { w: 2, h: 2 },
  settingsSchema,
  defaultSettings,
  dataSchema,
  defaultData,
  version: 1,
  Component: TimerWidget,
  SettingsPanel: lazyComponent(() => import('./TimerSettings.js'), (m) => m.TimerSettings), // chargé à l'ouverture des réglages
  styleUrl: new URL('./style.css', import.meta.url),
});
