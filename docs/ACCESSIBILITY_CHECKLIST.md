# Contrôles d'accessibilité à faire à la main

Ce qui est automatisé (axe-core en thème clair et sombre, parcours au clavier, zoom, mouvement réduit) est décrit
dans `tests/e2e/phase11-a11y.mjs`. Il reste ce qu'aucun outil ne juge : **ce qu'un lecteur d'écran annonce, et si
c'est compréhensible.** Fais ces contrôles avec **VoiceOver** (macOS : `Cmd + F5`, Safari) et **NVDA**
(Windows, gratuit : https://www.nvaccess.org, avec Firefox ou Chrome). Un seul des deux suffit pour une première
passe ; les deux, c'est mieux.

Pour chaque point, note ✔ ou ✘ et ce qui a été dit. Envoie les ✘ à Claude avec le lecteur et le navigateur.

## Rappel des commandes
- **VoiceOver (macOS)** : `Ctrl + Option` = touche VO ; `VO + flèche droite/gauche` = élément suivant/précédent ;
  `VO + Espace` = activer ; `VO + U` = rotor (titres, liens, boutons, repères) ; `Tab` = contrôle suivant.
- **NVDA** : `Insert` = touche NVDA ; `Tab` = contrôle suivant ; `H` = titre suivant ; `B` = bouton suivant ;
  `D` = repère suivant ; `Insert + Espace` = mode formulaire/navigation ; `Insert + F7` = liste des éléments.

## 1. Structure de la page
- [ ] Le titre de la page est annoncé : « Dashboard Homepage ».
- [ ] Les titres sont navigables (`H` / rotor) : un titre principal, puis un titre par widget (« Heure », « À faire »…).
- [ ] La zone principale est annoncée comme repère (*main*).
- [ ] La barre d'outils est compréhensible : « Ajouter un widget », « Modifier la disposition », groupe « Thème »
      avec Clair / Sombre / Système et leur état (« appuyé »), « Sauvegarde », « Raccourcis », « Préférences ».

## 2. Bandeaux et notifications
- [ ] Les bandeaux (stockage plein, lecture seule…) sont annoncés quand ils apparaissent.
- [ ] Une action avec « Annuler » (suppression d'un widget, d'une tâche) est annoncée, et « Annuler » est atteignable
      au clavier avant sa disparition.

## 3. Fenêtres (catalogue, réglages, sauvegarde, aide)
- [ ] À l'ouverture, le lecteur annonce une **boîte de dialogue** avec son titre.
- [ ] Le focus est dans la fenêtre ; `Tab` n'en sort pas ; le fond n'est pas lu.
- [ ] `Échap` ferme, et le focus revient au bouton qui l'a ouverte.
- [ ] Champs : chaque champ est annoncé avec son libellé ; les erreurs (import invalide, adresse invalide) sont lues.
- [ ] Interrupteurs (Préférences) : annoncés « interrupteur, activé/désactivé ».

## 4. Widgets
- [ ] **Heure** : l'heure n'est pas relue à chaque seconde (pas de bavardage) ; la date est lisible.
- [ ] **À faire** : « 3 sur 6 » ou équivalent annoncé ; chaque case est annoncée avec le texte de la tâche et son état ;
      ajouter, cocher, supprimer sont annoncés ; le réordonnancement (Alt + flèches) est annoncé.
- [ ] **Notes** : onglets annoncés comme tels (« onglet 1 sur 3 ») ; la zone de saisie a un nom ; le compteur de caractères
      apparaît près de la limite.
- [ ] **Raccourcis** : chaque tuile est un lien avec le nom du site ; « Ajouter un raccourci » est atteignable ; le mode
      « Organiser » annonce déplacements, suppression et annulation.
- [ ] **Minuteur** : le temps restant est lisible à la demande (pas de relecture chaque seconde) ; à la fin, « Minuteur
      terminé » est annoncé immédiatement, même si le focus est ailleurs.

## 5. Mode édition de la disposition
- [ ] « Modifier la disposition » annonce l'état ; chaque poignée est annoncée (« Déplacer Heure : flèches pour
      déplacer, Maj et flèches pour redimensionner »).
- [ ] Les flèches déplacent d'une case, Maj + flèches redimensionnent, et la nouvelle position est annoncée.
- [ ] `Échap` quitte le mode édition.

## 6. Autres contrôles
- [ ] **Zoom 200 %** et **400 %** du navigateur (`Ctrl/Cmd +`) : rien ne se chevauche, pas de défilement horizontal de la
      page, toutes les actions restent accessibles.
- [ ] **Contraste élevé** (Windows : mode « Contraste élevé » / macOS : « Augmenter le contraste ») : les contours,
      boutons et le focus restent visibles.
- [ ] **Réduire les animations** (réglage du système) : aucune animation notable.
- [ ] **Navigation au clavier seul** (sans souris) : tout le parcours « ajouter un widget, le déplacer, le renommer, le
      supprimer, annuler » est possible.
- [ ] **Texte seul agrandi** (réglage de taille de police du navigateur à 200 %) : textes lisibles, rien de coupé.

## 7. Ce qui a déjà été vérifié automatiquement
- axe-core 4.x, règles WCAG 2.0/2.1/2.2 A et AA + bonnes pratiques : aucune violation en clair et en sombre sur le
  dashboard vide, les cinq widgets, le mode édition, le catalogue, les réglages, les dialogues d'import, d'export,
  d'aide, de préférences et le formulaire de raccourci.
- Parcours au clavier : chaque contrôle atteint, focus visible, aucun piège, retour du focus après chaque fenêtre.
- Zoom 200 % et 400 % (fenêtres de 640 et 320 px) et `prefers-reduced-motion`.
