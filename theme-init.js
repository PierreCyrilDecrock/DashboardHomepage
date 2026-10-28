// Applique le thème choisi AVANT le premier affichage, pour éviter le flash.
//
// Script classique, EXTERNE et synchrone (jamais en ligne : la politique de
// sécurité de GitHub Pages et des extensions l'interdit). Le stockage de
// l'application est asynchrone ; le thème est donc recopié dans localStorage
// sous la clé « dash:theme-mirror » à chaque changement (src/core/storage).
//
// Avec le miroir absent ou « system », on ne pose rien : la préférence du
// système s'applique par @media (prefers-color-scheme) dans styles/theme.css.
//
// Avec src/core/storage, c'est le seul fichier autorisé à lire localStorage.
(function () {
  try {
    var theme = localStorage.getItem('dash:theme-mirror');
    if (theme === 'light' || theme === 'dark') {
      document.documentElement.setAttribute('data-theme', theme);
    }
  } catch (e) {
    /* stockage refusé : on garde le thème du système */
  }
})();
