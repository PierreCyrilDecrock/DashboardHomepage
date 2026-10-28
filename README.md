# Dashboard Homepage

Page d'accueil de navigateur personnalisable : un dashboard où l'on choisit ses widgets, les place, les
redimensionne et retrouve ses données à chaque ouverture. **Tout est local** (aucun serveur, aucun compte,
aucun suivi) et il n'y a **aucune étape de build** : les fichiers de ce dossier sont les sources, et ce
sont eux qui sont publiés.

Version **0.1.0** (MVP, phases 0 à 11). Le plan complet est dans le document de développement du MVP.

## Ce que fait l'application
- Grille de 12 colonnes : glisser-déposer, redimensionnement, tout au clavier (flèches, Maj + flèches).
- Cinq widgets, en plusieurs exemplaires si on veut : **Heure** (fuseaux, salutation), **À faire**, **Notes** (onglets),
  **Raccourcis** (liens favoris), **Minuteur** (alarme, notification).
- Thème clair, sombre ou système, appliqué avant l'affichage (pas de flash).
- Sauvegarde : export / import en JSON, réinitialisation, annulation du dernier remplacement.
- Données dans le navigateur uniquement (`localStorage`, clés préfixées `dash:`).

## Raccourcis clavier
Hors d'un champ de saisie, et sans Ctrl / Cmd / Alt :

| Touche | Action |
| --- | --- |
| `E` | Entrer dans le mode édition de la disposition, ou en sortir |
| `A` | Ouvrir le catalogue de widgets |
| `?` | Afficher l'aide des raccourcis |
| `Échap` | Fermer le panneau ou la boîte de dialogue ouverte, puis quitter le mode édition |

Les raccourcis à une touche (`E`, `A`, `?`) se désactivent dans **Préférences** ; `Échap` reste actif.
En mode édition, sur la poignée d'un widget : flèches = déplacer, Maj + flèches = redimensionner.

## Contenu du dépôt

| Dossier ou fichier | Rôle |
| --- | --- |
| `index.html` | Fragment de page (celui de l'artefact) ; `tools/export.mjs` en fait un document complet |
| `theme-init.js` | Applique le thème avant l'affichage (script externe, lit seulement `dash:theme-mirror`) |
| `favicon.svg` | Icône de l'onglet |
| `styles/` | Variables de thème clair et sombre, mise en page, composants |
| `src/core/` | Le cœur : `storage/` (adaptateurs, migrations, hydratation), `store/`, `dashboard/` (grille, cadres, actions), `catalog/`, `settings/`, `backup/`, `shortcuts/` |
| `src/widgets/` | Un dossier par widget + `manifest.js` (la liste) et `registry.js` |
| `src/lib/`, `src/ui/` | Code partagé : logique pure, `platform/` (alarme, fichiers, icônes), composants d'interface |
| `vendor/` | Bibliothèques copiées (Preact, Zod, GridStack, SortableJS, polices) et leurs licences |
| `tools/` | Outils Node sans dépendance : `serve`, `export`, `check`, `coverage`, `report`, `vendor` |
| `tests/e2e/` | Parcours navigateur (Playwright, lancés par Claude, jamais publiés) |
| `docs/` | Guides : ajouter un widget, publier, contrôles manuels |
| `.github/workflows/pages.yml` | Publication automatique sur GitHub Pages |
| `RULES.md` | Règles du projet, lues au début de chaque phase |

## Scripts
Aucune dépendance à installer (Node 22 ou plus récent).

```
npm test                  # tests de logique (node --test)
npm run test:coverage     # idem + couverture : échoue sous 80 % de lignes par fichier de logique pure
npm run check             # contrôle des règles du projet (tools/check.mjs)
npm run export            # produit le site complet dans site/ (--out dossier, --no-csp, --no-preload)
npm run serve             # sert site/ sur http://127.0.0.1:8080/ (--base /sous-dossier/ pour simuler GitHub Pages)
npm run e2e               # tous les parcours navigateur (Playwright et Chromium requis, hors du dépôt)
node tools/report.mjs     # poids et profondeur d'imports
node tools/vendor.mjs     # recopie les bibliothèques (seulement pour en ajouter ou les mettre à jour)
```

Les parcours navigateur (`tests/e2e/phaseN.mjs`) exportent le site, le servent et le pilotent dans Chromium ;
Playwright (`PLAYWRIGHT_MODULES`) et axe-core (`AXE_MODULES`, parcours `phase11-a11y`) viennent de
l'espace de travail de Claude : ce ne sont **pas** des dépendances du dépôt.

Mode développement : l'adresse avec `?dev=1` expose `window.__dash` (`dashboard`, `data`, `status`, `ui`,
`registry`, `actions`, `renders`) pour piloter les stores depuis la console.

## Architecture en résumé
- **Aucun build** : modules ES natifs, types en JSDoc, Preact + htm (`html`), Zod, GridStack, SortableJS, CSS à variables.
  Les bibliothèques ne s'importent que par `src/lib/vendor.js`.
- **Le cœur ne connaît aucun widget** : il manipule le contrat `WidgetDefinition` (`src/widgets/types.js`) à travers le
  registre. Un widget ne reçoit que des props (`settings`, `data`, `updateSettings`, `updateData`…) et n'importe ni le
  cœur, ni un autre widget.
- **Deux sortes de données, deux sortes de clés** : la disposition (`dash:state`) et les données de chaque instance
  (`dash:data:<id>`), validées par Zod à la lecture, versionnées et migrables. Une version plus récente que le code ouvre
  l'application en **lecture seule** (rien n'est écrit).
- **Le stockage passe par `StorageAdapter`** (asynchrone) ; écritures regroupées (300 ms) et forcées à la fermeture.
- **Chaque instance est dans une barrière d'erreur** ; un type inconnu s'affiche « Widget indisponible » et ses données
  sont conservées.
- **Chargement** : les panneaux (catalogue, réglages, sauvegarde, aide) et les panneaux de réglages des widgets sont chargés
  à la demande ; l'export ajoute un `<link rel="modulepreload">` par module du premier affichage.
- **Sécurité** : politique `Content-Security-Policy` en balise `<meta>` (scripts du site uniquement, aucun script en ligne,
  images : le site, `data:` et le service d'icônes de Google), `referrer: no-referrer`.

Détails des règles dans `RULES.md`.

## Ajouter un widget, publier
- **Ajouter un widget** : créer `src/widgets/<type>/` et ajouter UNE ligne à `src/widgets/manifest.js` → voir
  [`docs/ADDING_A_WIDGET.md`](docs/ADDING_A_WIDGET.md).
- **Publier sur GitHub Pages** : voir [`docs/PUBLISH.md`](docs/PUBLISH.md), puis contrôler le site avec
  [`docs/POST_PUBLISH_CHECKLIST.md`](docs/POST_PUBLISH_CHECKLIST.md) et
  [`docs/ACCESSIBILITY_CHECKLIST.md`](docs/ACCESSIBILITY_CHECKLIST.md).

## Compatibilité avec une extension de navigateur (phase 12, facultative)
Contrôlée automatiquement par `tools/check.mjs` à chaque `npm run check` (et par le workflow de publication) :
- aucun composant ni widget n'appelle `localStorage` / `sessionStorage` (hors `src/core/storage`), `Notification`,
  `AudioContext` (hors `src/lib/platform`) ni `chrome.*` (hors `src/platform/extension`, qui n'existe pas encore) ;
- aucun script en ligne, aucun `eval`, aucune adresse absolue (`/…`), aucune bibliothèque chargée depuis un CDN ;
- seules requêtes externes possibles : les icônes de sites, derrière `src/lib/platform/favicon.js`, et seulement si
  l'utilisateur les active.

Résultat de la phase 11 : **aucune violation**. Les points qui devront changer pour l'extension (le stockage
`chrome.storage`, la page « nouvel onglet ») passent tous par `StorageAdapter` et `src/lib/platform`.

## Limites connues
- Les données sont **propres à chaque navigateur et à chaque appareil** (pas de synchronisation) : on les transfère avec
  Sauvegarde → Exporter / Importer.
- Safari peut effacer le stockage d'un site peu visité : exporte régulièrement.
- Les alarmes et notifications du Minuteur ne se déclenchent que si la page est ouverte (même en arrière-plan) ; si la
  page était fermée, le message « Terminé à … » s'affiche à la réouverture, sans son.
- Sur GitHub Pages, pas d'en-têtes HTTP personnalisés : la politique de sécurité est posée par `<meta>`, sans
  `frame-ancestors`.
- Les icônes de sites passent par un service externe (désactivé par défaut) : leurs noms de domaine lui sont envoyés.
- Une seule page de dashboard dans cette version (pas d'onglets de pages).
- Vérifié automatiquement avec Chromium seulement : Firefox, Safari et les lecteurs d'écran se contrôlent à la main
  (voir les listes de `docs/`).

## Travailler avec Claude
Le projet vit dans un seul artefact multi-fichiers. Chaque phase se déroule dans une conversation neuve : Claude lit
l'artefact et `RULES.md`, écrit et teste, puis republie au même lien avec le libellé « Phase N ». L'artefact reste la
source de travail ; le dépôt GitHub en est la copie publiée.
