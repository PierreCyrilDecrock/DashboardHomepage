// Hook Preact autour du moteur de minuterie (countdown.js).
//
// Un minuteur interne de 250 ms tourne UNIQUEMENT quand la minuterie est en cours (running) ; il est
// nettoyé à la destruction. Il ne compte rien : à chaque top il relit Date.now() et recalcule depuis
// endsAt, donc un top retardé (onglet en arrière-plan) ne fausse jamais le temps. Au retour sur
// l'onglet (visibilitychange), on se resynchronise tout de suite. Chaque appel du hook a son propre
// minuteur : rien n'est partagé entre deux widgets.
//
// La fin (running → done) enregistre l'état done avec setState, puis appelle onComplete({ finishedAt,
// late }) UNE SEULE fois par valeur de endsAt. Si la page se charge avec un état running déjà
// écoulé, onComplete reçoit late = true.

import { useCallback, useEffect, useRef, useState } from './vendor.js';
import { advance, getRemainingMs, pause, reset, resume, settle, start, withDuration } from './countdown.js';

/** Période du minuteur interne, en millisecondes. */
export const TICK_MS = 250;

/**
 * @typedef {import('./countdown.js').CountdownState} CountdownState
 */

/**
 * @param {{
 *   state: CountdownState,
 *   setState: (next: CountdownState) => void,
 *   onComplete?: (completion: { finishedAt: number, late: boolean }) => void,
 *   tickMs?: number,
 * }} options
 * @returns {{
 *   countdown: CountdownState,
 *   remainingMs: number,
 *   status: CountdownState['status'],
 *   start: () => CountdownState,
 *   pause: () => CountdownState,
 *   resume: () => CountdownState,
 *   reset: () => CountdownState,
 *   restart: () => CountdownState,
 *   setDuration: (durationMs: number) => CountdownState,
 * }}
 *   Chaque action renvoie le nouvel état (par exemple pour lire endsAt après start).
 */
export function useCountdown({ state, setState, onComplete, tickMs = TICK_MS }) {
  const [now, setNow] = useState(() => Date.now());
  /**
   * Valeurs courantes pour les fonctions stables ci-dessous. `current` est l'état le plus récent connu :
   * celui de la dernière action, tant que le parent n'a pas encore transmis un nouvel état (`prop`).
   */
  const latest = useRef({ prop: state, current: state, setState, onComplete });
  latest.current.setState = setState;
  latest.current.onComplete = onComplete;
  if (latest.current.prop !== state) {
    latest.current.prop = state;
    latest.current.current = state;
  }
  /** endsAt déjà signalé comme terminé : garde « une seule fois par fin ». */
  const completedFor = useRef(/** @type {number | null} */ (null));

  /** Avance jusqu'à maintenant, signale la fin le cas échéant, et rend l'état courant. */
  const sync = useCallback(() => {
    const t = Date.now();
    setNow(t);
    const before = latest.current.current;
    const result = advance(before, t, completedFor.current);
    completedFor.current = result.completedFor;
    if (result.state !== before) {
      latest.current.current = result.state;
      latest.current.setState(result.state);
    }
    if (result.completion) latest.current.onComplete?.(result.completion);
    return result.state;
  }, []);

  const endsAt = state.status === 'running' ? state.endsAt : 0;
  useEffect(() => {
    if (state.status !== 'running') return undefined;
    sync();
    const timer = setInterval(sync, tickMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') sync();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [state.status, endsAt, tickMs, sync]);

  /** @param {(current: CountdownState, now: number) => CountdownState} change */
  const act = useCallback(
    (change) => {
      const settled = sync();
      const t = Date.now();
      const next = change(settled, t);
      if (next !== settled) {
        latest.current.current = next;
        latest.current.setState(next);
        setNow(t);
      }
      return next;
    },
    [sync],
  );

  const actions = useRef({
    start: () => act(start),
    pause: () => act(pause),
    resume: () => act(resume),
    reset: () => act((s) => reset(s)),
    restart: () => act((s, t) => start(reset(s), t)),
    setDuration: (/** @type {number} */ durationMs) => act((s) => withDuration(s, durationMs)),
  });

  // Ce qu'on affiche : l'état réglé à l'instant du dernier top (une fin tombée entre deux tops s'affiche aussitôt).
  const display = settle(state, now);
  return {
    countdown: display,
    remainingMs: getRemainingMs(display, now),
    status: display.status,
    ...actions.current,
  };
}
