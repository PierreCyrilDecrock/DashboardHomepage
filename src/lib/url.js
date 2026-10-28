// Adresses web : nettoyage, validation et lecture du domaine.
//
// Règle de sécurité : SEULES les adresses http et https sont acceptées. javascript:, data:, file:,
// ftp:, mailto: et tout autre protocole sont refusés, que l'adresse soit saisie par l'utilisateur ou
// relue du stockage (voir isHttpUrl). Aucune dépendance au DOM : la classe URL suffit.

export const MAX_URL_LENGTH = 2048;

/** @typedef {'empty' | 'spaces' | 'protocol' | 'host' | 'credentials' | 'too-long' | 'invalid'} UrlErrorReason */
/** @typedef {{ ok: true, url: string } | { ok: false, reason: UrlErrorReason }} NormalizeResult */

/** Protocole explicite : « abc:// » (insensible à la casse). */
const EXPLICIT_PROTOCOL = /^([a-z][a-z0-9+.-]*):\/\//i;
/** « nom:1234 » avec ou sans suite : un hôte et un port (localhost:3000), pas un protocole. */
const HOST_WITH_PORT = /^[^\s/?#:@]+:\d{1,5}(?:[/?#]|$)/;
/** Début qui ressemble à un protocole sans « // » : javascript:, data:, mailto:, tel:… */
const BARE_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
/** Un nom de domaine : au moins deux étiquettes de lettres, chiffres et tirets. */
const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

/**
 * @param {string} hostname nom d'hôte tel que le rend la classe URL (en minuscules, IDN en punycode)
 * @returns {boolean}
 */
function isValidHostname(hostname) {
  if (hostname === 'localhost') return true;
  if (hostname.startsWith('[') && hostname.endsWith(']')) return true; // IPv6, déjà validée par URL
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return true; // IPv4, normalisée par URL
  const labels = hostname.split('.');
  return labels.length >= 2 && hostname.length <= 253 && labels.every((label) => DOMAIN_LABEL.test(label));
}

/**
 * Nettoie et valide une adresse saisie.
 * - espaces aux deux bouts retirés ; texte vide ou espaces internes : refusé ;
 * - https:// ajouté si aucun protocole ; seuls http et https passent (casse du protocole libre) ;
 * - nom d'hôte exigé : avec un point, « localhost » ou une adresse IP (« localhost:3000 » et
 *   « http://192.168.1.10:8080 » passent, « bonjour » est refusé) ;
 * - identifiant:mot de passe@ refusé (adresse trompeuse) ;
 * - le « / » final d'une adresse sans chemin est retiré : « github.com » donne « https://github.com ».
 * @param {unknown} input
 * @returns {NormalizeResult}
 */
export function normalizeUrl(input) {
  const text = typeof input === 'string' ? input.trim() : '';
  if (text === '') return { ok: false, reason: 'empty' };
  if (/\s/.test(text)) return { ok: false, reason: 'spaces' };
  if (text.length > MAX_URL_LENGTH) return { ok: false, reason: 'too-long' };

  let candidate = text;
  const explicit = EXPLICIT_PROTOCOL.exec(text);
  if (explicit) {
    const scheme = explicit[1].toLowerCase();
    if (scheme !== 'http' && scheme !== 'https') return { ok: false, reason: 'protocol' };
  } else if (BARE_SCHEME.test(text) && !HOST_WITH_PORT.test(text)) {
    return { ok: false, reason: 'protocol' };
  } else {
    candidate = `https://${text.replace(/^\/+/, '')}`;
  }

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { ok: false, reason: 'protocol' };
  if (parsed.username !== '' || parsed.password !== '') return { ok: false, reason: 'credentials' };
  if (!isValidHostname(parsed.hostname)) return { ok: false, reason: 'host' };

  let url = parsed.href;
  if (parsed.pathname === '/' && parsed.search === '' && parsed.hash === '' && url.endsWith('/')) url = url.slice(0, -1);
  return { ok: true, url };
}

/**
 * Vrai pour une adresse http(s) bien formée (sans toucher à sa forme). Sert de garde pour les
 * adresses relues du stockage, qu'une modification manuelle aurait pu remplacer par javascript:.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isHttpUrl(value) {
  if (typeof value !== 'string' || value.length > MAX_URL_LENGTH || /\s/.test(value)) return false;
  try {
    const parsed = new URL(value);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname !== '';
  } catch {
    return false;
  }
}

/**
 * Nom d'hôte sans « www. » (en minuscules). Chaîne vide si l'adresse est illisible.
 * @param {string} url
 * @returns {string}
 */
export function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Titre proposé pour une adresse : son domaine.
 * @param {string} url
 * @returns {string}
 */
export function getDefaultTitle(url) {
  return getDomain(url);
}
