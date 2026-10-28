// Boîtes de dialogue de la sauvegarde : exporter, importer, réinitialiser.
//
// Un téléchargement n'est pas garanti dans l'aperçu d'un artefact : chaque proposition de
// sauvegarde offre donc deux gestes, « Télécharger le fichier » et « Copier la sauvegarde », et
// le texte est toujours visible dans une zone de texte (sélection manuelle si la copie est refusée).
// L'import accepte un fichier .json ou un texte collé. Rien n'est remplacé avant un clic explicite
// sur « Remplacer ma configuration », et l'ancienne configuration reste récupérable pendant la session.

import { copyText, downloadTextFile, readFileText } from '../../lib/platform/files.js';
import { html, useEffect, useRef, useState } from '../../lib/vendor.js';
import { Button } from '../../ui/Button.js';
import { Dialog } from '../../ui/Modal.js';
import { getDefinition } from '../../widgets/registry.js';
import { dashboardStore } from '../store/dashboardStore.js';
import { dataStore } from '../store/dataStore.js';
import { statusStore } from '../store/statusStore.js';
import { toastStore } from '../store/toastStore.js';
import { uiStore } from '../store/uiStore.js';
import { useStore } from '../store/useStore.js';
import { backupSession, getBackupDeps } from './backupContext.js';
import {
  MAX_IMPORT_BYTES,
  TOO_BIG_MESSAGE,
  buildExport,
  exportFileName,
  parseBackup,
  replaceConfiguration,
  resetConfiguration,
  restoreSnapshot,
  serializeExport,
  summarizeBackup,
} from './exportImport.js';

const READ_ONLY_MESSAGE = 'Lecture seule : ces données viennent d\'une version plus récente de l\'application. Rien ne peut être remplacé ni réinitialisé ici.';

/** Texte de la sauvegarde de la configuration actuelle. */
export function currentBackupText() {
  return serializeExport(buildExport(dashboardStore.getState(), dataStore.getState().byId));
}

/**
 * Annule le dernier remplacement ou la dernière réinitialisation (configuration d'avant, gardée en mémoire).
 * @returns {Promise<boolean>}
 */
export async function undoLastReplacement() {
  const { undo } = backupSession.getState();
  if (!undo) return false;
  try {
    await restoreSnapshot(getBackupDeps(), undo.snapshot);
    backupSession.setState({ undo: null });
    toastStore.show({ message: 'Configuration précédente rétablie' });
    return true;
  } catch (err) {
    toastStore.show({ message: `Annulation impossible : ${/** @type {Error} */ (err).message}` });
    return false;
  }
}

/** Retour de l'action d'un remplacement : mémorise l'annulation et prévient l'utilisateur. @param {string} message @param {import('./exportImport.js').ConfigurationSnapshot} previous */
function announceReplacement(message, previous) {
  backupSession.setState({ undo: { label: message, snapshot: previous } });
  toastStore.show({
    message,
    actionLabel: 'Annuler',
    duration: 10_000,
    focusAction: true,
    onAction: () => void undoLastReplacement(),
  });
}

/**
 * Les deux gestes de sauvegarde, avec leur retour : télécharger et copier, et une zone de texte
 * (lecture seule) pour copier à la main si le navigateur refuse.
 * @param {{ getText: () => string, rows?: number }} props
 */
export function BackupActions({ getText, rows = 6 }) {
  const [text] = useState(getText);
  const [message, setMessage] = useState('');
  const area = useRef(/** @type {HTMLTextAreaElement | null} */ (null));
  const fileName = exportFileName();

  const download = () => {
    const started = downloadTextFile(fileName, text);
    setMessage(
      started
        ? `Téléchargement lancé : ${fileName}. Si aucun fichier n'apparaît (c'est possible dans l'aperçu), utilise « Copier la sauvegarde ».`
        : 'Le navigateur refuse le téléchargement ici. Utilise « Copier la sauvegarde ».',
    );
  };
  const copy = async () => {
    if (await copyText(text)) {
      setMessage('Sauvegarde copiée dans le presse-papiers. Colle-la dans un fichier texte (.json) que tu conserves.');
      return;
    }
    // Repli : on sélectionne le texte pour que Ctrl + C (ou Cmd + C) le copie.
    area.current?.focus();
    area.current?.select();
    setMessage('La copie est refusée par le navigateur : le texte ci-dessous est sélectionné, copie-le avec Ctrl + C (Cmd + C sur Mac).');
  };

  return html`
    <div class="backup__actions">
      <div class="backup__buttons">
        <${Button} variant="secondary" icon="download" onClick=${download}>Télécharger le fichier<//>
        <${Button} variant="secondary" icon="copy" onClick=${copy}>Copier la sauvegarde<//>
      </div>
      <p class="backup__message" role="status" data-testid="backup-message">${message}</p>
      <label class="field__label" for="backup-text">Contenu de la sauvegarde</label>
      <textarea
        id="backup-text"
        class="input backup__text"
        readonly
        rows=${rows}
        spellcheck="false"
        ref=${area}
        data-testid="backup-text"
        onFocus=${(/** @type {Event} */ e) => /** @type {HTMLTextAreaElement} */ (e.currentTarget).select()}
        value=${text}
      ></textarea>
    </div>
  `;
}

// --- Exporter ----------------------------------------------------------------------------------

function ExportDialog() {
  const close = () => uiStore.closeDialog();
  return html`
    <${Dialog} title="Exporter la sauvegarde" onClose=${close} footer=${html`<${Button} variant="primary" onClick=${close}>Fermer<//>`}>
      <p class="backup__intro">
        La sauvegarde contient ta disposition, tes réglages et les données de tous tes widgets. Garde-la dans un endroit sûr : elle permet de
        tout retrouver avec « Importer ».
      </p>
      <${BackupActions} getText=${currentBackupText} rows=${8} />
    <//>
  `;
}

// --- Importer ----------------------------------------------------------------------------------

/** Nom affiché d'un type de widget (le type lui-même s'il est inconnu). @param {string} type */
function nameOfType(type) {
  return getDefinition(type)?.name ?? type;
}

function ImportDialog() {
  const readOnly = useStore(statusStore, (s) => s.readOnly);
  const [pasted, setPasted] = useState('');
  const [error, setError] = useState('');
  /** @type {[{ backup: import('./exportImport.js').Backup, ignoredDataIds: string[] } | null, Function]} */
  const [parsed, setParsed] = useState(/** @type {any} */ (null));
  const [busy, setBusy] = useState(false);
  const close = () => uiStore.closeDialog();

  // Le contenu de la boîte change d'étape sans la refermer : on replace le focus sur le nouveau contenu.
  const step = parsed === null ? 'choose' : 'summary';
  useEffect(() => {
    document.querySelector('.modal [data-autofocus]') instanceof HTMLElement && /** @type {HTMLElement} */ (document.querySelector('.modal [data-autofocus]')).focus();
  }, [step]);

  /** @param {string} text */
  const check = (text) => {
    const result = parseBackup(text);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError('');
    setParsed({ backup: result.backup, ignoredDataIds: result.ignoredDataIds });
  };

  /** @param {Event} event */
  const onFile = async (event) => {
    const input = /** @type {HTMLInputElement} */ (event.currentTarget);
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setError(TOO_BIG_MESSAGE);
      input.value = '';
      return;
    }
    try {
      check(await readFileText(file));
    } catch {
      setError('Ce fichier n\'a pas pu être lu.');
    }
    input.value = '';
  };

  const replace = async () => {
    if (!parsed || busy) return;
    setBusy(true);
    try {
      const { previous } = await replaceConfiguration(getBackupDeps(), parsed.backup);
      uiStore.closeDialog();
      announceReplacement('Configuration remplacée', previous);
    } catch (err) {
      setError(`Le remplacement a échoué : ${/** @type {Error} */ (err).message}`);
      setBusy(false);
    }
  };

  if (parsed) {
    const summary = summarizeBackup(parsed.backup, (type) => getDefinition(type) !== undefined);
    return html`
      <${Dialog}
        title="Remplacer ta configuration ?"
        onClose=${close}
        footer=${html`
          <${Button} variant="secondary" onClick=${() => setParsed(null)}>Retour<//>
          <${Button} variant="danger" disabled=${readOnly || busy} onClick=${replace} data-testid="import-replace">Remplacer ma configuration<//>
        `}
      >
        <p class="backup__intro" data-testid="import-summary" tabindex="-1" data-autofocus>
          Cette sauvegarde contient <strong>${summary.pages} ${summary.pages > 1 ? 'pages' : 'page'}</strong> et${' '}
          <strong>${summary.widgets} ${summary.widgets > 1 ? 'widgets' : 'widget'}</strong>${summary.exportedAt ? html` (exportée le ${new Date(summary.exportedAt).toLocaleString('fr-FR')})` : null}.
        </p>
        ${summary.byType.length > 0 &&
        html`<ul class="backup__types">
          ${summary.byType.map((t) => html`<li key=${t.type}>${nameOfType(t.type)} : ${t.count}</li>`)}
        </ul>`}
        ${summary.unknownTypes.length > 0 &&
        html`<p class="backup__warning" role="note" data-testid="import-unknown">
          Types de widgets inconnus de cette version : <strong>${summary.unknownTypes.join(', ')}</strong>. Ils seront conservés et
          afficheront « Widget indisponible » ; leurs données ne sont pas perdues.
        </p>`}
        ${parsed.ignoredDataIds.length > 0 &&
        html`<p class="backup__warning" role="note">${parsed.ignoredDataIds.length} donnée(s) sans widget correspondant seront ignorées.</p>`}
        <p class="backup__warning backup__warning--strong">
          Ta configuration actuelle sera <strong>remplacée</strong>. Tu pourras l'annuler jusqu'à la fermeture de cette page, mais le plus sûr est d'en
          faire d'abord une copie :
        </p>
        <${BackupActions} getText=${currentBackupText} rows=${4} />
        ${readOnly && html`<p class="backup__error" role="alert">${READ_ONLY_MESSAGE}</p>`}
        ${error && html`<p class="backup__error" role="alert">${error}</p>`}
      <//>
    `;
  }

  return html`
    <${Dialog}
      title="Importer une sauvegarde"
      onClose=${close}
      footer=${html`
        <${Button} variant="secondary" onClick=${close}>Annuler<//>
        <${Button} variant="primary" disabled=${pasted.trim() === ''} onClick=${() => check(pasted)} data-testid="import-check">Vérifier la sauvegarde<//>
      `}
    >
      <p class="backup__intro">Choisis un fichier de sauvegarde (.json, 10 Mo au plus) ou colle son contenu. Rien n'est remplacé avant ta confirmation.</p>
      ${readOnly && html`<p class="backup__error" role="alert">${READ_ONLY_MESSAGE}</p>`}
      <div class="field">
        <label class="field__label" for="import-file">Fichier de sauvegarde</label>
        <input id="import-file" class="input" type="file" accept=".json,application/json" onChange=${onFile} data-autofocus data-testid="import-file" />
      </div>
      <div class="field">
        <label class="field__label" for="import-text">Ou colle le texte de la sauvegarde</label>
        <textarea
          id="import-text"
          class="input backup__text"
          rows="6"
          spellcheck="false"
          value=${pasted}
          aria-invalid=${error ? 'true' : undefined}
          aria-describedby=${error ? 'import-error' : undefined}
          data-testid="import-text"
          onInput=${(/** @type {Event} */ e) => {
            setPasted(/** @type {HTMLTextAreaElement} */ (e.currentTarget).value);
            if (error) setError('');
          }}
        ></textarea>
      </div>
      ${error && html`<p class="backup__error" id="import-error" role="alert" data-testid="import-error">${error}</p>`}
    <//>
  `;
}

// --- Réinitialiser ------------------------------------------------------------------------------

function ResetDialog() {
  const readOnly = useStore(statusStore, (s) => s.readOnly);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const close = () => uiStore.closeDialog();

  const reset = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { previous } = await resetConfiguration(getBackupDeps());
      uiStore.closeDialog();
      announceReplacement('Dashboard réinitialisé', previous);
    } catch (err) {
      setError(`La réinitialisation a échoué : ${/** @type {Error} */ (err).message}`);
      setBusy(false);
    }
  };

  return html`
    <${Dialog}
      title="Réinitialiser le dashboard ?"
      onClose=${close}
      footer=${html`
        <${Button} variant="secondary" data-autofocus onClick=${close}>Annuler<//>
        <${Button} variant="danger" disabled=${readOnly || busy} onClick=${reset} data-testid="reset-confirm">Réinitialiser le dashboard<//>
      `}
    >
      <p class="backup__warning backup__warning--strong">
        Tous les widgets et toutes leurs données (tâches, notes, raccourcis, minuteurs) seront <strong>supprimés</strong>. Le thème et les préférences sont
        conservés. Tu pourras annuler jusqu'à la fermeture de cette page, mais le plus sûr est de faire d'abord une sauvegarde :
      </p>
      <${BackupActions} getText=${currentBackupText} rows=${4} />
      ${readOnly && html`<p class="backup__error" role="alert">${READ_ONLY_MESSAGE}</p>`}
      ${error && html`<p class="backup__error" role="alert">${error}</p>`}
    <//>
  `;
}

/** Affiche la boîte de dialogue de sauvegarde demandée (export, import ou réinitialisation). */
export function BackupDialog() {
  const name = useStore(uiStore, (s) => s.dialog);
  if (name === 'export') return html`<${ExportDialog} />`;
  if (name === 'import') return html`<${ImportDialog} />`;
  if (name === 'reset') return html`<${ResetDialog} />`;
  return null;
}
