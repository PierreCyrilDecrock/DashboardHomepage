# Contrôles à faire sur le site publié

À cocher à la main, une fois le site en ligne (adresse `https://<utilisateur>.github.io/<dépôt>/`).
Le bac à sable de Claude ne contient que Chromium : **Firefox, Safari, les vraies notifications et les icônes
d'un service externe ne peuvent être vérifiés que par toi.** Si un point échoue, note le navigateur, la version
et ce que tu vois, puis envoie-le à Claude.

## 1. Ouverture
- [ ] L'adresse `https://<utilisateur>.github.io/<dépôt>/` s'ouvre (avec la `/` finale ; sans elle, GitHub redirige).
- [ ] Le titre de l'onglet est « Dashboard Homepage » et l'icône est affichée.
- [ ] Le dashboard s'affiche sans flash blanc en thème sombre (change le thème, recharge).
- [ ] **Console du navigateur propre** : ouvre les outils de développement (F12 → *Console*), recharge : aucune
      erreur en rouge, aucun message « Content Security Policy » / « Refused to … ».
- [ ] Onglet *Réseau* (F12 → *Network*) : toutes les requêtes viennent de ton adresse `github.io` (aucune vers un
      autre site, sauf les icônes de sites si tu les as activées).

## 2. Un widget de chaque type
- [ ] **Commencer avec une disposition type** ajoute Heure, À faire, Minuteur, Notes et Raccourcis.
- [ ] Heure : l'heure avance ; ajoute un fuseau secondaire dans les réglages.
- [ ] À faire : ajoute 3 tâches, coche-en une, réordonne-en une.
- [ ] Notes : crée une note, écris du texte.
- [ ] Raccourcis : ajoute `github.com` ; essaie `javascript:alert(1)` → refusé avec un message.
- [ ] Minuteur : règle 1 minute et démarre.
- [ ] **Recharge la page** : tout est là, à la même place, avec le même contenu.
- [ ] Ferme l'onglet, rouvre l'adresse : toujours là.

## 3. Navigateurs
Pour chacun, refais les points 1 et 2 :
- [ ] Chrome ou Edge
- [ ] **Firefox**
- [ ] **Safari** (macOS et/ou iPhone/iPad)
- [ ] Un navigateur mobile (téléphone) : une colonne, rien ne dépasse, tout se touche facilement.

Points propres à Safari à surveiller : le stockage peut être effacé après 7 jours sans visite (« Prevent cross-site
tracking » / protection intelligente contre le pistage) — c'est la raison d'être de **Sauvegarde → Exporter** ;
téléchargement du fichier de sauvegarde (sinon utilise **Copier la sauvegarde**).

## 4. Icônes des raccourcis
- [ ] Par défaut, chaque raccourci affiche une **lettre sur une couleur** (aucune requête externe).
- [ ] Réglages du widget Raccourcis → *Icônes du site* : l'avertissement « Les noms de domaine sont envoyés à
      Google pour récupérer les icônes. » s'affiche, et les vraies icônes apparaissent.
- [ ] Une icône introuvable retombe sur la lettre (essaie un domaine inconnu).
- [ ] Console : aucune erreur de politique de sécurité liée aux images.

## 5. Minuteur, son et notifications
- [ ] Minuteur de 1 minute : démarre, passe à 00:00, affiche « Terminé à HH:MM » et joue trois bips.
- [ ] **Autorise les notifications** (réglages du minuteur → *Activer les notifications*), puis accepte la demande du
      navigateur.
- [ ] Lance un minuteur d'**1 minute**, passe sur un **autre onglet** (ou une autre application) et **laisse sonner** :
      notification et son à la fin, et le titre de l'onglet affiche le temps restant pendant le décompte.
- [ ] Lance un minuteur, **ferme la page**, rouvre-la après la fin : le message « Terminé à … » est affiché, sans son
      ni notification (c'est voulu).
- [ ] Notifications refusées : le réglage l'explique et indique comment les réactiver.

## 6. Sauvegarde et thème
- [ ] **Sauvegarde → Exporter** : le fichier se télécharge (ou **Copier la sauvegarde** fonctionne).
- [ ] Ouvre le site dans une **fenêtre de navigation privée** : il est vide ; **Importer** le fichier : tout revient.
- [ ] Thème Clair, Sombre, Système : chacun est conservé après rechargement.
- [ ] Raccourcis clavier (hors champ de saisie) : `E` modifier la disposition, `A` catalogue, `?` aide, `Échap` ferme.

## 7. Sous-dossier et mises à jour
- [ ] Aucune page « 404 » ni ressource introuvable (onglet *Réseau*, filtre « 404 »).
- [ ] Après une mise à jour du dépôt, le site change au bout d'une à deux minutes et tes données sont intactes.
