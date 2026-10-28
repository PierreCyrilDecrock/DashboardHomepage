// Logique pure du widget Heure : formatage de l'heure et de la date, salutation, fuseaux.
// Aucun accès au DOM ni à l'horloge : tout reçoit l'instant à formater.

/** Fuseaux proposés quand Intl.supportedValuesOf n'est pas disponible. */
const FALLBACK_TIME_ZONES = [
  'UTC',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Istanbul',
  'Europe/Moscow',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney',
  'Pacific/Auckland',
  'America/Sao_Paulo',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Mexico_City',
];

/** @type {Map<string, Intl.DateTimeFormat>} */
const formatters = new Map();

/**
 * Formateur Intl mis en cache par combinaison (langue, fuseau, options).
 * @param {string} locale
 * @param {string | undefined} timeZone `undefined` : fuseau du navigateur
 * @param {Intl.DateTimeFormatOptions} options
 * @returns {Intl.DateTimeFormat}
 */
export function getFormatter(locale, timeZone, options) {
  const key = `${locale}|${timeZone ?? ''}|${JSON.stringify(options)}`;
  let formatter = formatters.get(key);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat(locale, { ...options, ...(timeZone ? { timeZone } : {}) });
    formatters.set(key, formatter);
  }
  return formatter;
}

/** Vide le cache des formateurs (tests). */
export function clearFormatterCache() {
  formatters.clear();
}

/** Nombre de formateurs en cache (tests). */
export function formatterCacheSize() {
  return formatters.size;
}

/**
 * Le fuseau est-il connu d'Intl ?
 * @param {unknown} timeZone
 * @returns {boolean}
 */
export function isValidTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || timeZone.trim() === '' || timeZone !== timeZone.trim()) return false;
  try {
    new Intl.DateTimeFormat('fr-FR', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Fuseau du navigateur (ou UTC si inconnu).
 * @returns {string}
 */
export function localTimeZone() {
  return new Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/**
 * Liste triée des fuseaux disponibles, avec un repli court si Intl ne sait pas les énumérer.
 * @returns {string[]}
 */
export function getTimeZoneChoices() {
  /** @type {string[]} */
  let zones = [];
  try {
    if (typeof Intl.supportedValuesOf === 'function') zones = Intl.supportedValuesOf('timeZone');
  } catch {
    zones = [];
  }
  if (zones.length === 0) zones = FALLBACK_TIME_ZONES;
  return [...new Set([...zones, 'UTC'])].sort((a, b) => a.localeCompare(b));
}

/**
 * Ville déduite d'un fuseau : « America/New_York » → « New York ».
 * @param {string} timeZone
 * @returns {string}
 */
export function cityFromTimeZone(timeZone) {
  const last = timeZone.split('/').pop() ?? timeZone;
  return last.replaceAll('_', ' ');
}

/**
 * @typedef {Object} TimeOptions
 * @property {'24h' | '12h'} timeFormat
 * @property {boolean} showSeconds
 */

/**
 * Heure découpée pour l'affichage : « 02:30 » + « :15 » + « PM ».
 * @param {Date} date
 * @param {string | undefined} timeZone
 * @param {TimeOptions} options
 * @returns {{ main: string, seconds: string, period: string }}
 */
export function formatTimeParts(date, timeZone, { timeFormat, showSeconds }) {
  const twelve = timeFormat === '12h';
  const formatter = getFormatter(twelve ? 'en-US' : 'fr-FR', timeZone, {
    hour: '2-digit',
    minute: '2-digit',
    ...(showSeconds ? { second: '2-digit' } : {}),
    hourCycle: twelve ? 'h12' : 'h23',
  });
  let hour = '';
  let minute = '';
  let second = '';
  let period = '';
  for (const part of formatter.formatToParts(date)) {
    if (part.type === 'hour') hour = part.value;
    else if (part.type === 'minute') minute = part.value;
    else if (part.type === 'second') second = part.value;
    else if (part.type === 'dayPeriod') period = part.value;
  }
  return { main: `${hour}:${minute}`, seconds: showSeconds ? `:${second}` : '', period };
}

/**
 * Heure en texte : « 14:05:09 », « 02:05 PM ».
 * @param {Date} date
 * @param {string | undefined} timeZone
 * @param {TimeOptions} options
 * @returns {string}
 */
export function formatTime(date, timeZone, options) {
  const { main, seconds, period } = formatTimeParts(date, timeZone, options);
  return `${main}${seconds}${period ? ` ${period}` : ''}`;
}

/**
 * Date en français : « lundi 26 octobre ».
 * @param {Date} date
 * @param {string | undefined} timeZone
 * @returns {string}
 */
export function formatDate(date, timeZone) {
  return getFormatter('fr-FR', timeZone, { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
}

/**
 * Heure (0–23) dans un fuseau.
 * @param {Date} date
 * @param {string | undefined} timeZone
 * @returns {number}
 */
export function hourIn(date, timeZone) {
  const part = getFormatter('en-US', timeZone, { hour: 'numeric', hourCycle: 'h23' })
    .formatToParts(date)
    .find((p) => p.type === 'hour');
  return Number(part?.value ?? 0) % 24;
}

/**
 * « Bonjour » de 5 h à 17 h 59, « Bonsoir » sinon.
 * @param {number} hour heure entière, 0–23
 * @returns {'Bonjour' | 'Bonsoir'}
 */
export function getGreeting(hour) {
  return hour >= 5 && hour < 18 ? 'Bonjour' : 'Bonsoir';
}

/**
 * Salutation complète, avec le prénom s'il est renseigné : « Bonjour Camille ».
 * @param {number} hour
 * @param {string} userName
 * @returns {string}
 */
export function formatGreeting(hour, userName) {
  const name = userName.trim();
  return name === '' ? getGreeting(hour) : `${getGreeting(hour)} ${name}`;
}

/**
 * Jour civil d'un instant dans un fuseau, comme nombre de jours depuis 1970 (fuseau appliqué).
 * @param {Date} date
 * @param {string | undefined} timeZone
 * @returns {number}
 */
function civilDay(date, timeZone) {
  /** @type {Record<string, number>} */
  const values = {};
  for (const part of getFormatter('en-US', timeZone, { year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(date)) {
    if (part.type === 'year' || part.type === 'month' || part.type === 'day') values[part.type] = Number(part.value);
  }
  return Math.round(Date.UTC(values.year, values.month - 1, values.day) / 86_400_000);
}

/**
 * Écart de date entre un fuseau et le fuseau principal : « +1 j », « −1 j » ou '' si le jour est le même.
 * @param {Date} date
 * @param {string} timeZone fuseau secondaire
 * @param {string | undefined} baseTimeZone fuseau principal
 * @returns {string}
 */
export function dayDifferenceLabel(date, timeZone, baseTimeZone) {
  const diff = civilDay(date, timeZone) - civilDay(date, baseTimeZone);
  if (diff === 0) return '';
  return `${diff > 0 ? '+' : '−'}${Math.abs(diff)} j`;
}
