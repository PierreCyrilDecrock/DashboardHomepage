// Moteur de minuterie : logique pure, sans Preact ni DOM.
//
// Règle centrale : le temps restant se calcule TOUJOURS depuis une heure de fin enregistrée
// (endsAt), jamais avec un compteur décrémenté. Un onglet en arrière-plan est ralenti par le
// navigateur et un compteur dériverait ; avec une heure de fin, la minuterie reste juste après un
// rechargement, une mise en veille ou une fermeture de la page.
//
//   idle     durée choisie                    start  → running
//   running  durée et heure de fin (endsAt)   pause  → paused ; heure de fin atteinte (settle) → done
//   paused   durée et temps restant           resume → running ; reset → idle
//   done     durée et heure de fin réelle     reset  → idle
//
// Toutes les fonctions renvoient un NOUVEL état, ou le même objet quand rien ne change.

export const SECOND_MS = 1000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;
/** Bornes d'une durée : de 1 seconde à 24 heures. */
export const MIN_DURATION_MS = SECOND_MS;
export const MAX_DURATION_MS = 24 * HOUR_MS;
/** Durée proposée par défaut : 5 minutes. */
export const DEFAULT_DURATION_MS = 5 * MINUTE_MS;
/** Au-delà de ce délai après la fin, on dit que la fin est « tardive » (page fermée ou onglet endormi). */
export const LATE_THRESHOLD_MS = 2000;

/**
 * @typedef {{ status: 'idle', durationMs: number }
 *   | { status: 'running', durationMs: number, endsAt: number }
 *   | { status: 'paused', durationMs: number, remainingMs: number }
 *   | { status: 'done', durationMs: number, finishedAt: number }} CountdownState
 */

/**
 * Ramène une durée dans les bornes (entier de millisecondes). Valeur illisible : durée par défaut.
 * @param {unknown} durationMs
 * @returns {number}
 */
export function clampDuration(durationMs) {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs)) return DEFAULT_DURATION_MS;
  return Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, Math.round(durationMs)));
}

/**
 * État initial : une minuterie arrêtée, prête à démarrer.
 * @param {number} [durationMs]
 * @returns {CountdownState}
 */
export function createIdle(durationMs = DEFAULT_DURATION_MS) {
  return { status: 'idle', durationMs: clampDuration(durationMs) };
}

/**
 * Démarre : idle → running. Tout autre état est rendu tel quel.
 * @param {CountdownState} state
 * @param {number} now
 * @returns {CountdownState}
 */
export function start(state, now) {
  if (state.status !== 'idle') return state;
  return { status: 'running', durationMs: state.durationMs, endsAt: now + state.durationMs };
}

/**
 * Met en pause : running → paused, en gardant le temps restant. Si l'heure de fin est déjà passée,
 * la minuterie est terminée (done) et non en pause. Tout autre état est rendu tel quel.
 * @param {CountdownState} state
 * @param {number} now
 * @returns {CountdownState}
 */
export function pause(state, now) {
  if (state.status !== 'running') return state;
  if (now >= state.endsAt) return settle(state, now);
  return { status: 'paused', durationMs: state.durationMs, remainingMs: state.endsAt - now };
}

/**
 * Reprend : paused → running, avec le temps restant conservé. Tout autre état est rendu tel quel.
 * @param {CountdownState} state
 * @param {number} now
 * @returns {CountdownState}
 */
export function resume(state, now) {
  if (state.status !== 'paused') return state;
  return { status: 'running', durationMs: state.durationMs, endsAt: now + state.remainingMs };
}

/**
 * Réinitialise : n'importe quel état → idle, avec la même durée.
 * @param {CountdownState} state
 * @returns {CountdownState}
 */
export function reset(state) {
  return state.status === 'idle' ? state : { status: 'idle', durationMs: state.durationMs };
}

/**
 * Temps restant, en millisecondes (jamais négatif). idle : la durée entière ; done : 0.
 * @param {CountdownState} state
 * @param {number} now
 * @returns {number}
 */
export function getRemainingMs(state, now) {
  switch (state.status) {
    case 'idle':
      return state.durationMs;
    case 'running':
      return Math.max(0, state.endsAt - now);
    case 'paused':
      return state.remainingMs;
    default:
      return 0;
  }
}

/**
 * Si l'état est running et que l'heure de fin est atteinte, passe à done avec finishedAt = endsAt
 * (une valeur déterministe, pas l'heure courante : deux onglets obtiennent le même état).
 * Sinon renvoie l'état inchangé. Idempotent : settle(settle(s, t), t) donne le même résultat.
 * @param {CountdownState} state
 * @param {number} now
 * @returns {CountdownState}
 */
export function settle(state, now) {
  if (state.status !== 'running' || now < state.endsAt) return state;
  return { status: 'done', durationMs: state.durationMs, finishedAt: state.endsAt };
}

/**
 * Vrai si l'état est done depuis plus de `thresholdMs` : la fin a eu lieu sans que la page la voie
 * (page fermée, ordinateur en veille). On affiche alors le message mais on ne sonne pas.
 * @param {CountdownState} state
 * @param {number} now
 * @param {number} [thresholdMs]
 * @returns {boolean}
 */
export function isLate(state, now, thresholdMs = LATE_THRESHOLD_MS) {
  return state.status === 'done' && now - state.finishedAt > thresholdMs;
}

/**
 * Change la durée choisie. Possible seulement à l'arrêt (idle) ou après la fin (done, qui repasse
 * alors à idle) ; pendant le décompte ou en pause, l'état est rendu tel quel.
 * @param {CountdownState} state
 * @param {number} durationMs
 * @returns {CountdownState}
 */
export function withDuration(state, durationMs) {
  if (state.status !== 'idle' && state.status !== 'done') return state;
  const next = createIdle(durationMs);
  return state.status === 'idle' && state.durationMs === next.durationMs ? state : next;
}

/**
 * Durée affichée : « mm:ss », ou « h:mm:ss » à partir d'une heure. Arrondie à la seconde SUPÉRIEURE :
 * « 00:00 » n'apparaît qu'à la toute fin (à 0,3 s de la fin, on affiche encore « 00:01 »).
 * @param {number} ms
 * @returns {string}
 */
export function formatDuration(ms) {
  const total = Math.max(0, Math.ceil((Number.isFinite(ms) ? ms : 0) / SECOND_MS));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const two = (n) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${two(minutes)}:${two(seconds)}`;
}

/**
 * Lit une durée saisie : « 5 » (minutes), « 5:30 » (minutes:secondes), « 1:05:00 » (heures:minutes:secondes).
 * Renvoie des millisecondes, ou null si le texte est illisible ou hors bornes (1 seconde à 24 heures).
 * Les minutes et secondes qui suivent un « : » vont de 0 à 59.
 * @param {unknown} text
 * @returns {number | null}
 */
export function parseDurationInput(text) {
  if (typeof text !== 'string') return null;
  const parts = text.trim().split(':');
  if (parts.length > 3 || parts.some((p) => !/^\d{1,5}$/.test(p))) return null;
  const numbers = parts.map(Number);
  let ms;
  if (numbers.length === 1) {
    ms = numbers[0] * MINUTE_MS;
  } else {
    const [first, ...rest] = numbers;
    if (rest.some((n) => n > 59)) return null;
    ms = numbers.length === 2 ? first * MINUTE_MS + rest[0] * SECOND_MS : first * HOUR_MS + rest[0] * MINUTE_MS + rest[1] * SECOND_MS;
  }
  return ms >= MIN_DURATION_MS && ms <= MAX_DURATION_MS ? ms : null;
}

/**
 * Part du temps écoulé, entre 0 et 1 (pour la barre de progression). done : 1 ; idle : 0.
 * @param {CountdownState} state
 * @param {number} now
 * @returns {number}
 */
export function getProgress(state, now) {
  if (state.status === 'done') return 1;
  if (state.status === 'idle') return 0;
  return Math.min(1, Math.max(0, 1 - getRemainingMs(state, now) / state.durationMs));
}

/**
 * Fait avancer l'état jusqu'à `now` et dit s'il vient de se terminer. Sert à déclencher la fin UNE SEULE
 * fois par valeur de endsAt : `completedFor` est l'endsAt déjà traité (ou null) ; il est rendu mis à jour.
 * `late` vaut vrai si la fin date de plus de 2 secondes (page fermée ou onglet endormi) : pas de son.
 * @param {CountdownState} state
 * @param {number} now
 * @param {number | null} completedFor
 * @returns {{ state: CountdownState, completion: { finishedAt: number, late: boolean } | null, completedFor: number | null }}
 */
export function advance(state, now, completedFor) {
  const settled = settle(state, now);
  if (settled === state || state.status !== 'running') return { state, completion: null, completedFor };
  if (completedFor === state.endsAt) return { state: settled, completion: null, completedFor };
  const done = /** @type {{ status: 'done', durationMs: number, finishedAt: number }} */ (settled);
  return { state: settled, completion: { finishedAt: done.finishedAt, late: isLate(settled, now) }, completedFor: state.endsAt };
}
