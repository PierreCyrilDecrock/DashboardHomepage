// Composant du widget de démonstration. Il ne connaît que ses props.

import { html, useRef, useState } from '../../lib/vendor.js';
import { isDevMode } from '../../lib/devMode.js';

/**
 * @param {import('../types.js').WidgetProps<{ label: string }, { count: number }>} props
 */
export function DemoWidget({ settings, data, updateData }) {
  const dev = isDevMode();
  const [crash, setCrash] = useState(false);
  // Compteur de rendus, visible en mode développement : il montre qu'un autre widget
  // qui change ne redessine pas celui-ci.
  const renders = useRef(0);
  renders.current += 1;

  if (crash) throw new Error('Erreur provoquée volontairement par le widget de démonstration.');

  return html`
    <div class="demo">
      <p class="demo__label">${settings.label}</p>
      <p class="demo__count" aria-live="polite" data-testid="demo-count">${data.count}</p>
      <div class="demo__actions">
        <button type="button" class="demo__button" onClick=${() => updateData((d) => ({ ...d, count: d.count + 1 }))}>+1</button>
        <button type="button" class="demo__button" onClick=${() => updateData((d) => ({ ...d, count: 0 }))}>Remise à zéro</button>
        ${dev &&
        html`<button type="button" class="demo__button demo__button--danger" onClick=${() => setCrash(true)}>Provoquer une erreur</button>`}
      </div>
      ${dev && html`<p class="demo__renders">Rendus : <span data-testid="demo-renders">${renders.current}</span></p>`}
    </div>
  `;
}
