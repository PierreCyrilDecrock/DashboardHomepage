// Composant du widget Heure. Il ne connaît que ses props (réglages, taille) et le hook useNow.

import { html } from '../../lib/vendor.js';
import { useNow } from '../../lib/useNow.js';
import { cityFromTimeZone, dayDifferenceLabel, formatDate, formatGreeting, formatTimeParts, hourIn } from './clockLogic.js';

/** Hauteur minimale (en lignes de grille) à partir de laquelle les fuseaux secondaires sont affichés. */
export const MIN_ROWS_FOR_ZONES = 3;

/**
 * Heure en trois parties : l'essentiel, les secondes (plus petites, atténuées) et AM/PM.
 * @param {{ parts: { main: string, seconds: string, period: string } }} props
 */
function TimeText({ parts }) {
  return html`${parts.main}${parts.seconds && html`<span class="clock__small">${parts.seconds}</span>`}${parts.period &&
  html`<span class="clock__small clock__period"> ${parts.period}</span>`}`;
}

/**
 * Largeur approximative de l'heure, en « em » de la police DM Mono (0,6 em par caractère ;
 * secondes et AM/PM à moitié taille) : sert à la faire tenir dans la largeur du widget.
 * @param {{ main: string, seconds: string, period: string }} parts
 */
export function timeEmWidth(parts) {
  const chars = parts.main.length * 0.6 + (parts.seconds.length + (parts.period ? parts.period.length + 1 : 0)) * 0.6 * 0.5;
  return Math.round(chars * 105) / 100;
}

/**
 * @param {import('../types.js').WidgetProps<typeof import('./schema.js').defaultSettings, Record<string, never>>} props
 */
export function ClockWidget({ settings, size }) {
  const { timeFormat, showSeconds, showDate, showGreeting, userName } = settings;
  const now = useNow(showSeconds ? 'second' : 'minute');
  const options = { timeFormat, showSeconds };

  const parts = formatTimeParts(now, undefined, options);
  const zones = size.h >= MIN_ROWS_FOR_ZONES ? settings.secondaryZones : [];
  // Au-delà de deux fuseaux, la liste défile plutôt que de rapetisser l'heure.
  const lines = (showGreeting ? 1 : 0) + (showDate ? 1 : 0) + Math.min(zones.length, 2);

  return html`
    <div class="clock" style=${`--clock-em-width:${timeEmWidth(parts)};--clock-lines:${lines}`}>
      ${showGreeting && html`<p class="clock__greeting">${formatGreeting(hourIn(now, undefined), userName)}</p>`}
      <time class="clock__time" dateTime=${now.toISOString()}><${TimeText} parts=${parts} /></time>
      ${showDate && html`<p class="clock__date">${formatDate(now, undefined)}</p>`}
      ${zones.length > 0 &&
      html`<ul class="clock__zones" aria-label="Fuseaux horaires" tabindex=${zones.length > 2 ? 0 : undefined}>
        ${zones.map((zone) => {
          const shift = dayDifferenceLabel(now, zone.timeZone, undefined);
          return html`<li class="clock__zone" key=${zone.timeZone}>
            <span class="clock__zone-label">${zone.label.trim() || cityFromTimeZone(zone.timeZone)}</span>
            <span class="clock__zone-time">
              ${shift && html`<span class="clock__shift">${shift}</span>`}
              <time dateTime=${now.toISOString()}><${TimeText} parts=${formatTimeParts(now, zone.timeZone, options)} /></time>
            </span>
          </li>`;
        })}
      </ul>`}
    </div>
  `;
}
