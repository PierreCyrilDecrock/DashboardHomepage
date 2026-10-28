// Schémas du widget Notes : trois réglages d'affichage, des notes en onglets.

import { z } from '../../lib/vendor.js';
import { MAX_CONTENT_LENGTH } from './notesLogic.js';

export const FONT_SIZES = /** @type {const} */ (['sm', 'md', 'lg']);

export const settingsSchema = z.object({
  fontSize: z.enum(FONT_SIZES),
  monospace: z.boolean(),
  spellcheck: z.boolean(),
});

/** Une note. `format` est réservé à un futur mode Markdown : seul 'text' existe. Champs inconnus conservés. */
export const noteSchema = z.looseObject({
  id: z.string().min(1),
  title: z.string().nullable(),
  content: z.string().max(MAX_CONTENT_LENGTH),
  format: z.literal('text'),
  updatedAt: z.number(),
});

export const dataSchema = z.looseObject({
  activeId: z.string().nullable(),
  notes: z.array(noteSchema),
});

export const defaultSettings = {
  fontSize: /** @type {'sm' | 'md' | 'lg'} */ ('md'),
  monospace: false,
  spellcheck: true,
};

/** @type {{ activeId: string | null, notes: import('./notesLogic.js').Note[] }} */
export const defaultData = { activeId: null, notes: [] };
