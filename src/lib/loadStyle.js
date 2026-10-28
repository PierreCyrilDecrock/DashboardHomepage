// Charge une feuille de style une seule fois, en ajoutant un <link> au <head>.
// Utilisé par le cadre de widget pour la feuille propre à chaque type de widget.

/**
 * @param {string | URL} url adresse de la feuille (ex. new URL('./style.css', import.meta.url))
 * @param {Document} [doc]
 * @returns {HTMLLinkElement | null} le <link> (nouveau ou déjà présent), null hors navigateur
 */
export function loadStyle(url, doc = globalThis.document) {
  if (!doc) return null;
  const href = new URL(String(url), doc.baseURI).href;
  for (const link of doc.querySelectorAll('link[rel="stylesheet"][data-widget-style]')) {
    if (/** @type {HTMLLinkElement} */ (link).href === href) return /** @type {HTMLLinkElement} */ (link);
  }
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.setAttribute('data-widget-style', '');
  doc.head.appendChild(link);
  return link;
}
