// Schémas du widget Raccourcis : quatre réglages, une liste de liens.
//
// Une adresse relue du stockage doit être en http(s) : un javascript: glissé à la main dans
// localStorage ferait invalider les données (le cadre du widget affiche alors les valeurs par défaut
// et garde une copie), et ne deviendrait donc jamais un href.

import { z } from '../../lib/vendor.js';
import { MAX_URL_LENGTH, isHttpUrl } from '../../lib/url.js';
import { MAX_LINKS, MAX_TITLE_LENGTH } from './shortcutsLogic.js';

export const ICON_MODES = /** @type {const} */ (['letter', 'favicon']);
export const TILE_SIZES = /** @type {const} */ (['sm', 'md', 'lg']);

export const settingsSchema = z.object({
  openInNewTab: z.boolean(),
  showLabels: z.boolean(),
  icons: z.enum(ICON_MODES),
  tileSize: z.enum(TILE_SIZES),
});

/** Un raccourci. Les champs inconnus sont conservés (évolutions futures du format). */
export const linkSchema = z.looseObject({
  id: z.string().min(1),
  title: z.string().min(1).max(MAX_TITLE_LENGTH),
  url: z.string().max(MAX_URL_LENGTH).refine(isHttpUrl, { message: 'Adresse http ou https attendue' }),
});

export const dataSchema = z.looseObject({
  links: z.array(linkSchema).max(MAX_LINKS),
});

/** @type {{ openInNewTab: boolean, showLabels: boolean, icons: 'letter' | 'favicon', tileSize: 'sm' | 'md' | 'lg' }} */
export const defaultSettings = { openInNewTab: false, showLabels: true, icons: 'letter', tileSize: 'md' };

/** @type {{ links: import('./shortcutsLogic.js').Link[] }} */
export const defaultData = { links: [] };
