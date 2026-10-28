// Logique pure du widget Raccourcis : aucune dépendance à Preact ni au DOM.
// Chaque fonction renvoie un NOUVEAU tableau (ou le même, inchangé, quand il n'y a rien à faire).

import { newId } from '../../lib/id.js';
import { getDefaultTitle, getDomain, normalizeUrl } from '../../lib/url.js';

export const MAX_LINKS = 60;
export const MAX_TITLE_LENGTH = 40;
/** Nombre de couleurs de tuile (--tile-1 à --tile-8). */
export const TILE_COUNT = 8;

/** @typedef {{ id: string, title: string, url: string, [key: string]: unknown }} Link */
/** @typedef {import('../../lib/url.js').UrlErrorReason | 'limit' | 'not-found'} LinkErrorReason */

/**
 * Titre nettoyé : espaces retirés aux deux bouts, coupé à 40 caractères sans couper une paire de
 * substitution UTF-16 en deux.
 * @param {unknown} title
 * @returns {string}
 */
export function cleanTitle(title) {
  let value = String(title ?? '').trim();
  if (value.length > MAX_TITLE_LENGTH) {
    value = value.slice(0, MAX_TITLE_LENGTH);
    const last = value.charCodeAt(value.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) value = value.slice(0, -1);
    value = value.trimEnd();
  }
  return value;
}

/**
 * Titre d'un raccourci : celui donné, sinon le domaine.
 * @param {unknown} title
 * @param {string} url adresse déjà normalisée
 * @returns {string}
 */
function titleFor(title, url) {
  return cleanTitle(title) || cleanTitle(getDefaultTitle(url)) || url;
}

/**
 * Un raccourci utilise-t-il déjà cette adresse ? (`ignoreId` : le raccourci en cours de modification.)
 * @param {Link[]} links
 * @param {string} url adresse normalisée
 * @param {string} [ignoreId]
 * @returns {boolean}
 */
export function hasDuplicate(links, url, ignoreId) {
  return links.some((l) => l.url === url && l.id !== ignoreId);
}

/**
 * Ajoute un raccourci à la fin. L'adresse est normalisée (https:// ajouté, protocoles dangereux
 * refusés) ; le titre par défaut est le domaine. Refusé au-delà de 60 raccourcis. Un doublon
 * d'adresse reste autorisé : `duplicate` le signale.
 * @param {Link[]} links
 * @param {{ url: string, title?: string }} input
 * @param {() => string} [makeId]
 * @returns {{ ok: true, links: Link[], link: Link, duplicate: boolean } | { ok: false, reason: LinkErrorReason }}
 */
export function addLink(links, { url, title }, makeId = newId) {
  const normalized = normalizeUrl(url);
  if (!normalized.ok) return { ok: false, reason: normalized.reason };
  if (links.length >= MAX_LINKS) return { ok: false, reason: 'limit' };
  const link = { id: makeId(), title: titleFor(title, normalized.url), url: normalized.url };
  return { ok: true, links: [...links, link], link, duplicate: hasDuplicate(links, normalized.url) };
}

/**
 * Modifie l'adresse et le titre d'un raccourci (mêmes règles que l'ajout). Titre vide : le domaine.
 * @param {Link[]} links
 * @param {string} id
 * @param {{ url: string, title?: string }} input
 * @returns {{ ok: true, links: Link[], link: Link, duplicate: boolean } | { ok: false, reason: LinkErrorReason }}
 */
export function updateLink(links, id, { url, title }) {
  const current = links.find((l) => l.id === id);
  if (!current) return { ok: false, reason: 'not-found' };
  const normalized = normalizeUrl(url);
  if (!normalized.ok) return { ok: false, reason: normalized.reason };
  const link = { ...current, title: titleFor(title, normalized.url), url: normalized.url };
  return { ok: true, links: links.map((l) => (l.id === id ? link : l)), link, duplicate: hasDuplicate(links, normalized.url, id) };
}

/**
 * Retire un raccourci et dit où il était, pour pouvoir l'annuler.
 * @param {Link[]} links
 * @param {string} id
 * @returns {{ links: Link[], removed: Link | null, index: number }}
 */
export function removeLink(links, id) {
  const index = links.findIndex((l) => l.id === id);
  if (index === -1) return { links, removed: null, index: -1 };
  return { links: [...links.slice(0, index), ...links.slice(index + 1)], removed: links[index], index };
}

/**
 * Remet un raccourci retiré à sa place (bornée à la taille actuelle). Sans effet s'il est déjà là
 * ou si la limite de 60 serait dépassée.
 * @param {Link[]} links
 * @param {Link | null} removed
 * @param {number} index
 * @returns {Link[]}
 */
export function restoreLink(links, removed, index) {
  if (removed === null || links.some((l) => l.id === removed.id) || links.length >= MAX_LINKS) return links;
  const at = Math.max(0, Math.min(links.length, Number.isInteger(index) ? index : links.length));
  return [...links.slice(0, at), removed, ...links.slice(at)];
}

/**
 * Place le raccourci `activeId` à l'emplacement de `overId`.
 * @param {Link[]} links
 * @param {string} activeId
 * @param {string} overId
 * @returns {Link[]}
 */
export function reorderLinks(links, activeId, overId) {
  const from = links.findIndex((l) => l.id === activeId);
  const to = links.findIndex((l) => l.id === overId);
  if (from === -1 || to === -1 || from === to) return links;
  const next = [...links];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Déplace un raccourci de `delta` places (négatif : vers le début), sans sortir des bornes.
 * @param {Link[]} links
 * @param {string} id
 * @param {number} delta
 * @returns {Link[]}
 */
export function moveLink(links, id, delta) {
  const from = links.findIndex((l) => l.id === id);
  if (from === -1 || !Number.isInteger(delta) || delta === 0) return links;
  const to = Math.max(0, Math.min(links.length - 1, from + delta));
  if (to === from) return links;
  return reorderLinks(links, id, links[to].id);
}

/**
 * Première lettre (ou chiffre) du titre, en majuscule. Sans lettre ni chiffre, le premier caractère ;
 * titre vide : « ? ».
 * @param {string} title
 * @returns {string}
 */
export function getInitial(title) {
  const text = String(title ?? '').trim();
  const letter = /[\p{L}\p{N}]/u.exec(text);
  if (letter) return letter[0].toLocaleUpperCase('fr-FR');
  const first = [...text][0];
  return first ?? '?';
}

/**
 * Indice de couleur de tuile, de 1 à 8, stable pour un domaine (même domaine, même couleur, quel que
 * soit l'ordre des raccourcis). Hachage FNV-1a du domaine en minuscules, sans « www. ».
 * @param {string} domain
 * @returns {number}
 */
export function getTileIndex(domain) {
  const text = String(domain ?? '').toLowerCase().replace(/^www\./, '');
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash % TILE_COUNT) + 1;
}

/**
 * Couleur de tuile d'un raccourci, d'après le domaine de son adresse.
 * @param {Link} link
 * @returns {number}
 */
export function getLinkTileIndex(link) {
  return getTileIndex(getDomain(link.url));
}

/**
 * Message d'erreur en français pour un refus d'ajout ou de modification.
 * @param {LinkErrorReason} reason
 * @returns {string}
 */
export function getErrorMessage(reason) {
  switch (reason) {
    case 'empty':
      return 'Saisis une adresse. Exemple : github.com';
    case 'protocol':
      return 'Adresse invalide : seules les adresses http et https sont acceptées. Exemple : github.com';
    case 'limit':
      return `Maximum atteint : ${MAX_LINKS} raccourcis par widget.`;
    case 'not-found':
      return 'Ce raccourci n\'existe plus.';
    default:
      return 'Adresse invalide. Exemple : github.com';
  }
}
