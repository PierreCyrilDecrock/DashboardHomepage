// Liste des widgets disponibles : un nom de dossier de src/widgets par ligne.
//
// C'est le SEUL fichier à modifier pour enregistrer un widget : créer le dossier
// src/widgets/<type>/ (avec index.js qui exporte « definition »), puis ajouter son nom ici.
// Le test du manifeste vérifie que cette liste et les dossiers correspondent.

/** @type {string[]} */
export default [
  'clock', // Heure et date, fuseaux secondaires
  'notes', // Notes à onglets
  'shortcuts', // Grille de liens favoris
  'timer', // Minuteur et alarme
  'todo', // Liste de tâches
];
