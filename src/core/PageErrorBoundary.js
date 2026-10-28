// Barrière d'erreur de la page entière : si l'application elle-même plante (hors d'un widget, qui a
// sa propre barrière), on affiche un message clair avec un bouton de rechargement et l'accès à la
// sauvegarde, sans dépendre des stores ni des boîtes de dialogue qui ont peut-être causé l'erreur.

import { Component, html, useState } from '../lib/vendor.js';

/**
 * Bloc de sauvegarde, affiché à la demande. Le module de sauvegarde est chargé à ce moment-là : si
 * l'application a planté, on ne dépend pas de lui tant que personne n'en a besoin.
 */
function SaveAccess() {
  const [shown, setShown] = useState(false);
  const [loaded, setLoaded] = useState(/** @type {null | { text: string, failure: string, BackupActions: any }} */ (null));
  const show = async () => {
    setShown(true);
    try {
      const { BackupActions, currentBackupText } = await import('./backup/BackupDialog.js');
      let text = '';
      let failure = '';
      try {
        text = currentBackupText();
      } catch (err) {
        failure = /** @type {Error} */ (err).message;
      }
      setLoaded({ text, failure, BackupActions });
    } catch (err) {
      setLoaded({ text: '', failure: /** @type {Error} */ (err).message, BackupActions: null });
    }
  };
  if (!shown) return html`<button type="button" class="btn btn--secondary" onClick=${show}>Sauvegarder mes données</button>`;
  if (loaded === null) return html`<p role="status">Préparation de la sauvegarde…</p>`;
  if (loaded.failure) return html`<p class="backup__error" role="alert">La sauvegarde n'a pas pu être préparée : ${loaded.failure}. Tes données restent dans le navigateur.</p>`;
  return html`<${loaded.BackupActions} getText=${() => loaded.text} rows=${6} />`;
}

export class PageErrorBoundary extends Component {
  /** @param {any} props */
  constructor(props) {
    super(props);
    /** @type {{ error: Error | null }} */
    this.state = { error: null };
  }

  /** @param {Error} error */
  static getDerivedStateFromError(error) {
    return { error };
  }

  /** @param {Error} error */
  componentDidCatch(error) {
    console.error('L\'application a rencontré une erreur :', error);
  }

  render() {
    const { error } = this.state;
    if (error === null) return this.props.children;
    return html`
      <main class="app page-error" role="alert" data-testid="page-error">
        <h1 class="page-error__title">Dashboard Homepage a rencontré une erreur</h1>
        <p>Ta configuration est toujours enregistrée dans ce navigateur. Recharge la page ; si l'erreur revient, sauvegarde tes données avant de continuer.</p>
        <p class="page-error__message">${error.message || String(error)}</p>
        <div class="page-error__actions">
          <button type="button" class="btn btn--primary" onClick=${() => location.reload()}>Recharger la page</button>
          <${SaveAccess} />
        </div>
      </main>
    `;
  }
}
