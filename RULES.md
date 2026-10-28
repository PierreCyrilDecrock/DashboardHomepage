# Dashboard Homepage — règles du projet
## Projet
Page d'accueil de navigateur : dashboard personnalisable de widgets (grille,
glisser-déposer, redimensionnement). 100 % local, sans backend, sans étape de
build. Interface en français. Projet personnel, développé par Claude dans un
artefact multi-fichiers, publié sur GitHub Pages, destiné à devenir aussi une
extension Chrome qui remplace la page « nouvel onglet » (phase 12).
## Stack
JavaScript en modules ES natifs (extension .js obligatoire dans tous les
imports), types en JSDoc, Preact avec le gabarit html de htm, GridStack,
SortableJS, Zod, CSS pur à variables. Tests : node:test pour la logique,
Playwright et axe-core pour le navigateur. Les bibliothèques sont copiées
dans vendor/ par tools/vendor.mjs : ne charge JAMAIS un script depuis un CDN.
## Procédure de travail (à chaque phase)
1. Lire l'artefact : lister ses fichiers, puis les lire tous dans l'espace de
travail. Ne jamais publier un artefact sans l'avoir lu dans la conversation.
2. Travailler dans l'espace de travail ; ne modifier que les fichiers de la
phase.
3. Vérifier : node --test (logique), node tools/check.mjs (règles), node
tools/export.mjs puis le parcours navigateur de la phase (Playwright sur le
site exporté, servi par tools/serve.mjs). La console du navigateur ne doit
contenir aucune erreur ni violation de la politique de sécurité.
4. Publier dans le MÊME artefact (même lien, jamais un nouvel artefact) :
index.html comme page, tous les autres fichiers dans « files » avec le chemin
qu'ils ont dans le projet, libellé « Phase N ». Ne renvoyer que les fichiers
modifiés.
5. Rapport : fichiers créés ou modifiés, commandes lancées avec leur
résultat, ce que l'aperçu ne permet pas de vérifier, points à surveiller.
## Architecture — à respecter strictement
- Le cœur (src/core) ne connaît aucun widget précis : il ne manipule que le
contrat WidgetDefinition (src/widgets/types.js) à travers le registre
(src/widgets/registry.js).
- Un widget = un dossier src/widgets/<type>/ avec index.js (exporte «
definition »), <Type>Widget.js et schema.js. Le registre charge les dossiers
listés dans src/widgets/manifest.js : ajouter un widget, c'est créer le
dossier et ajouter UNE ligne à ce fichier, rien d'autre.
- Un widget ne reçoit que des props (instanceId, settings, data, isEditing,
size, updateSettings, updateData). Il n'importe jamais un autre widget, ni
src/core, ni localStorage ; il peut importer src/lib et src/ui.
- Instances multiples : chaque instance a un UUID et ses données sont sous la
clé dash:data:<instanceId>, jamais sous le type. Aucun singleton ni état
global propre à un widget : un moteur partagé est un hook instancié par
widget.
- Le stockage passe par l'interface StorageAdapter (asynchrone). Aucun
composant n'appelle localStorage directement.
- La disposition (clé dash:state) et les données d'instance (clé dash:data:
<id>) sont stockées séparément.
- Toute donnée lue du stockage ou d'un import est validée par Zod ; les
formats sont versionnés et migrables.
- Chaque instance est dans une barrière d'erreur. Un type inconnu s'affiche
comme « Widget indisponible » et ses données sont conservées.
## Contraintes de l'artefact et de GitHub Pages
- index.html est un fragment : pas de doctype, html, head ni body. Il
commence par <title> et les meta, et respecte le contrat de page d'un
artefact. tools/export.mjs en fait un document complet.
- Aucun script en ligne, aucun eval, aucune ressource distante obligatoire.
Tous les chemins sont relatifs (jamais de « / » au début) : le site est servi
sous un sous-dossier (https://<utilisateur>.github.io/<depot>/).
- Pas de alert, confirm ni prompt : les confirmations se font dans la page,
avec « Annuler » plutôt que « Confirmer ».
- Un téléchargement n'est pas garanti dans l'aperçu : toute sauvegarde
propose aussi la copie dans le presse-papiers, et l'import accepte un texte
collé.
- localStorage peut être vide, refusé, ou partagé avec d'autres sites
*.github.io : clés préfixées « dash: », jamais localStorage.clear(), repli en
mémoire avec bandeau.
- Mode développement : l'adresse avec ?dev=1 expose window.__dash et les
boutons de test.
- Aucune donnée personnelle ni secret dans les fichiers : le dépôt sera
public.
## Compatibilité extension navigateur (prévue en phase 12)
- Aucune API de plateforme hors de src/lib/platform et de l'adaptateur de
stockage : ni localStorage, ni Notification, ni AudioContext, ni service
d'icônes appelés directement par un composant ou un widget.
- Seules requêtes externes tolérées : les icônes de sites, derrière
src/lib/platform/favicon.js.
- Un minuteur se calcule toujours depuis endsAt : il reste exact même si la
page a été fermée.
- Aucun appel à chrome.* avant la phase 12, et jamais depuis un widget.
## Règles de code
- N'ajoute aucune bibliothèque sans le dire et le justifier ; toute
bibliothèque passe par vendor/.
- Composants Preact écrits avec le gabarit html. La logique pure est extraite
dans des fichiers sans Preact (par exemple todoLogic.js) et couverte par des
tests node:test.
- Types en JSDoc sur les fonctions exportées et sur les contrats.
- Textes d'interface en français, identifiants de code en anglais.
- Accessibilité : éléments natifs (button, input, label), cibles tactiles
d'au moins 44 px, focus visible, aria-label sur les boutons à icône seule,
contraste AA, tout utilisable au clavier.
- Icônes depuis src/ui/icons.js, pas d'emoji dans l'interface.
- Couleurs uniquement via les variables CSS du thème, jamais de couleur en
dur dans un composant.
## Façon de travailler
- Reste dans le périmètre de la phase demandée ; n'ajoute pas de
fonctionnalités des phases suivantes.
- Un seul artefact pour tout le projet.
