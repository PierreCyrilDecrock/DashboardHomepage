// Schémas du widget de démonstration.

import { z } from '../../lib/vendor.js';

/** Réglage : un libellé affiché au-dessus du compteur. */
export const settingsSchema = z.object({
  label: z.string().max(60),
});

/** Données : le compteur. */
export const dataSchema = z.object({
  count: z.number().int(),
});

export const defaultSettings = { label: 'Compteur' };
export const defaultData = { count: 0 };
