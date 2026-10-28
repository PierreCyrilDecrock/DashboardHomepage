// Schémas du widget Heure : des réglages, pas de données propres.

import { z } from '../../lib/vendor.js';
import { isValidTimeZone } from './clockLogic.js';

export const MAX_SECONDARY_ZONES = 4;
export const MAX_NAME_LENGTH = 40;

/** Un fuseau secondaire : identifiant IANA et libellé (vide : la ville est déduite du fuseau). */
export const secondaryZoneSchema = z.object({
  timeZone: z.string().refine(isValidTimeZone, { message: 'Fuseau horaire inconnu.' }),
  label: z.string().max(MAX_NAME_LENGTH),
});

export const settingsSchema = z.object({
  timeFormat: z.enum(['24h', '12h']),
  showSeconds: z.boolean(),
  showDate: z.boolean(),
  showGreeting: z.boolean(),
  userName: z.string().max(MAX_NAME_LENGTH),
  secondaryZones: z.array(secondaryZoneSchema).max(MAX_SECONDARY_ZONES),
});

/** Le widget n'a pas de données propres. */
export const dataSchema = z.object({});

export const defaultSettings = {
  timeFormat: /** @type {'24h' | '12h'} */ ('24h'),
  showSeconds: true,
  showDate: true,
  showGreeting: false,
  userName: '',
  secondaryZones: /** @type {{ timeZone: string, label: string }[]} */ ([]),
};

export const defaultData = {};
