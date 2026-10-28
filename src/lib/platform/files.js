// Fichiers et presse-papiers : télécharger un texte, le copier, lire un fichier choisi par l'utilisateur.
//
// Seul fichier à connaître Blob, <a download> et navigator.clipboard (compatibilité avec
// l'extension de la phase 12). Dans l'aperçu d'un artefact, le téléchargement et la copie peuvent
// être refusés : les fonctions le disent par leur valeur de retour, jamais par une exception.

/**
 * Déclenche le téléchargement d'un texte sous forme de fichier.
 * Renvoie vrai si le navigateur a accepté de lancer le téléchargement ; ce n'est pas une preuve
 * que le fichier a été enregistré (l'aperçu d'un artefact peut l'ignorer sans le signaler).
 * @param {string} fileName
 * @param {string} text
 * @param {string} [type]
 * @param {Document} [doc]
 * @returns {boolean}
 */
export function downloadTextFile(fileName, text, type = 'application/json', doc = globalThis.document) {
  try {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = doc.createElement('a');
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    link.hidden = true;
    doc.body.append(link);
    link.click();
    link.remove();
    // Libère l'adresse un peu plus tard : certains navigateurs lisent le Blob après le clic.
    /** @type {any} */ (setTimeout(() => URL.revokeObjectURL(url), 10_000)).unref?.();
    return true;
  } catch {
    return false;
  }
}

/**
 * Copie un texte dans le presse-papiers. Renvoie faux si le navigateur refuse (l'appelant
 * propose alors de sélectionner le texte dans une zone de texte).
 * @param {string} text
 * @param {{ clipboard?: { writeText?: (text: string) => Promise<void> } | undefined }} [env]
 * @returns {Promise<boolean>}
 */
export async function copyText(text, env = { clipboard: globalThis.navigator?.clipboard }) {
  try {
    if (typeof env.clipboard?.writeText !== 'function') return false;
    await env.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Lit un fichier texte choisi par l'utilisateur.
 * @param {Pick<File, 'text' | 'size' | 'name'>} file
 * @returns {Promise<string>}
 */
export function readFileText(file) {
  return file.text();
}
