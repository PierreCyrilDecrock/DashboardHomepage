// Calcul pur des « tops » d'horloge (utilisé par useNow).

/** Durée d'une seconde et d'une minute, en millisecondes. */
export const SECOND_MS = 1000;
export const MINUTE_MS = 60_000;

/** @typedef {'second' | 'minute'} TickGranularity */

/**
 * Délai, en millisecondes, jusqu'au début de la seconde (ou de la minute) suivante.
 * Pile sur un début, le délai est d'une période entière (jamais 0) : le top courant est déjà passé.
 * @param {number} nowMs instant courant (Date.now())
 * @param {TickGranularity} granularity
 * @returns {number} entre 1 et la durée de la période
 */
export function msUntilNextTick(nowMs, granularity) {
  const period = granularity === 'minute' ? MINUTE_MS : SECOND_MS;
  return period - (((nowMs % period) + period) % period);
}
