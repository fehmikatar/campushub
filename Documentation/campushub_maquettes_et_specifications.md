# CampusHub — Dossier Complet UI/UX & Maquettes Haute Fidélité (Desktop 1440px)

---

## Vue d'ensemble du Projet
- **Application** : CampusHub — Plateforme e-learning universitaire
- **Framework cible** : Angular (composants autonomes, Angular Material / Tailwind CSS, Lucide Icons)
- **Résolution standard** : Desktop 1440 × 900 px
- **Règles directrices validées** :
  - Palette : Indigo `#4F46E5` (accent principal), fond `#F8FAFC`, cartes `#FFFFFF`, Vert succès `#22C55E`, Orange alerte `#F59E0B`, Rouge danger `#EF4444`.
  - Typographie Inter (Titres 24/20/18 px, Texte courant 14 px, Légende 12 px, interlignage 1.5).
  - Navigation : Barre latérale indigo foncé (`#1E1B4B`) fixe à gauche, interrupteur Mode sombre en bas.
  - En-tête supérieur : Recherche contextuelle, cloche de notification avec badge dynamique, avatar + prénom + nom + rôle (Étudiant, Enseignant, Administrateur). Aucun matricule affiché.
  - Cartes de cours : Pas de note par étoiles. Uniquement image, titre, badge catégorie, nombre de chapitres, nom du formateur.

---

## LOT 1 – COURS, CÔTÉ ÉTUDIANT (Validé)

![Lot 1 – Cours côté étudiant](C:/Users/fehmi/.gemini/antigravity/brain/cff47cac-436c-4e78-a8a6-6c8b107e8a1e/.user_uploaded/media_1794363469689.jpg)

### 4. Détail d'un cours
- **Composants** : Bannière avec image de couverture (16:9), titre H1, badge catégorie (`#EEF2FF`), carte formateur (avatar + nom), bloc description textuel, liste ordonnée des chapitres avec picto cadenas/accès, bouton principal « S'inscrire » (`#4F46E5`).
- **États** : Non inscrit (bouton « S'inscrire » actif), Déjà inscrit (bouton devient « Continuer le cours »), Chargement (skeleton sur la liste des chapitres).

### 5. Lecture d'un chapitre
- **Composants** : Fil d'Ariane, titre du cours et du chapitre actif (H2), zone de lecture Markdown/HTML, panneau latéral accordéon avec progression des chapitres (chapitre courant en surbrillance indigo), barre d'actions avec boutons « Voir le PDF » (secondaire) et « Télécharger » (vert `#22C55E`), navigation pied-de-page « Chapitre précédent » et « Chapitre suivant ».
- **États** : Téléchargement autorisé (bouton vert visible), Téléchargement interdit (bouton masqué conditionnellement), Premier chapitre (« Chapitre précédent » désactivé), Dernier chapitre (« Chapitre suivant » remplacé par « Terminer le cours »).

### 6. Mes cours (étudiant)
- **Composants** : Grille de cartes de cours inscrits avec barre de progression linéaire (`#4F46E5`, 0 à 100%), pourcentage, bouton « Reprendre », onglets de filtrage (« Tous », « En cours », « Terminés »).
- **États** : État nominal avec cours en grille, État vide (*Empty State*) illustré avec message centré « Vous n'êtes inscrit à aucun cours » et bouton primaire « Accéder au catalogue → ».

---

## LOT 2 – COURS, CÔTÉ FORMATEUR (Validé)

![Lot 2 – Cours côté formateur](C:/Users/fehmi/.gemini/antigravity/brain/cff47cac-436c-4e78-a8a6-6c8b107e8a1e/.user_uploaded/media_1794363469674.jpg)

### 7. Mes cours (formateur)
- **Composants** : En-tête avec bouton primaire « + Nouveau cours », tableau de gestion (colonnes : Vignette + Titre, Catégorie en badge neutre, Nombre de chapitres, Statut en badge coloré, Date de création, Menu d'actions par ligne : Modifier [crayon], Publier/Aperçu [œil], Archiver [dossier], Supprimer [poubelle rouge]).
- **États** : Statuts de cours (Brouillon en ambre `#F59E0B`, Publié en émeraude `#22C55E`, Archivé en gris ardoise `#64748B`), survol de ligne avec actions rapides, modal de confirmation avant suppression.

### 8. Formulaire de cours
- **Composants** : Champ titre (max 150 caractères avec compteur dynamique `x/150`), zone de texte enrichi pour la description, liste déroulante Catégorie (11 catégories académiques prédéfinies), zone de téléversement Drag & Drop pour l'image de couverture (JPG/PNG/WebP, max 1 Mo) avec prévisualisation immédiate, boutons d'action « Enregistrer le brouillon » et « Continuer ».
- **États** : Champ valide (bordure grise claire), Erreur de validation (bordure rouge `#EF4444` + message d'aide sous le champ), Fichier téléversé trop lourd (> 1 Mo : alerte rouge inline).

### 9. Gestion des chapitres
- **Composants** : Liste réordonnable par poignées de glisser-déposer (Drag & Drop), par ligne : numéro d'ordre, titre éditable, interrupteur toggle « Visible », interrupteur toggle « Téléchargement autorisé », bouton téléversement PDF (max 2 Mo) avec statut du fichier, icône supprimer, bouton « + Ajouter un chapitre » en pied de page.
- **États** : Bannière d'alerte rouge d'erreur visible si 0 chapitre : « ⚠️ Ajoutez au moins un chapitre pour publier ce cours », Fichier PDF attaché (nom affiché + icône suppression), Envoi en cours (barre de chargement circulaire).

---

## LOT 3 – FORUM DE DISCUSSION

![Lot 3 – Forum](C:/Users/fehmi/.gemini/antigravity/brain/cff47cac-436c-4e78-a8a6-6c8b107e8a1e/campushub_lot3_forum_1794363645136.jpg)

### 10. Accueil du forum
- **Composants** : En-tête de section avec barre de recherche globale de sujets, bouton primaire « Nouveau sujet » (`#4F46E5`), grille de cartes des catégories de discussion (icône Lucide, titre, description courte, compteurs de sujets et de réponses), panneau latéral des sujets récents et actifs.
- **États** : État standard affichant toutes les catégories, Catégorie sans activité (badge « 0 sujet »), Filtrage en temps réel via la barre de recherche.

### 11. Liste des sujets d'une catégorie
- **Composants** : Fil d'Ariane, en-tête de catégorie avec compteur total, barre de recherche interne, onglets de tri (« Récents », « Populaires », « Sans réponse »), liste paginée des sujets avec titre cliquable, auteur (avatar + rôle), date relative, badges d'état (« Épinglé » `#4F46E5`, « Résolu » `#22C55E`, « Verrouillé » `#F59E0B`), compteur de réponses avec icône bulle.
- **États** : Sujet épinglé (fond légèrement bleuté en tête de liste), Sujet résolu (coche verte et badge), Recherche sans résultat (message d'absence de sujet et bouton pour réinitialiser les filtres).

### 12. Détail d'un sujet
- **Composants** : Question initiale dans une carte blanche (avatar auteur, nom, badge de rôle, date, contenu avec coloration syntaxique du code, bouton « J'aime » avec compteur incrémental, menu contextuel Modifier/Supprimer pour l'auteur), fil chronologique des réponses, badge « Meilleure réponse » vert épinglé sous la réponse validée, bloc éditeur « Répondre » avec barre d'outils Markdown (Gras, Italique, Code, Lien, Liste) et bouton « Publier la réponse ».
- **États** : Réponse likée (icône pouce/cœur remplie en indigo), Sujet verrouillé (zone de réponse masquée avec bandeau d'information ambre « Ce sujet est verrouillé »), Édition d'un message en cours (remplacement inline du texte par le formulaire).

### 13. Nouveau sujet
- **Composants** : Formulaire centré avec fil d'Ariane, champ Titre (texte libre), liste déroulante « Catégorie », liste déroulante facultative « Cours lié » (auto-complétion des cours inscrits), éditeur de texte avec barre de mise en forme simplifiée, boutons « Publier le sujet » et « Annuler ».
- **États** : Validation des champs obligatoires (titre et catégorie requis avant activation du bouton), Mode prévisualisation Markdown activable.

### 14. Modération d'un sujet (Enseignant & Admin)
- **Composants** : Bouton d'actions modérateur à trois points (`...`) ouvrant un menu popover avec 4 actions typées : « 📌 Épingler / Désépingler », « 🔒 Verrouiller / Déverrouiller », « ✅ Marquer comme résolu », « 🗑️ Supprimer le sujet » (texte rouge).
- **États** : Modal de confirmation avant suppression définitive d'un sujet ou d'un message inapproprié, Notification toast de succès après application d'une action modératrice.

---

## LOT 4 – ÉVALUATIONS ET QUIZ

![Lot 4 – Évaluations](C:/Users/fehmi/.gemini/antigravity/brain/cff47cac-436c-4e78-a8a6-6c8b107e8a1e/campushub_lot4_evaluations_1794363682318.jpg)

### 15. Liste des quiz d'un cours (Étudiant)
- **Composants** : Filtres par onglets (« Tous », « À faire », « En cours », « Terminés »), cartes de quiz avec titre, durée estimée, nombre de questions, badge d'état (« À faire » gris, « En cours » orange `#F59E0B`, « Terminé » vert `#22C55E`), note obtenue (ex: « 18 / 20 »), bouton d'action contextuel (« Commencer », « Reprendre », ou « Voir le résultat »).
- **États** : Quiz non commencé (bouton primaire « Commencer »), Quiz entamé avec sauvegarde automatique (bouton ambre « Reprendre »), Quiz expiré ou hors délai (badge rouge désactivé).

### 16. Passage d'un quiz
- **Composants** : En-tête fixe avec intitulé du quiz, barre de progression dynamique (« Question 4 sur 10 »), badge minuteur avec compte à rebours visible (`⏱️ 14:32 restant`), carte de la question courante avec formulation claire, liste des options de réponses sous forme de cartes radio interactives cliquables, barre de pied de page avec boutons « ← Précédent », « Suivant → » et bouton final « Soumettre le quiz ».
- **États** : Option sélectionnée (bordure indigo 2px + puce radio active), Moins de 2 minutes restantes (minuteur passe en alerte rouge pulsante), Dernière question (le bouton « Suivant » se transforme en bouton indigo « Soumettre » avec dialogue de confirmation).

### 17. Résultat d'un quiz
- **Composants** : Carte récapitulative de score avec jauge radiale ou grand indicateur (« 16 / 20 — 80% »), mention de validation (« Validé avec succès » en vert ou « Non validé » en rouge), métriques clés (temps passé, nombre de réponses justes/fausses), accordéon de correction détaillée listant chaque question avec coche verte ou croix rouge et encart d'explication pédagogique.
- **États** : Succès (score ≥ note éliminatoire, badge vert), Échec (score insuffisant, bouton « Retenter le quiz » si autorisé par l'enseignant).

### 18. Mes résultats (Historique étudiant)
- **Composants** : Cartes KPI globales (Moyenne générale « 15.8 / 20 », Total des quiz complétés, Taux de réussite), graphique en barres sobre montrant les scores par module de cours, tableau récapitulatif chronologique (Titre du cours, Quiz, Note, Statut, Date, Bouton détails).
- **États** : Données complètes affichées, État vide si aucun quiz passé, Tri par colonne de note ou de date.

### 19. Gestion des quiz d'un cours (Formateur)
- **Composants** : En-tête avec bouton primaire « + Créer un quiz », tableau des quiz du cours (Titre, Nombre de questions, Durée allouée, Statut « Brouillon » / « Publié », Moyenne des étudiants), menu d'actions par ligne (Modifier [crayon], Statistiques/Résultats [graphique], Supprimer [poubelle]).
- **États** : Quiz publié (non modifiable directement si des étudiants ont déjà soumis), Quiz brouillon (éditable librement), Suppression protégée par mot de confirmation.

### 20. Éditeur de quiz (Formateur)
- **Composants** : En-tête de configuration (Titre du quiz, Durée en minutes, Seuil de validation en %), bloc répéteur de questions (Énoncé texte, Type choix unique ou multiple, Points attribués, Liste des options de réponse avec bouton radio vert pour désigner la bonne réponse, Bouton « + Ajouter une option »), bouton d'ajout de question et boutons d'enregistrement (« Sauvegarder » et « Publier »).
- **États** : Erreur si aucune bonne réponse cochée sur une question, Question réordonnable par poignée de glissement, Question supprimable via icône poubelle.

### 21. Résultats des étudiants d'un cours (Formateur)
- **Composants** : Panneau de statistiques d'ensemble (Moyenne de classe « 14.2 / 20 », Taux de réussite « 85% », Nombre de participants « 42/48 »), histogramme de distribution des notes par tranche, tableau individuel des étudiants (Avatar, Nom, Prénom, Date de passage, Note obtenue, Statut Validé/Échoué, Action « Consulter la copie »).
- **États** : Export des résultats en CSV/Excel via bouton dédié, Filtre par groupe ou par seuil de note.

---

## LOT 5 – NOTIFICATIONS ET INSCRIPTIONS

![Lot 5 – Notifications et Inscriptions](C:/Users/fehmi/.gemini/antigravity/brain/cff47cac-436c-4e78-a8a6-6c8b107e8a1e/campushub_lot5_notifications_1794363751427.jpg)

### 22. Centre de notifications
- **Composants** : En-tête avec filtres d'onglets (« Toutes », « Non lues »), bouton secondaire « Tout marquer comme lu », liste de cartes de notifications avec icône de typologie (Forum, Cours, Évaluation, Annonce système), titre en gras pour les éléments non lus avec puce ronde indigo, texte explicatif, horodatage relatif (ex: « il y a 2 heures »), bouton poubelle pour suppression individuelle.
- **États** : Notification non lue (fond légèrement teinté, point indigo `#4F46E5`), Notification lue (fond blanc, typographie normale), État vide (*Empty State*) avec illustration épurée et message « Aucune notification pour le moment ».

### 23. Menu déroulant de la cloche (Popover En-tête)
- **Composants** : Fenêtre contextuelle ancrée sous la cloche de l'en-tête, liste compacte des 5 dernières notifications avec icône de catégorie, titre, aperçu sur une ligne et temps écoulé, pied de popover avec lien textuel « Voir toutes les notifications → ».
- **États** : Pastille rouge de badge sur la cloche (nombre d'alertes non lues, max `9+`), Clic sur un élément ouvrant directement la ressource concernée (sujet du forum ou quiz), État sans notification affichant « Aucune notification récente ».

### 24. Préférences de notifications
- **Composants** : Page de réglages structurée en deux sections (« Notifications sur la plateforme » et « Alertes par e-mail »), commutateurs à bascule (Toggle Switches) pour chaque événement : Réponses sur mes sujets de forum, Nouveaux chapitres de cours, Notes et retours de quiz disponibles, Annonces globales de l'université, bouton primaire « Enregistrer les préférences ».
- **États** : Commutateur activé (fond indigo `#4F46E5` avec curseur blanc à droite), Commutateur désactivé (fond gris ardoise clair `#CBD5E1`), Toast de confirmation de sauvegarde des paramètres.

### 25. Étudiants inscrits à un cours (Formateur)
- **Composants** : Titre du cours avec effectif total (« Développement Web avec Angular — 48 inscrits »), champ de recherche d'étudiant, tableau détaillé des inscriptions (Avatar, Nom et prénom de l'étudiant, Adresse e-mail institutionnelle, Date d'inscription, Barre de progression globale en pourcentage, Date de dernier accès, Bouton d'action pour envoyer un message ou voir le détail de progression).
- **États** : Tri par progression (croissante / décroissante), Étudiant inactif (> 15 jours sans connexion surligné d'un badge d'avertissement ambre), Aucun inscrit (état vide avec invitation à partager le lien du cours).

---

## LOT 6 – ADMINISTRATION ET TABLEAUX DE BORD

![Lot 6 – Administration et Tableaux de bord](C:/Users/fehmi/.gemini/antigravity/brain/cff47cac-436c-4e78-a8a6-6c8b107e8a1e/campushub_lot6_admin_dashboards_1794363837637.jpg)

### 26. Admin – Gestion des utilisateurs
- **Composants** : Barre latérale avec menu Admin actif (« Utilisateurs »), barre de recherche globale, filtre sélectif par rôle (« Tous », « Étudiants », « Enseignants », « Administrateurs »), bouton primaire « + Nouvel utilisateur », tableau complet (Avatar, Nom, E-mail, Badge de rôle aux couleurs dédiées : Étudiant indigo clair `#EEF2FF`, Enseignant émeraude `#DCFCE7`, Admin violette `#F3E8FF`, Statut « Actif » vert ou « Suspendu » rouge, Actions : Éditer, Réinitialiser le mot de passe, Suspendre, Supprimer).
- **États** : Filtrage instantané, Utilisateur suspendu grisé avec statut rouge `#EF4444`, Modal d'ajout rapide d'un compte.

### 27. Admin – Détail d'un utilisateur
- **Composants** : Carte d'identité utilisateur (Grande photo de profil, Nom, Rôle modifiable via menu déroulant, Date d'inscription, Statut du compte), onglets de navigation interne (« Cours associés », « Activité récente », « Journaux de sécurité »), boutons d'action d'administration (« Réinitialiser l'accès », « Suspendre le compte », « Enregistrer les modifications »).
- **États** : Mode consultation versus mode édition, Rôle changé avec demande de validation par dialogue modal.

### 28. Admin – Catégories du forum
- **Composants** : Tableau récapitulatif des catégories de discussion (Nom de la catégorie, Description, Couleur/Icône Lucide associée, Nombre de sujets actifs, Ordre d'affichage), bouton primaire « + Créer une catégorie », actions par ligne (Renommer [crayon], Réordonner [flèches], Supprimer [poubelle]).
- **États** : Empêchement de suppression d'une catégorie contenant des sujets actifs (alerte proposant de déplacer les sujets vers une autre catégorie), Formulaire modal de création inline.

### 29. Admin – Envoyer une annonce
- **Composants** : Formulaire de diffusion (Sélecteur de cible : « Tous les utilisateurs », « Étudiants uniquement », « Enseignants uniquement »), champ Titre de l'annonce, sélecteur de priorité (Information `#4F46E5`, Important `#F59E0B`, Urgent `#EF4444`), zone de saisie du message avec éditeur de texte riche, panneau latéral d'aperçu en direct (*Live message preview*), bouton d'envoi broadcast « Envoyer à tous ».
- **États** : Bouton désactivé tant que le titre ou le contenu est vide, Modal d'avertissement solennel avant émission confirmant le nombre de destinataires touchés.

### 30. Mon profil (Universel Étudiant / Enseignant)
- **Composants** : Carte de photo de profil avec bouton de remplacement / téléversement d'image, formulaire d'informations personnelles (Prénom, Nom, Adresse e-mail universitaire, Rôle en lecture seule verrouillé avec badge académique, Département/Filière), section de sécurité (Changement du mot de passe avec règles de complexité), bouton de sauvegarde « Enregistrer les modifications ».
- **États** : Données modifiées non sauvegardées (bouton passe en surbrillance), Mot de passe (indicateur de force visuel rouge/orange/vert).

### 31. Tableau de bord étudiant
- **Composants** : Bannière de bienvenue personnalisée (« Bonjour, Yassine ! 👋 »), cartes KPI en haut (Nombre de cours en cours, Prochains quiz à passer, Moyenne générale), section « Reprendre l'apprentissage » avec cartes de cours récentes intégrant barre de progression et bouton « Continuer », calendrier compact des prochaines échéances et devoirs, bloc des dernières notifications non lues.
- **États** : Reprise directe au dernier chapitre consulté en 1 clic, Absence d'évaluation à venir (message rassurant « Aucun examen prévu cette semaine »).

### 32. Tableau de bord formateur
- **Composants** : En-tête de bienvenue enseignant (« Bonjour, Dr. Sonia Ben Romdhane 👩‍🏫 »), indicateurs clés de performance (Cours actifs gérés, Total des étudiants suivis, Questions de forum en attente de réponse), liste des derniers cours mis à jour avec raccourcis d'édition, flux des questions récentes du forum liées à ses cours avec bouton d'accès rapide, widget des dernières soumissions de quiz.
- **États** : Question sans réponse surlignée d'un badge rouge vif « En attente », Mise à jour en temps réel des statistiques d'inscription.

### 33. Tableau de bord administrateur
- **Composants** : Compteurs KPI globaux sous forme de cartes d'impact (Total Utilisateurs « 1 450 », Cours publiés « 85 », Sujets de forum « 3 240 », Disponibilité de la plateforme « 99.8% »), graphiques de tendances d'activité hebdomadaire (inscriptions et connexions sur courbe lissée), tableau des journaux d'audit récents (Date, Utilisateur, Type d'événement, Adresse IP, Statut).
- **États** : Sélection de la plage temporelle (7 jours, 30 jours, 1 an), Exportation du rapport d'activité globale au format PDF.

---

## PLANCHE DU DESIGN SYSTEM MIS À JOUR

![Planche Design System Mis à jour](C:/Users/fehmi/.gemini/antigravity/brain/cff47cac-436c-4e78-a8a6-6c8b107e8a1e/campushub_design_system_1794363881561.jpg)

### Spécifications des Tokens & Composants

| Domaine | Élément / Token | Valeur Hex / Spécification | Usage & Règle d'implémentation |
| :--- | :--- | :--- | :--- |
| **Couleurs** | Indigo Primaire | `#4F46E5` (Hover: `#4338CA`) | Boutons principaux, liens actifs, progression, puces |
| | Fond Général | `#F8FAFC` (Slate 50) | Arrière-plan standard de toutes les pages |
| | Fond Cartes | `#FFFFFF` | Cartes blanches, bordure `1px solid #E2E8F0`, rayon `12px` |
| | Sidebar Navigation | `#1E1B4B` (Indigo 950) | Barre latérale fixe, contraste élevé, texte blanc/gris |
| | Vert Succès | `#22C55E` (Fond: `#DCFCE7`) | Quiz validé, cours publié, sujet résolu, téléchargement |
| | Orange Alerte | `#F59E0B` (Fond: `#FEF3C7`) | Cours brouillon, sujet verrouillé, temps restant faible |
| | Rouge Danger | `#EF4444` (Fond: `#FEE2E2`) | Erreur de validation, suppression, action destructive |
| | Texte Principal | `#1E293B` (Slate 800) | Titres, labels, texte à fort contraste |
| | Texte Secondaire | `#64748B` (Slate 500) | Métadonnées, descriptions, horodatages |
| **Typographie** | Police globale | `Inter`, sans-serif | Uniformité typographique sur toute l'application |
| | Titre H1 | `24px` / Semi-bold (600) | Titres majeurs d'écrans et bannières |
| | Titre H2 | `20px` / Semi-bold (600) | En-têtes de sections et cartes majeures |
| | Titre H3 | `18px` / Medium (500) | Titres de cartes de cours et sous-sections |
| | Corps de texte | `14px` / Regular (400) | Textes courants, lignes de tableau, descriptions |
| | Légende / Badges | `12px` / Medium (500) | Badges de statut, métadonnées, horodatages |
| **Boutons** | Bouton Primaire | Fond `#4F46E5`, texte blanc | Hauteur 40px, rayon 8px, padding 12px 20px |
| | Bouton Secondaire | Fond `#FFFFFF`, bordure `#E2E8F0` | Hauteur 40px, texte `#1E293B`, survol `#F1F5F9` |
| | Bouton Danger | Fond `#EF4444`, texte blanc | Utilisé pour les actions irréversibles |
| | Lien texte | Couleur `#4F46E5`, flèche `→` | Navigation contextuelle vers listes ou détails |
| **Formulaires** | Champ de saisie | Bordure `#E2E8F0`, fond blanc | Focus avec contour indigo `2px #4F46E5`, rayon 8px |
| | Interrupteur Toggle | Curseur mobile blanc | Activé `#4F46E5`, Désactivé `#CBD5E1` |
| | Téléversement Drag & Drop | Bordure tiretée `2px #CBD5E1` | Fond `#F8FAFC`, icône upload, mention taille max |
| **Cartes** | Carte de cours | 100% conforme à la consigne | Image 16:9, titre, badge catégorie, nb chapitres, formateur. **ZÉRO ÉTOILE**. |
| **États UI** | Skeleton Loader | Animation pulse `#E2E8F0` | Rendu pendant le chargement des données Angular |
| | Empty State | Illustration sobre + bouton | Affiché si liste vide (cours, notifications, forum) |
| | Bannière d'erreur | Fond `#FEE2E2`, bordure `#EF4444` | Message bloquant explicite (ex: chapitre manquant) |
