# Changelog

## 0.1.0 — MVP

Première version complète (phases 0 à 11) : dashboard à grille, cinq widgets (Heure, À faire, Notes, Raccourcis,
Minuteur), thème, sauvegarde, raccourcis clavier, publication sur GitHub Pages. Le détail par phase est ci-dessous.

### Phase 11 — Tests, accessibilité, publication
- Couverture : `tools/coverage.mjs` (script `npm run test:coverage`) échoue si un fichier de logique pure
  (`src/lib`, `src/core/storage`, `src/core/backup`, `src/core/shortcuts`, `*Logic.js`) passe sous 80 % de lignes.
  Résultat : 98 % en moyenne sur 33 fichiers. Les composants d'interface et les deux hooks d'horloge sont couverts
  par les parcours navigateur.
- Parcours `tests/e2e/phase11.mjs` : (a) deux listes À faire, (b) déplacer et redimensionner au clavier, (c) Notes puis
  rechargement immédiat, (d) export → vidage des clés `dash:` → import, (e) minuteur d'une minute (`page.clock`),
  (f) raccourci valide et `javascript:alert(1)` refusé, (g) thème sombre persistant ; rendus (avec 20 widgets, saisir dans
  Notes ne refait le rendu d'aucun autre : compteurs `window.__dash.renders` en mode `?dev=1`) ; stockage (seules des
  clés `dash:`, jamais `localStorage.clear()`). `phase11-subfolder.mjs` : le site servi sous `/dashboard-homepage/`.
  `npm run e2e` lance tous les parcours.
- Accessibilité (`phase11-a11y.mjs`) : axe-core (WCAG A et AA, bonnes pratiques) en thème clair et sombre sur le
  dashboard vide, les cinq widgets, le mode édition, le catalogue, les réglages et les dialogues ; parcours au clavier
  (focus visible, aucun piège, retour du focus) ; zoom 200 % et 400 % ; `prefers-reduced-motion`.
  Correction : une tuile de Raccourcis avec noms affichés n'a plus d'`aria-label` qui divergeait du texte visible.
- Performance : panneaux (catalogue, réglages, renommage, aide, préférences, sauvegarde), panneaux de réglages des
  widgets et formulaire de raccourci chargés à la demande (`src/ui/lazy.js`, `src/core/lazyPanels.js`), préchargés
  quand le navigateur est inactif. Premier affichage : 91 modules, 243,7 Ko compressés (266,8 Ko avant). L'export ajoute
  un `<link rel="modulepreload">` par module du premier affichage (`tools/graph.mjs`) : la cascade de 12 niveaux
  d'imports disparaît. `node tools/report.mjs` donne le rapport ; `phase11-perf.mjs` le mesure.
- Export : `<meta name="referrer" content="no-referrer">`, `serve --base` (le site n'existe que sous le sous-dossier),
  règle `platform-api` de `tools/check.mjs` (pas de `Notification` ni d'`AudioContext` hors `src/lib/platform`).
- Publication : `.github/workflows/pages.yml` (tests, contrôle, export, déploiement Pages),
  `docs/PUBLISH.md`, `docs/POST_PUBLISH_CHECKLIST.md`, `docs/ACCESSIBILITY_CHECKLIST.md`.
- README complet, version 0.1.0 dans `package.json`.

### Phase 10 — Thème, sauvegarde, raccourcis clavier, finitions
- État : version 2 avec `preferences: { singleKeyShortcuts }` (vrai par défaut). Migration 1 → 2 sans
  perte (`migrations.js`), schéma Zod, tests ; un état de version 3 ou plus reste en lecture seule.
- Thème : sélecteur Clair / Sombre / Système dans la barre d'outils (`aria-pressed`). `theme-init.js`
  (script externe chargé en premier, placé dans le `head` par l'export) applique le thème avant l'affichage
  en lisant seulement le miroir `dash:theme-mirror` : pas de flash. Contrastes AA vérifiés dans les deux
  thèmes (`tools/theme.test.js`) ; l'accent clair est un peu plus foncé (#b73c09).
- Sauvegarde (`src/core/backup/`) : menu « Sauvegarde » (Exporter, Importer, Réinitialiser le dashboard).
  Export JSON `{ app, exportVersion, exportedAt, state, data }` à télécharger ou à copier (repli : texte
  sélectionné). Import d'un fichier `.json` (10 Mo au plus) ou de texte collé, validation Zod, refus des
  versions plus récentes, résumé avant remplacement, types inconnus conservés, données orphelines
  retirées, annulation pendant la session. Réinitialisation confirmée, limitée aux clés `dash:`.
- Raccourcis globaux (`src/core/shortcuts/`) : E (édition), A (catalogue), ? (aide), Échap (ferme le
  panneau ou la boîte de dialogue, puis quitte l'édition). Jamais dans un champ de saisie ni avec
  Ctrl / Cmd / Alt ; les raccourcis à une touche se désactivent dans « Préférences ».
- État vide : « Commencer avec une disposition type » (Heure, À faire, Minuteur, Notes, Raccourcis).
- Finitions : widget de démonstration retiré (conservé comme fixture des tests e2e), bandeaux discrets
  (stockage indisponible ou plein, lecture seule, données invalides réinitialisées), barrière d'erreur de
  la page avec rechargement et accès à la sauvegarde, titre et icône de page, `docs/ADDING_A_WIDGET.md`.
- `tests/e2e/phase10.mjs` : thème sans flash, export → vidage → import, refus d'imports invalides,
  raccourcis, disposition de départ, migration, bandeaux, barrière d'erreur, 390 / 768 / 1440 px.

### Phase 9 — Widget Minuteur
- `src/widgets/timer/` : minuteur (type `timer`, 3×3, minimum 2×2, catégorie Temps). Affichage du temps
  en grand (unités de conteneur : il suit la taille du widget sans dépasser), libellé facultatif, barre
  de progression fine, durées prédéfinies (`aria-pressed`), champ « Autre durée » (`5`, `5:30`,
  `1:05:00` ; de 1 seconde à 24 heures ; Entrée applique sans démarrer ; durée invalide : message
  relié au champ, pas de démarrage). Un seul bouton principal (Démarrer / Pause / Reprendre / Relancer)
  qui garde le focus quand l'état change, et Réinitialiser / OK. Durées modifiables seulement au repos
  ou après la fin.
- Fin : trois bips si l'option est active, notification si l'option est active, annonce vocale
  « Minuteur terminé » (`aria-live="assertive"`), « Terminé à 14:32 », clignotement doux désactivé par
  `prefers-reduced-motion`. Si la fin a eu lieu pendant que la page était fermée : le message
  s'affiche, mais ni son, ni notification, ni animation.
- `src/lib/countdown.js` (pur, testé) : états repos / en marche (`endsAt`) / en pause (`remainingMs`) /
  terminé (`finishedAt`), `settle` idempotent, `isLate`, `formatDuration`, `parseDurationInput`,
  `advance` (une seule fin par échéance). `countdownSchema.js` : schéma Zod de l'état.
- `src/lib/useCountdown.js` : le temps restant se déduit toujours de l'heure de fin (jamais d'un compteur
  décrémenté) ; un seul minuteur interne de 250 ms, actif seulement en marche ; resynchronisation
  immédiate au retour sur l'onglet (`visibilitychange`).
- `src/lib/alarmSound.js` (3 bips sinusoïdaux de 880 Hz) ; `src/lib/platform/alarmService.js`
  (interface : `primeAudio`, `playAlarm`, `requestPermission`, `getPermissionState`, `notify`,
  `scheduleCompletion`, `cancelCompletion`) et `webAlarmService.js` : verrous Web Locks
  `dash-alarm:<clé>` pour qu'une alarme ne sonne qu'une fois même avec plusieurs onglets ; l'audio est
  préparé au clic sur Démarrer ; la permission de notification n'est demandée que par un clic explicite.
- `src/lib/tabTitle.js` : le titre de l'onglet affiche le minuteur qui se termine en premier
  (« 04:12 · Minuteur ») et se restaure quand plus aucun n'est en marche.
- Réglages : libellé, 1 à 4 durées prédéfinies (1 à 600 minutes, valeurs contrôlées), son,
  notification avec état de la permission (autorisées, refusées, non demandées, non disponibles ici),
  bouton « Activer les notifications » et explication pour réactiver quand elles sont refusées.
- Manifeste : `timer` ajouté après `shortcuts`.

### Phase 8 — Widget Raccourcis
- `src/widgets/shortcuts/` : grille de liens favoris (type `shortcuts`, 4×3, catégorie Liens). Chaque
  raccourci est un vrai lien `<a href>` (`rel="noopener noreferrer"`, `target="_blank"` seulement si
  l'option est active ; Ctrl / Cmd + clic natif). Tuile de 52 px (lettre initiale sur la couleur du
  domaine, nom sur une ligne coupée par « … »), tuile finale « Ajouter », état vide avec
  « Ajouter un raccourci ». Formulaire (Dialog) : Adresse (focus automatique) et Titre facultatif,
  erreurs en français reliées au champ (`aria-describedby`), avertissement non bloquant en cas de
  doublon. Maximum 60 raccourcis par widget.
- Bouton « Organiser » (mode local, jamais enregistré) : les tuiles deviennent des boutons avec
  Modifier, Supprimer, Monter, Descendre ; glisser-déposer SortableJS (souris et toucher, nœud remis
  en place puis `reorderLinks` par `updateData`) ; Alt + flèches au clavier. Suppression avec barre
  locale « Raccourci supprimé — Annuler » pendant 6 s.
- Réglages : nouvel onglet, noms, taille des tuiles (petites, moyennes, grandes) et icônes
  (« Lettre initiale » par défaut ; « Icônes du site » avec l'avertissement « Les noms de domaine sont
  envoyés à Google pour récupérer les icônes. »). Sans ce choix, aucune requête d'icône n'est faite ;
  une image qui échoue retombe sur la lettre.
- `src/lib/url.js` : `normalizeUrl` (seules les adresses http et https passent ; https:// ajouté ;
  javascript:, data:, file:, ftp: refusés ; hôte avec un point, localhost ou IP ; pas d'identifiants
  dans l'adresse), `isHttpUrl` (garde pour les données relues : un `javascript:` glissé dans
  localStorage invalide les données et n'est jamais affiché comme lien), `getDomain`, `getDefaultTitle`.
- `src/lib/platform/favicon.js` : `getFaviconUrl(domain)`, seul fichier qui connaît le service d'icônes.
- Thème : `--tile-1` à `--tile-8` et `--tile-text` (clair et sombre), contraste AA vérifié par
  `tools/theme.test.js`.
- `shortcutsLogic.js` (pur, testé) : `addLink`, `updateLink`, `removeLink` / `restoreLink`,
  `reorderLinks`, `moveLink`, `getInitial`, `getTileIndex` (hachage FNV-1a stable du domaine).
- Politique de sécurité de l'export : `img-src` accepte aussi `https://*.gstatic.com`, vers où le
  service d'icônes redirige. Parcours `tests/e2e/phase8.mjs`.

### Phase 7 — Widget Notes
- `src/widgets/notes/` : bloc-notes à onglets (type `notes`, 5×4, catégorie Organisation). Onglets
  `tablist` / `tab` / `tabpanel` (flèches, Début, Fin ; tabindex itinérant), défilement horizontal
  avec onglet actif toujours visible, « + » (« Nouvelle note ») qui donne le focus à la zone de
  saisie. Renommer : double-clic ou « Renommer » (Entrée valide, Échap annule, la perte de focus
  valide, titre vide = retour au titre déduit de la première ligne, 40 caractères).
- Saisie : aucune minuterie dans le widget, chaque frappe appelle `updateData` ; la persistance du
  cœur regroupe les écritures (300 ms) et les force à `visibilitychange` / `pagehide`. Tab n'est pas
  piégé dans la zone de saisie. Affichage « Modifiée à 14:32 », compteur à partir de 90 % des
  50 000 caractères, texte brut uniquement.
- Suppression d'une note avec barre locale « Note supprimée — Annuler » pendant 6 s, sans
  confirmation bloquante ; état vide avec « Créer une note ». Réglages : taille du texte, police à
  chasse fixe, correction orthographique.
- `notesLogic.js` (pur, testé) : `deriveTitle`, `getDisplayTitle`, `createNote`, `updateContent`,
  `renameNote`, `deleteNote` / `restoreNote`, `nextTabIndex`, `formatModified`. Schéma Zod tolérant.
  Seule modification hors du dossier : une ligne dans `manifest.js`. Parcours
  `tests/e2e/phase7.mjs` (dont rafale de 200 frappes : une seule écriture mesurée).

### Phase 6 — Widget À faire
- `src/widgets/todo/` : liste de tâches (type `todo`, 4×4, catégorie Organisation). Compteur « 3 / 6 »
  et barre de progression, filtres Toutes / À faire / Terminées, ajout par Entrée (le champ garde
  le focus), modification (double-clic ou « Modifier », Entrée valide, Échap annule, la perte de
  focus valide), suppression avec barre locale « Annuler » pendant 6 s, « Vider les terminées »,
  texte toujours affiché en texte brut. Réglages : progression, terminées en bas.
- Réordonnancement : SortableJS (souris et toucher, poignée) avec remise du nœud à sa place puis
  `reorderTasks` par `updateData` ; au clavier Alt + flèche haut / bas sur la poignée, annoncé dans
  la zone `aria-live`. Désactivé sous filtre. Avec « terminées en bas », on se déplace dans le groupe.
- `todoLogic.js` (pur, testé) : `addTask`, `toggleTask`, `editTask`, `removeTask` / `restoreTask`,
  `reorderTasks`, `moveTask`, `clearDone`, `getVisibleTasks`, `getStats`.
- Schéma Zod tolérant aux champs inconnus (`looseObject`). Parcours `tests/e2e/phase6.mjs`
  (dont 150 tâches).

### Phase 5 — Widget Heure
- `src/widgets/clock/` : heure (24 h / 12 h, secondes facultatives, police DM Mono mise à l'échelle
  avec les unités de conteneur), date en français, salutation avec prénom, jusqu'à 4 fuseaux
  secondaires (libellé ou ville déduite, « +1 j » / « −1 j »), masqués sous 3 lignes de haut.
  Aucune donnée propre. Seule modification hors du dossier : une ligne dans `manifest.js`.
- `clockLogic.js` (pur, testé) : `formatTime`, `formatDate`, `getGreeting`, `isValidTimeZone`,
  `getTimeZoneChoices` (repli sur une courte liste), formateurs Intl mis en cache.
- `src/lib/ticks.js` et `src/lib/useNow.js` : minuteur calé sur le début de la seconde (ou de la
  minute), relecture de `Date.now()` à chaque top, resynchronisation au retour sur l'onglet
  (`visibilitychange`), un minuteur par appel.
- Panneau de réglages : interrupteurs, prénom, fuseaux (recherche, nom, retrait, refus d'un
  fuseau invalide, maximum 4).
- Test du registre rendu indépendant de la liste des widgets. Parcours `tests/e2e/phase5.mjs`
  avec `page.clock`.

### Phase 4 — Catalogue, instances multiples et réglages
- Composants `src/ui` : `Button` (primary, secondary, ghost, danger), `Dialog` et `Drawer`
  (`Modal.js` : piège de focus, Échap, retour du focus), `Toast` (avec action), `Toggle`, `Field`.
  Aucune boîte de dialogue du navigateur.
- `src/core/dashboard/actions.js` : `addWidget`, `duplicateInstance` (titre « (copie) », données
  clonées, placée sous l'original), `removeInstance` / `restoreInstance` (copie gardée 8 s),
  `renameInstance`, `updateInstanceSettings` (validé par `settingsSchema`), `resetInstanceSettings`.
- `dashboardStore` : `findInstance`, `insertInstance`, `replaceInstanceSettings`.
- Catalogue (`WidgetCatalog.js`, `catalogLogic.js`) : panneau latéral, groupes par catégorie,
  recherche insensible aux accents, compteur « N sur le dashboard », focus sur le widget ajouté.
- Menu « … » de chaque widget (`WidgetMenu.js`) : Renommer, Réglages, Dupliquer, Supprimer ;
  clavier complet. Suppression sans confirmation bloquante : toast « Widget supprimé » + « Annuler ».
- `RenameDialog.js`, `SettingsDrawer.js` (réglages appliqués immédiatement, « Réinitialiser »),
  `ToastHost.js`, `toastStore`, `uiStore` (catalogue, réglages, renommage).
- Démo : panneau de réglages (libellé). Bouton de développement « Ajouter une démo » retiré.
- Parcours `tests/e2e/phase4.mjs`, entièrement au clavier.

### Phase 3 — Grille du dashboard et mode édition
- `layoutUtils.js` (logique pure : `toGridItems`, `fromGridNodes`, `moveBy`, `resizeBy`) et `uiStore`
  (mode édition, non sauvegardé ; Échap le quitte).
- `Dashboard.js` : GridStack (12 colonnes, lignes de 80 px, 20 px entre widgets, compactage
  vertical, une colonne sous 700 px), un `WidgetFrame` Preact par élément. Seul fichier qui
  importe `vendor/gridstack.js`. La disposition n'est enregistrée qu'à la fin d'un geste, et
  jamais en mode une colonne.
- `WidgetFrame` : mode édition (contour en pointillés, poignée focalisable, contenu inerte),
  flèches pour déplacer, Maj + flèches pour redimensionner, position annoncée (`aria-live`).
  Les widgets indisponibles ont aussi une barre de titre et une poignée.
- `Toolbar.js` (« Modifier la disposition » / « Terminer »), état vide, `styles/grid.css`.
- Démo : taille par défaut 3×4. Parcours `tests/e2e/phase3.mjs`.

### Phase 2 — Contrat de widget, registre et cadre
- `src/widgets/types.js` : le contrat (`WidgetDefinition`, `WidgetProps`) et `defineWidget`, qui
  refuse une définition incomplète avec UNE erreur listant tous les problèmes.
- `src/widgets/manifest.js` (seul fichier à modifier pour enregistrer un widget) et
  `registry.js` (`loadRegistry`, `getDefinition`, `listDefinitions`, `listByCategory`,
  `registryErrors`) : un widget défaillant ou en double est signalé sans bloquer les autres.
- Widget de démonstration `src/widgets/demo/` (compteur, supprimé en phase 10).
- `createInstance`, `WidgetFrame` (validation Zod, repli sur les valeurs par défaut avec copie
  dans `dash:backup:<id>`, barrière d'erreur, abonnement par instance), `UnknownWidget`,
  `reconcile` (migration, données invalides ou absentes).
- `dashboardStore.migrateInstance`, `src/lib/loadStyle.js`, `src/lib/devMode.js`.
- `main.js` charge le registre avec l'hydratation, puis réconcilie ; `App.js` affiche
  les instances en liste (temporaire) et, avec `?dev=1`, le bouton « Ajouter une démo ».
- Parcours `tests/e2e/phase2.mjs`.

### Phase 1 — Fondations
- Types JSDoc (`DashboardState`, `Page`, `WidgetInstance`, `StoredData`), clés `dash:*`.
- Interface `StorageAdapter` asynchrone, adaptateurs `localStorage` (clés préfixées, quota
  signalé par `StorageFullError`) et mémoire (repli).
- Schémas Zod, migrations de l'état, hydratation : état par défaut, copie de sauvegarde
  des données invalides, lecture seule pour une version plus récente.
- Stores `createStore`, `useStore` (sélecteurs fins), `dashboardStore`, `dataStore`, `statusStore`.
- Persistance regroupée (300 ms), une clé écrite par changement, écriture forcée à la
  fermeture, rechargement depuis un autre onglet.
- Thème appliqué à `<html>` et recopié dans `dash:theme-mirror` ; bandeaux d'état du stockage.
- `vendor/zod.js` en mode sans compilation (`jitless`) : pas de `new Function`, donc aucune
  violation de la politique de sécurité.
- Aide `?dev=1` (`window.__dash`), `tests/e2e/helpers.mjs` et parcours de la phase 1.

### Phase 0 — Initialisation
- Test de faisabilité de l'artefact (six hypothèses vérifiées).
- Arborescence du projet, `RULES.md`, `README.md`.
- Bibliothèques copiées dans `vendor/` : Preact 10.29.8, htm 3.1.1, Zod 4.6.6,
  GridStack 14.0.0, SortableJS 1.15.7, polices Instrument Sans et DM Mono.
- Icônes Lucide dans `src/ui/`.
- Outils : `serve`, `export`, `check`, `vendor`, avec leurs tests.
- Thème clair et sombre, polices auto-hébergées, `theme-init.js`.
