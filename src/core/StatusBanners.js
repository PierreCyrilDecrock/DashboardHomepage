// Bandeaux d'information sur l'état du stockage. Discrets, au-dessus du dashboard.
// Chaque bandeau qui concerne les données offre l'accès à la sauvegarde.

import { html } from '../lib/vendor.js';
import { statusStore } from './store/statusStore.js';
import { uiStore } from './store/uiStore.js';
import { useStore } from './store/useStore.js';

/** Bouton qui ouvre la boîte « Exporter ». */
const exportButton = () =>
  html`<button type="button" class="banner__button" onClick=${() => uiStore.openDialog('export')}>Sauvegarder maintenant</button>`;

/**
 * Phrase décrivant ce qui a été réinitialisé au démarrage.
 * @param {import('./store/statusStore.js').ResetNotice} notice
 */
export function describeResetNotice(notice) {
  /** @type {string[]} */
  const parts = [];
  if (notice.state) parts.push('la disposition enregistrée était invalide : elle a été remplacée par une disposition vide ; l\'ancien contenu est gardé dans dash:backup:state');
  const n = notice.instanceIds.length;
  if (n > 0) {
    parts.push(
      `${n === 1 ? 'les données d\'un widget étaient invalides' : `les données de ${n} widgets étaient invalides`} : elles ont été remplacées par les valeurs par défaut ; l'ancien contenu est gardé dans ${notice.instanceIds
        .slice(0, 3)
        .map((id) => `dash:backup:${id}`)
        .join(', ')}${n > 3 ? ` et ${n - 3} autre${n - 3 > 1 ? 's' : ''}` : ''}`,
    );
  }
  const text = parts.join(' ; ');
  return text.charAt(0).toUpperCase() + text.slice(1) + '.';
}

export function StatusBanners() {
  const status = useStore(statusStore);
  const notice = status.resetNotice;
  if (!status.storageUnavailable && !status.storageFull && !status.readOnly && !notice) return null;

  return html`
    <div class="banners">
      ${status.storageUnavailable &&
      html`<p class="banner" role="status" data-testid="banner-unavailable">
        <strong>Stockage indisponible : rien ne sera conservé.</strong>
        Le navigateur refuse d'enregistrer des données (navigation privée stricte ?). Tes modifications seront perdues à la fermeture de la page.
        ${exportButton()}
      </p>`}
      ${status.storageFull &&
      html`<p class="banner" role="alert" data-testid="banner-full">
        <strong>Stockage plein.</strong>
        Les dernières modifications n'ont pas pu être enregistrées. Libère de la place ou exporte ta configuration.
        ${exportButton()}
      </p>`}
      ${status.readOnly &&
      html`<p class="banner" role="status" data-testid="banner-readonly">
        <strong>Lecture seule.</strong>
        Ces données ont été enregistrées par une version plus récente de l'application : rien ne sera modifié. Tu peux quand même les exporter.
        ${exportButton()}
      </p>`}
      ${notice &&
      html`<p class="banner" role="status" data-testid="banner-reset">
        <strong>Des données invalides ont été réinitialisées.</strong>
        ${describeResetNotice(notice)}
        <button type="button" class="banner__button" onClick=${() => statusStore.setState({ resetNotice: null })}>Fermer</button>
      </p>`}
    </div>
  `;
}
