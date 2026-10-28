// Schémas Zod du format d'état. Toute donnée lue du stockage ou d'un import passe par ici.
// Les objets sont « loose » : les champs inconnus sont tolérés (et conservés),
// pour permettre les évolutions futures sans perdre de données.

import { z } from '../../lib/vendor.js';

const positiveInt = z.number().int().min(1);

export const layoutSchema = z.looseObject({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: positiveInt,
  h: positiveInt,
});

export const widgetInstanceSchema = z.looseObject({
  id: z.string().min(1),
  type: z.string().min(1),
  title: z.string().optional(),
  layout: layoutSchema,
  settings: z.unknown(),
  version: positiveInt,
});

export const pageSchema = z.looseObject({
  id: z.string().min(1),
  name: z.string(),
  instances: z.array(widgetInstanceSchema),
});

export const themeSchema = z.enum(['light', 'dark', 'system']);

export const preferencesSchema = z.looseObject({
  singleKeyShortcuts: z.boolean(),
});

export const dashboardStateSchema = z.looseObject({
  version: positiveInt,
  theme: themeSchema,
  preferences: preferencesSchema,
  activePageId: z.string().min(1),
  pages: z.array(pageSchema).min(1),
});

/** Enveloppe StoredData : le contenu `data` est validé plus tard par le schéma du widget. */
export const storedDataSchema = z
  .looseObject({
    version: positiveInt,
    data: z.unknown(),
    updatedAt: z.number(),
  })
  .refine((value) => 'data' in value, { message: 'le champ « data » est obligatoire', path: ['data'] });

/**
 * Résume la première erreur Zod en une phrase lisible.
 * @param {{ issues: Array<{ path: PropertyKey[], message: string }> }} error
 * @returns {string}
 */
export function describeZodError(error) {
  const issue = error.issues[0];
  if (!issue) return 'données invalides';
  const where = issue.path.length > 0 ? issue.path.map(String).join('.') : 'racine';
  return `${where} : ${issue.message}`;
}
