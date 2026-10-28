// Schémas du widget À faire : deux réglages, une liste de tâches.

import { z } from '../../lib/vendor.js';
import { MAX_TEXT_LENGTH } from './todoLogic.js';

export const settingsSchema = z.object({
  showProgress: z.boolean(),
  doneLast: z.boolean(),
});

/** Une tâche. Les champs inconnus sont conservés (évolutions futures du format). */
export const taskSchema = z.looseObject({
  id: z.string().min(1),
  text: z.string().min(1).max(MAX_TEXT_LENGTH),
  done: z.boolean(),
  createdAt: z.number(),
  doneAt: z.number().nullable(),
});

export const dataSchema = z.looseObject({
  tasks: z.array(taskSchema),
});

export const defaultSettings = { showProgress: true, doneLast: true };

/** @type {{ tasks: import('./todoLogic.js').Task[] }} */
export const defaultData = { tasks: [] };
