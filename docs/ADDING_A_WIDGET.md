# Ajouter un widget

Ce guide décrit, pas à pas, comment ajouter un widget à Dashboard Homepage sans toucher au cœur de
l'application. Le widget **Raccourcis** (`src/widgets/shortcuts/`) est l'exemple de référence : quand
une étape vous laisse un doute, ouvrez le fichier correspondant de ce dossier.

Principe : le cœur (`src/core`) ne connaît aucun widget. Il ne manipule que le contrat
`WidgetDefinition` (`src/widgets/types.js`) à travers le registre. Ajouter un widget, c'est donc
**créer un dossier et ajouter une ligne à `src/widgets/manifest.js`**, rien d'autre.

## Ce qu'un widget reçoit et ne peut pas faire

Un widget reçoit uniquement des props :

| Prop | Rôle |
| --- | --- |
| `instanceId` | identifiant de l'instance (UUID) ; deux widgets du même type ont deux identifiants |
| `settings` | réglages, déjà validés par `settingsSchema` |
| `data` | données, déjà validées par `dataSchema` |
| `isEditing` | vrai quand le dashboard est en mode édition |
| `size` | taille actuelle en cellules de grille (`{ w, h }`) |
| `updateSettings(patch)` | fusionne `patch` dans les réglages |
| `updateData(updater)` | remplace les données par `updater(données actuelles)` |

Un widget **peut** importer `src/lib/*` (outils partagés, dont `vendor.js` pour Preact et Zod) et
`src/ui/*` (`Button`, `Field`, `Toggle`, `Dialog`, `Icon`). Il **ne doit pas** importer `src/core`, ni un
autre widget, ni appeler `localStorage`, `Notification`, `AudioContext`, `chrome.*`, `alert`,
`confirm`, `prompt` ou `eval` : `node tools/check.mjs` le refuse. Les API de plateforme passent par
`src/lib/platform/` (voir `favicon.js`, `alarmService.js`, `files.js`).

## Pas à pas

### 1. Créer le dossier

```
src/widgets/<type>/
  index.js            exporte « definition »
  <Type>Widget.js     le composant
  <Type>Settings.js   le panneau de réglages (facultatif)
  schema.js           schémas Zod et valeurs par défaut
  <type>Logic.js      logique pure, sans Preact (recommandé)
  <type>Logic.test.js tests node:test de cette logique
  style.css           styles du widget (facultatif)
```

`<type>` est en minuscules, lettres, chiffres et tirets (`/^[a-z][a-z0-9-]*$/`), et **égal au nom du
dossier**. Il est écrit dans les données enregistrées : ne le changez plus après la publication.

### 2. Écrire les schémas (`schema.js`)

Les réglages et les données sont validés par Zod à chaque lecture du stockage ou d'un import. Un
schéma qui refuse un contenu fait revenir le widget à ses valeurs par défaut, avec une copie de
l'ancien contenu dans `dash:backup:<instanceId>`.

```js
import { z } from '../../lib/vendor.js';

export const settingsSchema = z.object({
  showLabels: z.boolean(),
});

// looseObject conserve les champs inconnus : un futur format n'est pas perdu.
export const dataSchema = z.looseObject({
  links: z.array(z.looseObject({ id: z.string().min(1), title: z.string().min(1).max(60) })),
});

/** @type {{ showLabels: boolean }} */
export const defaultSettings = { showLabels: true };

/** @type {{ links: Array<{ id: string, title: string }> }} */
export const defaultData = { links: [] };
```

Les valeurs par défaut doivent **passer** leurs propres schémas (le test du contrat le vérifie).
Mettez des bornes (longueurs, nombres d'éléments) : un schéma sans borne laisse un import remplir le
stockage.

### 3. Écrire le composant (`<Type>Widget.js`)

Composants Preact écrits avec le gabarit `html` ; les bibliothèques ne s'importent que par
`src/lib/vendor.js`.

```js
import { html } from '../../lib/vendor.js';

/**
 * @param {import('../types.js').WidgetProps<typeof import('./schema.js').defaultSettings, typeof import('./schema.js').defaultData>} props
 */
export function ExampleWidget({ settings, data, updateData }) {
  const add = () => updateData((d) => ({ ...d, links: [...d.links, { id: crypto.randomUUID(), title: 'Nouveau' }] }));
  return html`
    <div class="example">
      <ul>${data.links.map((link) => html`<li key=${link.id}>${link.title}</li>`)}</ul>
      <button type="button" onClick=${add}>Ajouter</button>
    </div>
  `;
}
```

Règles du cadre à connaître :

- le cadre fournit la barre de titre, le menu « … » et la barrière d'erreur ; le widget ne dessine que
  son contenu (`.widget__body` a déjà sa marge et gère le défilement) ;
- le contenu s'adapte à la taille du widget : utilisez les unités de conteneur (`cqw`, `cqh`) ou la prop
  `size`, jamais une taille de fenêtre ;
- chaque frappe peut appeler `updateData` : la persistance regroupe les écritures (300 ms), n'ajoutez
  pas de minuterie d'enregistrement ;
- un état purement visuel (menu ouvert, champ en cours de saisie) reste local au composant (`useState`) ;
- jamais d'état global propre au widget : deux instances doivent rester indépendantes. Un moteur
  partagé est un **hook instancié par widget** (voir `src/lib/useCountdown.js`).

### 4. Écrire le panneau de réglages (facultatif)

`SettingsPanel` reçoit `settings` et `onChange(patch)` ; les changements s'appliquent tout de suite.
Utilisez `Field` (libellé, aide, erreur reliés au champ), `Toggle` et `Button` de `src/ui`.

Le panneau n'est utile qu'à l'ouverture des réglages : les widgets du dépôt le **chargent à la demande**
pour alléger le premier affichage (`src/ui/lazy.js`). Dans `index.js` :

```js
import { lazyComponent } from '../../ui/lazy.js';
// …
SettingsPanel: lazyComponent(() => import('./ExampleSettings.js'), (m) => m.ExampleSettings),
```

L'adresse de `import()` doit être littérale. Un panneau écrit normalement (`SettingsPanel: ExampleSettings`)
fonctionne aussi : le cœur attend simplement que le panneau soit arrivé avant d'ouvrir la fenêtre.

### 5. Styler (`style.css`)

Chargé une seule fois par le cadre grâce à `styleUrl`. **Couleurs uniquement par les variables du
thème** (`--bg`, `--surface`, `--surface-2`, `--border`, `--text`, `--muted`, `--accent`,
`--accent-contrast`, `--accent-2`, `--danger`) : elles suivent automatiquement le thème clair et
sombre. Préfixez vos classes par le type (`.example__list`) pour ne pas entrer en collision avec les
autres widgets.

### 6. Écrire la définition (`index.js`)

```js
import { defineWidget } from '../types.js';
import { ExampleSettings } from './ExampleSettings.js';
import { ExampleWidget } from './ExampleWidget.js';
import { dataSchema, defaultData, defaultSettings, settingsSchema } from './schema.js';

/** @type {import('../types.js').WidgetDefinition<typeof defaultSettings, typeof defaultData>} */
export const definition = defineWidget({
  type: 'example',
  name: 'Exemple',                       // nom affiché (titre par défaut, catalogue)
  description: 'Une phrase de présentation.',
  icon: 'link',                          // une icône de src/ui/icons.js (jamais d'emoji)
  category: 'liens',                     // 'temps' | 'organisation' | 'liens' | 'focus'
  defaultSize: { w: 4, h: 3 },           // en cellules de la grille de 12 colonnes
  minSize: { w: 2, h: 2 },
  settingsSchema,
  defaultSettings,
  dataSchema,
  defaultData,
  version: 1,                            // voir « Faire évoluer le format » ci-dessous
  Component: ExampleWidget,
  SettingsPanel: ExampleSettings,        // facultatif
  styleUrl: new URL('./style.css', import.meta.url), // facultatif
});
```

`defineWidget` refuse une définition incomplète avec **une seule** erreur qui liste tous les problèmes.

### 7. Enregistrer le widget (une ligne)

Dans `src/widgets/manifest.js`, ajoutez le nom du dossier. L'ordre de la liste est l'ordre du
catalogue.

```js
export default [
  'clock',
  'notes',
  'shortcuts',
  'timer',
  'todo',
  'example', // ← la seule ligne à ajouter
];
```

Rien d'autre à modifier : ni le registre, ni le catalogue, ni `App.js`. Un widget qui ne se charge pas
(erreur dans son module) est signalé par `registryErrors()` sans empêcher les autres de fonctionner.

### 8. Tester

- **Logique pure** : mettez tout ce qui se calcule dans `<type>Logic.js` (sans Preact, sans DOM) et
  couvrez-le avec `node:test` (`<type>Logic.test.js`). Lancez `node --test`.
- **Contrat** : un test vérifie que `checkWidgetDefinition(definition)` renvoie `[]` et que les valeurs par
  défaut passent leurs schémas (voir `src/widgets/clock/schema.test.js`).
- **Règles du projet** : `node tools/check.mjs` doit répondre « aucune violation ».
- **Navigateur** : `node tools/export.mjs`, puis un parcours Playwright dans `tests/e2e/` (voir
  `tests/e2e/phase8.mjs` pour le widget Raccourcis). La console ne doit contenir aucune erreur ni
  violation de la politique de sécurité.
- Le test du registre se charge de comparer le manifeste et les dossiers : il échoue si une ligne
  désigne un dossier absent.

## Faire évoluer le format d'un widget

Quand le format de ses réglages ou de ses données change :

1. augmentez `version` dans `index.js` ;
2. ajoutez `migrate({ settings, data }, fromVersion)` à la définition : elle reçoit les anciens
   réglages et données, et renvoie `{ settings, data }` au nouveau format ;
3. testez la migration sur un exemple de l'ancien format.

Au démarrage, le cœur appelle `migrate` pour chaque instance enregistrée avec une version plus
ancienne et valide le résultat avec vos schémas. Si la migration échoue, l'instance reste telle
quelle et l'erreur est journalisée : rien n'est perdu.

## Critères d'acceptation d'un nouveau widget

- [ ] Le dossier contient `index.js` (qui exporte `definition`), le composant et `schema.js`.
- [ ] Une seule ligne ajoutée à `src/widgets/manifest.js`, aucun autre fichier hors du dossier modifié.
- [ ] Deux instances du même widget gardent des données et des réglages indépendants.
- [ ] Rien n'importe `src/core` ni un autre widget ; aucune API de plateforme appelée directement.
- [ ] Les schémas bornent les tailles ; les valeurs par défaut passent les schémas.
- [ ] Couleurs uniquement par les variables du thème ; lisible en clair et en sombre.
- [ ] Utilisable au clavier seul, focus visible, boutons à icône seule avec `aria-label`, cibles
      tactiles d'au moins 44 px, textes en français, icônes de `src/ui/icons.js`.
- [ ] S'adapte aux petites et grandes tailles sans déborder.
- [ ] `node --test`, `node tools/check.mjs` et le parcours navigateur passent, console propre.
- [ ] Une entrée dans `CHANGELOG.md`.
