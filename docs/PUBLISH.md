# Publier Dashboard Homepage sur GitHub Pages

Ce guide s'adresse à quelqu'un qui n'a **jamais utilisé GitHub Pages**. À la fin, ton dashboard est
accessible à une adresse comme `https://<utilisateur>.github.io/<dépôt>/`, et il se met à jour tout
seul à chaque fois que tu envoies de nouveaux fichiers.

> **À savoir avant de commencer** : le dépôt est **public** (c'est la condition de GitHub Pages gratuit).
> Il ne contient aucune donnée personnelle : tes listes, notes et raccourcis restent dans **ton navigateur**,
> jamais dans le dépôt. Ne mets jamais de mot de passe ni de secret dans les fichiers.

## 1. Ce qu'il te faut
- Un compte GitHub gratuit (https://github.com/signup).
- L'archive `dashboard-homepage.zip` que Claude t'a envoyée. Décompresse-la : tu obtiens un dossier
  `dashboard-homepage/` contenant `index.html`, `src/`, `vendor/`, `styles/`, `.github/`, etc.

## 2. Créer le dépôt
1. Sur github.com, clique sur **+** (en haut à droite) puis **New repository**.
2. **Repository name** : `dashboard-homepage` (ce nom fait partie de l'adresse finale ; tu peux en choisir un autre).
3. Choisis **Public**.
4. Ne coche rien d'autre (ni README, ni .gitignore, ni licence) : le dépôt doit être vide.
5. Clique sur **Create repository**.

## 3. Y envoyer les fichiers

### Option A — sans git, par glisser-déposer dans le navigateur
Le dépôt contient environ 240 fichiers et GitHub n'en accepte que **100 à la fois** par envoi. Pour t'éviter de
compter, Claude t'a envoyé une seconde archive, `dashboard-homepage-envoi-web.zip`, déjà découpée en **4 lots**
(`lot-1` à `lot-4`, au plus 100 fichiers chacun). Chaque lot reproduit l'arborescence du dépôt : il faut en glisser
le **contenu** (pas le dossier `lot-N` lui-même).

| Lot | Contenu | Fichiers |
|-----|---------|----------|
| `lot-1` | fichiers de la racine, `styles`, `docs`, `tools`, `vendor`, `tests` | environ 65 |
| `lot-2` | `src/core` | environ 83 |
| `lot-3` | le reste de `src` (`widgets`, `lib`, `ui`, `App.js`, `main.js`) | environ 90 |
| `lot-4` | `.github/workflows/pages.yml` | 1 |

1. Décompresse `dashboard-homepage-envoi-web.zip`.
2. Sur la page du dépôt vide, clique sur **uploading an existing file**.
3. Ouvre le dossier `lot-1`, sélectionne **tout son contenu** (`Ctrl/Cmd + A`) et glisse-le dans la page.
   Attends la fin du chargement, puis clique sur **Commit changes** (en bas).
4. Recommence pour `lot-2`, puis `lot-3` : **Add file → Upload files**, glisse le contenu du lot, **Commit changes**.
5. Termine par `lot-4` (le workflow de publication). Le dossier `.github` commence par un point et peut être caché :
   - macOS : dans le Finder, appuie sur `Cmd + Maj + .` pour afficher les fichiers cachés ;
   - Windows : onglet **Affichage → Éléments masqués**.

   Si ça ne marche toujours pas, crée le fichier à la main : **Add file → Create new file**, tape comme nom
   `.github/workflows/pages.yml` (les `/` créent les dossiers), colle le contenu du fichier `pages.yml`,
   puis **Commit changes**.
6. Vérifie sur la page du dépôt que tu vois bien `.github`, `docs`, `src`, `styles`, `tests`, `tools`, `vendor`
   et les fichiers de la racine.

> Tant que les 4 lots ne sont pas tous envoyés, une exécution du workflow peut échouer (croix rouge dans l'onglet
> **Actions**) : c'est normal. Seule la dernière exécution compte ; au besoin, relance-la (voir plus bas).

Plus simple encore : `dashboard-homepage.zip` contient l'arbre complet, utile pour git (option B) ou pour archive.

### Option B — avec git (si tu l'as déjà)
Dans le dossier décompressé :
```
git init
git add .
git commit -m "Dashboard Homepage 0.1.0"
git branch -M main
git remote add origin https://github.com/<utilisateur>/dashboard-homepage.git
git push -u origin main
```

> Le workflow de publication se déclenche à chaque envoi vers la branche **main**. Si ta branche principale
> s'appelle autrement (`master`), renomme-la en `main` (Settings → Branches) ou modifie `branches: [main]`
> dans `.github/workflows/pages.yml`.

## 4. Activer Pages (une seule fois)
1. Dans le dépôt : **Settings** (roue crantée) → **Pages** (menu de gauche).
2. Sous **Build and deployment**, réglage **Source** : choisis **GitHub Actions**.
   (Ne choisis pas « Deploy from a branch » : ce dépôt se publie par le workflow.)
3. Si tu as envoyé les fichiers *avant* ce réglage, la première exécution a échoué : va dans l'onglet
   **Actions**, clique sur **Publier sur GitHub Pages** puis **Run workflow → Run workflow**.

## 5. Suivre l'avancement et trouver l'adresse
- Onglet **Actions** du dépôt : la ligne **Publier sur GitHub Pages** passe de jaune (en cours) à verte (réussie)
  en une à deux minutes. Clique dessus pour voir le détail : *build* (tests, contrôle, export), puis *deploy*.
- Une croix rouge : ouvre l'étape en échec, lis le message, et envoie-le à Claude.
- **L'adresse du site** est affichée à la fin de l'étape *deploy*, et sur **Settings → Pages** :
  `https://<utilisateur>.github.io/<dépôt>/` (par exemple `https://marie.github.io/dashboard-homepage/`).
  Garde la `/` finale.

Puis suis la liste `docs/POST_PUBLISH_CHECKLIST.md` pour contrôler le site publié.

## 6. Mettre à jour le site
Remplace les fichiers modifiés dans le dépôt (**Add file → Upload files** pour écraser un fichier, ou
`git push`). Chaque envoi vers `main` relance le workflow : le site est mis à jour en une ou deux minutes.
Vide le cache du navigateur (ou recharge avec `Ctrl/Cmd + Maj + R`) si l'ancienne version s'affiche encore.

## 7. Revenir à une version précédente
- **Le plus simple** : onglet **Actions**, ouvre une exécution *verte* plus ancienne de *Publier sur GitHub Pages*,
  clique sur **Re-run all jobs**. Le site est reconstruit et republié **avec les fichiers de cette ancienne
  version**.
- **Autre méthode** : onglet **Code → History** (ou `commits`), ouvre la version voulue, récupère les fichiers
  tels qu'ils étaient (**Browse files**), puis renvoie-les sur `main` : le site suivra.
- Tes **données** ne sont jamais touchées par une publication : elles sont dans ton navigateur.
  Si une mise à jour avait changé leur format, l'application sait les migrer ; en cas de doute, fais d'abord
  **Sauvegarde → Exporter**.

## 8. Limites à connaître
- **Pas d'en-têtes HTTP personnalisés** sur GitHub Pages : la politique de sécurité du site est donc posée par une
  balise `<meta>` dans `index.html` (c'est le mieux possible ici). Certaines protections (`frame-ancestors`,
  `X-Frame-Options`) ne peuvent pas être imposées.
- **Données propres à chaque navigateur et à chaque appareil** : le téléphone, l'ordinateur, Firefox et Chrome
  ont chacun leurs données. Pour les transférer : **Sauvegarde → Exporter** sur le premier, **Importer** sur
  le second.
- **Un seul espace de stockage par compte** : tous les sites `<utilisateur>.github.io` partagent le même
  `localStorage`. Les données de l'application sont donc toutes préfixées `dash:`, et l'application ne touche
  jamais aux autres clés. Si tu héberges un autre site sur le même compte, évite le préfixe `dash:`.
- **Dépôt public** : toute personne peut lire le code. Aucune donnée personnelle ni secret dedans.
- Aucune statistique, aucun suivi : l'application ne contacte aucun serveur (seule exception, si tu l'actives
  dans les réglages du widget Raccourcis : les icônes des sites, demandées à un service d'icônes).
