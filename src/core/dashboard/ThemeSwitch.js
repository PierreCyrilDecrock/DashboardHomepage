// Sélecteur de thème de la barre d'outils : trois boutons (Clair, Sombre, Système), le choisi
// porte aria-pressed. Le choix est enregistré dans l'état ; theme.js l'applique à <html> et le
// recopie dans le miroir lu par theme-init.js.

import { html } from '../../lib/vendor.js';
import { Icon } from '../../ui/icons.js';
import { dashboardStore } from '../store/dashboardStore.js';
import { useStore } from '../store/useStore.js';

/** @type {Array<{ value: import('../types.js').Theme, label: string, icon: string }>} */
export const THEME_CHOICES = [
  { value: 'light', label: 'Clair', icon: 'sun' },
  { value: 'dark', label: 'Sombre', icon: 'moon' },
  { value: 'system', label: 'Système', icon: 'monitor' },
];

export function ThemeSwitch() {
  const theme = useStore(dashboardStore, (state) => state.theme);
  return html`
    <div class="theme-switch" role="group" aria-label="Thème">
      ${THEME_CHOICES.map(
        (choice) => html`<button
          type="button"
          class="theme-switch__button"
          key=${choice.value}
          aria-label=${choice.label}
          aria-pressed=${theme === choice.value ? 'true' : 'false'}
          onClick=${() => dashboardStore.setTheme(choice.value)}
        >
          <${Icon} name=${choice.icon} size=${18} />
          <span class="theme-switch__text">${choice.label}</span>
        </button>`,
      )}
    </div>
  `;
}
