// Schémas du widget Minuteur : quatre réglages, et une minuterie comme donnée.

import { z } from '../../lib/vendor.js';
import { DEFAULT_DURATION_MS } from '../../lib/countdown.js';
import { countdownSchema } from '../../lib/countdownSchema.js';
import { DEFAULT_PRESETS, MAX_LABEL_LENGTH, MAX_PRESETS, MAX_PRESET_MINUTES, MIN_PRESET_MINUTES } from './timerLogic.js';

export const settingsSchema = z.object({
  presetsMinutes: z.array(z.number().int().min(MIN_PRESET_MINUTES).max(MAX_PRESET_MINUTES)).min(1).max(MAX_PRESETS),
  sound: z.boolean(),
  notify: z.boolean(),
  label: z.string().max(MAX_LABEL_LENGTH),
});

/** Les champs inconnus sont conservés (évolutions futures du format). */
export const dataSchema = z.looseObject({
  countdown: countdownSchema,
});

export const defaultSettings = { presetsMinutes: [...DEFAULT_PRESETS], sound: true, notify: false, label: '' };

/** @type {{ countdown: import('../../lib/countdown.js').CountdownState }} */
export const defaultData = { countdown: { status: 'idle', durationMs: DEFAULT_DURATION_MS } };
