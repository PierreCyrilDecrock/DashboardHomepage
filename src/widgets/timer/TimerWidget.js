// Composant du widget Minuteur. Il ne connaît que ses props, le hook useCountdown et le service d'alarme.
//
// Le temps restant vient toujours de l'heure de fin enregistrée (endsAt) : voir src/lib/countdown.js.
// Le widget n'appelle ni AudioContext ni Notification : tout passe par getAlarmService().
//
// Un seul bouton principal (Démarrer / Pause / Reprendre / Relancer) change de libellé sans changer
// d'élément : le focus clavier reste dessus quand l'état change.

import { html, useCallback, useEffect, useLayoutEffect, useRef, useState } from '../../lib/vendor.js';
import { formatDuration, parseDurationInput } from '../../lib/countdown.js';
import { getAlarmService } from '../../lib/platform/alarmService.js';
import { clearTitle, registerTitle } from '../../lib/tabTitle.js';
import { useCountdown } from '../../lib/useCountdown.js';
import { formatFinishedAt, formatPresetLabel, isPresetSelected, progressRatio, timeEmWidth } from './timerLogic.js';

const CUSTOM_ERROR = 'Durée invalide. Exemples : 5, 5:30 ou 1:05:00 (de 1 seconde à 24 heures).';

/**
 * @param {import('../types.js').WidgetProps<typeof import('./schema.js').defaultSettings, typeof import('./schema.js').defaultData>} props
 */
export function TimerWidget({ instanceId, settings, data, updateData }) {
  const { presetsMinutes, label } = settings;

  const root = useRef(/** @type {HTMLElement | null} */ (null));
  const customInput = useRef(/** @type {HTMLInputElement | null} */ (null));
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const pendingFocus = useRef(/** @type {string | null} */ (null));

  const [announcement, setAnnouncement] = useState('');
  /** La fin a eu lieu sous nos yeux : l'animation est permise (pas pour une fin tardive). */
  const [celebrating, setCelebrating] = useState(false);
  const [customError, setCustomError] = useState('');

  /** @param {string} message */
  const announce = useCallback((message) => {
    // Un texte identique ne serait pas relu : on alterne une espace insécable en fin de phrase.
    setAnnouncement((previous) => message + (previous.endsWith(' ') ? '' : ' '));
  }, []);

  const setCountdown = useCallback(
    /** @param {import('../../lib/countdown.js').CountdownState} next */
    (next) => updateData((d) => ({ ...d, countdown: next })),
    [updateData],
  );

  const onComplete = useCallback(
    /** @param {{ finishedAt: number, late: boolean }} completion */
    ({ finishedAt, late }) => {
      const current = settingsRef.current;
      announce(`Minuteur terminé${current.label ? ` : ${current.label}` : ''}`);
      // Fin tardive (page fermée entre-temps) : le message s'affiche, mais ni son ni notification.
      if (late) return;
      setCelebrating(true);
      const alarm = getAlarmService();
      const key = `${instanceId}:${finishedAt}`;
      if (current.sound) alarm.playAlarm(key);
      if (current.notify) {
        const at = formatFinishedAt(finishedAt);
        alarm.notify('Minuteur terminé', current.label ? `${current.label} · terminé à ${at}` : `Terminé à ${at}`, key);
      }
    },
    [instanceId, announce],
  );

  const countdown = useCountdown({ state: data.countdown, setState: setCountdown, onComplete });
  const { status, remainingMs } = countdown;
  const state = countdown.countdown;

  // Titre de l'onglet : seulement pendant le décompte ; retiré en pause, à la fin et à la destruction.
  const shownSeconds = Math.ceil(remainingMs / 1000);
  useEffect(() => {
    if (status === 'running') registerTitle(instanceId, remainingMs, label);
    else clearTitle(instanceId);
  }, [status, shownSeconds, label, instanceId]);
  useEffect(() => () => clearTitle(instanceId), [instanceId]);

  // Après un changement d'état : focus demandé par l'action (le bouton cliqué peut avoir disparu).
  useLayoutEffect(() => {
    if (pendingFocus.current === null) return;
    const target = /** @type {HTMLElement | null} */ (root.current?.querySelector(pendingFocus.current) ?? null);
    if (target) {
      target.focus();
      pendingFocus.current = null;
    }
  });

  /** Lit le champ « Autre durée » : null si vide ; false si invalide (message affiché). */
  const readCustom = () => {
    const text = customInput.current?.value.trim() ?? '';
    if (text === '') return null;
    const ms = parseDurationInput(text);
    if (ms === null) {
      setCustomError(CUSTOM_ERROR);
      customInput.current?.focus();
      return false;
    }
    return ms;
  };

  const applyCustom = () => {
    const ms = readCustom();
    if (ms === null || ms === false) return ms === null ? true : false;
    countdown.setDuration(ms);
    if (customInput.current) customInput.current.value = '';
    setCustomError('');
    announce(`Durée choisie : ${formatDuration(ms)}`);
    return true;
  };

  const onStart = () => {
    // Un clic de l'utilisateur : c'est le bon moment pour préparer le son (les navigateurs le bloquent avant).
    const alarm = getAlarmService();
    alarm.primeAudio();
    if (!applyCustom()) return;
    setCelebrating(false);
    const next = countdown.start();
    if (next.status === 'running') alarm.scheduleCompletion(instanceId, next.endsAt, label);
  };

  const onPause = () => {
    const next = countdown.pause();
    getAlarmService().cancelCompletion(instanceId);
    if (next.status === 'paused') announce('Minuteur en pause');
  };

  const onResume = () => {
    const alarm = getAlarmService();
    alarm.primeAudio();
    const next = countdown.resume();
    if (next.status === 'running') alarm.scheduleCompletion(instanceId, next.endsAt, label);
    announce('Minuteur relancé');
  };

  const onReset = () => {
    countdown.reset();
    getAlarmService().cancelCompletion(instanceId);
    setCelebrating(false);
    pendingFocus.current = '.timer__primary';
    announce('Minuteur réinitialisé');
  };

  const onRestart = () => {
    const alarm = getAlarmService();
    alarm.primeAudio();
    setCelebrating(false);
    const next = countdown.restart();
    if (next.status === 'running') alarm.scheduleCompletion(instanceId, next.endsAt, label);
  };

  /** @param {number} minutes */
  const choosePreset = (minutes) => {
    countdown.setDuration(minutes * 60_000);
    setCustomError('');
    if (customInput.current) customInput.current.value = '';
  };

  const editable = status === 'idle';
  const timeText = formatDuration(remainingMs);
  const progress = progressRatio(status, remainingMs, state.durationMs);
  const finishedAt = state.status === 'done' ? state.finishedAt : null;
  const primary =
    status === 'idle' ? { text: 'Démarrer', run: onStart } : status === 'running' ? { text: 'Pause', run: onPause } : status === 'paused' ? { text: 'Reprendre', run: onResume } : { text: 'Relancer', run: onRestart };

  return html`
    <div class="timer" ref=${root} data-instance=${instanceId} data-status=${status} style=${`--timer-em-width:${timeEmWidth(timeText)}`}>
      <div class=${`timer__inner timer__inner--${status}`}>
        ${label && html`<p class="timer__label" title=${label}>${label}</p>`}
        <p class=${`timer__time ${status === 'done' && celebrating ? 'timer__time--celebrate' : ''}`.trim()} role="timer" aria-label="Temps restant" data-testid="timer-time">${timeText}</p>
        <progress class="timer__progress" max="1000" value=${Math.round(progress * 1000)} aria-label="Progression du minuteur"></progress>
        ${finishedAt !== null && html`<p class="timer__done" data-testid="timer-done">Terminé à ${formatFinishedAt(finishedAt)}</p>`}

        ${editable &&
        html`<div class="timer__presets" role="group" aria-label="Durées prédéfinies">
          ${presetsMinutes.map(
            (minutes, index) => html`<button
              type="button"
              class="timer__preset"
              key=${`${index}-${minutes}`}
              aria-pressed=${isPresetSelected(state.durationMs, minutes) ? 'true' : 'false'}
              onClick=${() => choosePreset(minutes)}
            >
              ${formatPresetLabel(minutes)}
            </button>`,
          )}
        </div>`}

        <form
          class="timer__actions"
          onSubmit=${(/** @type {Event} */ event) => {
            event.preventDefault();
            // Entrée dans le champ « Autre durée » : on règle la durée, sans démarrer.
            if (editable) applyCustom();
          }}
        >
          ${editable &&
          html`<div class="timer__custom" key="custom">
            <input
              ref=${customInput}
              class="timer__custom-input"
              type="text"
              inputmode="text"
              autocomplete="off"
              aria-label="Autre durée"
              placeholder="ex. 7:30"
              aria-invalid=${customError ? 'true' : undefined}
              aria-describedby=${customError ? `timer-error-${instanceId}` : undefined}
              onInput=${() => customError && setCustomError('')}
            />
          </div>`}
          <button type="button" class="btn btn--primary timer__primary" key="primary" onClick=${primary.run}>${primary.text}</button>
          ${(status === 'running' || status === 'paused') &&
          html`<button type="button" class="btn btn--secondary timer__secondary" key="secondary" onClick=${onReset}>Réinitialiser</button>`}
          ${status === 'done' && html`<button type="button" class="btn btn--secondary timer__secondary" key="secondary" onClick=${onReset}>OK</button>`}
        </form>
        ${customError && html`<p class="timer__error" id=${`timer-error-${instanceId}`} role="alert">${customError}</p>`}
      </div>
      <p class="visually-hidden" role="status" aria-live="assertive" data-testid="timer-live">${announcement}</p>
    </div>
  `;
}
