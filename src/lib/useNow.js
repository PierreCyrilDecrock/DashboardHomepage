// Hook « heure courante » : renvoie la date du moment et se met à jour pile au début de chaque
// seconde (ou minute). Chaque appel crée son propre minuteur ; rien n'est partagé.
//
// Le minuteur ne compte jamais : à chaque top, l'heure est relue avec Date.now(), et le top suivant
// est recalculé depuis cette lecture. Une dérive ou un minuteur retardé (onglet en arrière-plan)
// se corrige donc tout seul, et au retour sur l'onglet on se resynchronise immédiatement.

import { useEffect, useState } from './vendor.js';
import { msUntilNextTick } from './ticks.js';

/**
 * @param {import('./ticks.js').TickGranularity} [granularity]
 * @returns {Date}
 */
export function useNow(granularity = 'second') {
  const [now, setNow] = useState(() => new Date(Date.now()));

  useEffect(() => {
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer;
    let stopped = false;

    const sync = () => {
      if (stopped) return;
      clearTimeout(timer);
      const current = Date.now();
      setNow(new Date(current));
      timer = setTimeout(sync, msUntilNextTick(current, granularity));
    };
    /** Resynchronisation immédiate quand l'onglet redevient visible. */
    const onVisibility = () => {
      if (document.visibilityState === 'visible') sync();
    };

    sync();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [granularity]);

  return now;
}
