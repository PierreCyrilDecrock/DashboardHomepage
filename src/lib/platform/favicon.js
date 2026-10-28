// Icônes de sites. C'est le SEUL fichier qui connaît le service qui les fournit : la phase 12
// (extension navigateur) le remplacera par une source locale du navigateur.
//
// Confidentialité : appeler ce service envoie le nom de domaine à Google. Le widget Raccourcis ne
// l'appelle que si l'utilisateur a choisi « Icônes du site » ; par défaut, aucune requête n'est faite.

export const FAVICON_SERVICE_NAME = 'Google';

/**
 * Adresse de l'icône d'un site.
 * @param {string} domain nom de domaine seul (« github.com »), sans protocole ni chemin
 * @returns {string}
 */
export function getFaviconUrl(domain) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}
