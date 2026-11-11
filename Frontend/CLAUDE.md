# CampusHub – Frontend Angular (brief pour Claude Code)

Plateforme e-learning universitaire en microservices. Ce dossier `Frontend/` contient l'application Angular.
Les maquettes et leurs spécifications sont dans `Documentation/campushub_maquettes_et_specifications.md`
(images dans `Documentation/Maquettes/`). Interface en FRANÇAIS.

## Règles de travail (à respecter)
- Ne JAMAIS committer, pousser ni toucher à git : le propriétaire le fait lui-même.
- Un lot à la fois (voir « Ordre des lots »). Ne pas commencer le lot suivant sans demande.
- Lire seulement les fichiers utiles. Ne pas explorer `Backend/` : tout ce qu'il faut est dans ce fichier.
- Après chaque lot : `ng build` doit passer, puis résumer en 5 lignes max ce qui est fait et ce qui manque.
- Reproduire les maquettes fidèlement MAIS respecter les « Écarts maquettes / API » ci-dessous
  (pas de matricule dans l'en-tête, pas de note par étoiles, pas de bouton Keycloak ni « Créer un compte »).

## Stack et conventions
- Angular 22 (CLI 22), composants autonomes (standalone), signaux, SCSS, pas de SSR, Node 22.
- Pas de bibliothèque de composants lourde : SCSS + variables CSS (tokens ci-dessous). Icônes : `lucide-angular`.
- Structure : `src/app/core` (auth, intercepteurs, gardes, config), `src/app/shared` (layout, composants communs),
  `src/app/features/<domaine>` (courses, forum, evaluations, notifications, admin, profile).
- Un service HTTP par domaine, toutes les URLs construites depuis `environment.apiUrl`.
- `environment.ts` : `apiUrl: 'http://localhost:8080'`, `keycloakUrl: 'http://localhost:8180'`,
  `realm: 'campushub'`, `clientId: 'campushub-frontend'`.

## Design tokens (variables CSS globales)
Indigo `#4F46E5` (hover `#4338CA`), fond `#F8FAFC`, carte `#FFFFFF` (bordure `#E2E8F0`, rayon 12px),
sidebar `#1E1B4B`, succès `#22C55E` (fond `#DCFCE7`), alerte `#F59E0B` (fond `#FEF3C7`),
danger `#EF4444` (fond `#FEE2E2`), texte `#1E293B`, texte secondaire `#64748B`.
Police Inter ; H1 24px/600, H2 20px/600, H3 18px/500, texte 14px, légende 12px.
Boutons : hauteur 40px, rayon 8px. Mode sombre : interrupteur en bas de la sidebar (en dernier lot).

## Authentification (Keycloak, pas de service de login maison)
- Connexion : formulaire Angular (e-mail/identifiant + mot de passe) qui fait
  `POST {keycloakUrl}/realms/campushub/protocol/openid-connect/token`
  (`application/x-www-form-urlencoded`, `grant_type=password&client_id=campushub-frontend&username=..&password=..`).
- Réponse : `access_token` (JWT RS256, 30 min), `refresh_token`. Renouveler avec `grant_type=refresh_token`.
  Ne PAS vérifier la signature côté front : décoder seulement le payload.
- Claims utiles : `sub` (UUID de l'utilisateur), `given_name`, `family_name`, `email`, `realm_access.roles`.
- Rôle = le plus élevé parmi `ADMIN` > `ENSEIGNANT` > `ETUDIANT` (ignorer `offline_access`, `uma_authorization`,
  `default-roles-campushub`). Pas de rôle CampusHub → page 403.
- Intercepteur HTTP : ajoute `Authorization: Bearer <token>` à toutes les requêtes vers `apiUrl` (pas vers Keycloak).
  Sur 401 : une tentative de refresh, sinon page « Session expirée » (écran 2) avec bouton « Se reconnecter ».
  Sur 403 : page « Accès refusé » (écran 1). Sur 503 : message « Service momentanément indisponible ».
- Gardes de routes : connecté, et par rôle. Le menu de la sidebar dépend du rôle :
  ÉTUDIANT : Accueil, Mes cours, Catalogue, Forum, Évaluations, Notifications ;
  ENSEIGNANT : Accueil, Mes cours, Forum, Évaluations, Notifications ;
  ADMIN : Accueil, Utilisateurs, Cours, Forum, Catégories, Notifications.
- Stockage des tokens : `sessionStorage` (try/catch). Déconnexion = vider + retour à la connexion.
- Comptes de test (mot de passe `Test1234!`) : `etudiant1` (ETUDIANT), `enseignant1` (ENSEIGNANT), `admin1` (ADMIN).

## API : tout passe par la Gateway `http://localhost:8080` (token obligatoire sauf `/uploads/**`)
Les erreurs ne sont pas au même format selon le service : lire `message` s'il existe, sinon texte générique.

### Cours  — base `/api/v1/courses`  (Course Service, NestJS)
- `GET /` (liste, filtres : `formateurId`, `categorie`, recherche, pagination — vérifier la réponse réelle),
  `GET /categories` (liste des 11 catégories), `GET /:id` (détail avec chapitres), `POST /`, `PUT /:id`,
  `PATCH /:id/publish`, `PATCH /:id/archive`, `DELETE /:id`, `POST /:id/image` (multipart), `DELETE /:id/image`.
- Chapitres : `/api/v1/courses/:coursId/chapters` → `GET /`, `POST /`, `GET /:id`, `PUT /:id`, `DELETE /:id`,
  `PATCH /reorder` (liste COMPLÈTE des ids, sinon 400), `POST /:id/pdf` (multipart), `GET /:id/pdf`, `DELETE /:id/pdf`.
- Cours : `id`, `titre` (≤150), `description` (≤2000), `categorie`, `statut` (`BROUILLON|PUBLIE|ARCHIVE`),
  `imageUrl` (null → image par défaut ; fichiers servis par `/uploads/**`, public), `formateurId` (UUID, mis par le serveur),
  `nbChapitres` (liste seulement), `chapitres` (détail), `createdAt`, `updatedAt`.
- Chapitre : `id`, `coursId`, `titre` (≤150), `contenu` (texte/markdown/lien ou null), `ordre`, `visible` (défaut false),
  `telechargementAutorise` (défaut true), `pdfNom`, `pdfTaille`.
- Catégories : Developpement Web, Developpement Mobile, Data Science, Intelligence Artificielle, Reseaux et Securite,
  Cloud et DevOps, Bases de donnees, Design, Langues, Gestion de projet, Autre.
- Droits : ETUDIANT lit seulement les cours PUBLIE et chapitres visibles (sinon 404). ENSEIGNANT lit tout, crée, et
  modifie/publie/archive/supprime seulement SES cours (sinon 403). ADMIN lit et modifie tout.
- « Mes cours » formateur : `GET /api/v1/courses?formateurId=<sub>`.
- Règles UI : boutons de création/modification seulement pour ENSEIGNANT (ses cours) et ADMIN ; publier sans chapitre =
  refusé (désactiver le bouton + message) ; on ne supprime pas le dernier chapitre d'un cours publié ; un cours publié ne
  se republie pas, un archivé ne se réarchive pas (archivé → republier possible) ; image JPG/PNG/WebP ≤ 1 Mo, PDF ≤ 2 Mo.
  Après suppression d'un chapitre, recharger la liste (ordre renuméroté côté serveur).

### Forum — base `/api/v1/forum` (réécrit vers `/api/v1/...` côté service ; Express)
- Catégories : `GET /categories`, `POST|PUT|DELETE /categories[/:id]` (ADMIN) ; champs `name`, `description` (≤300), `order`.
  PAS de compteurs de sujets/réponses dans la réponse.
- Sujets : `GET /courses/:courseId/topics?categoryId=&tag=&resolved=&q=&page=&limit=` ; `POST /courses/:courseId/topics`
  (`title` 5–150, `content` ≤10000, `tags` ≤5, `categoryId` optionnel) ; `GET /topics/:id` ; `PUT /topics/:id` ;
  `DELETE /topics/:id` ; `PATCH /topics/:id/pin|lock|resolve` avec corps `{ "value": true|false }` (modération).
- Sujet : `title`, `content`, `courseId`, `categoryId`, `tags`, `authorId`, `authorRole`, `isPinned`, `isLocked`,
  `isResolved`, `repliesCount`, `viewsCount`, `lastActivityAt`. Liste : `{ items, page, limit, total, totalPages }`,
  triée épinglés d'abord puis activité récente.
- Messages : `GET /topics/:topicId/posts` ; `POST /topics/:topicId/posts` (`content` 1–10000, `parentPostId` optionnel) ;
  `PUT|DELETE /posts/:id` ; `PATCH /posts/:id/accept` `{ "value": bool }` ; `POST|DELETE /posts/:id/like`.
  Message : `content`, `authorId`, `authorRole`, `isAcceptedAnswer`, `likesCount`, `parentPostId`.
- Les sujets sont TOUJOURS rattachés à un cours (`courseId` obligatoire) : l'écran « Forum » doit choisir/connaître un cours.
- Pas de nom d'auteur dans l'API (seulement `authorId`/`authorRole`) → afficher le rôle ; les noms viendront du service
  User plus tard (isoler dans un `UserDirectoryService` qui renvoie `null` pour l'instant).

### Évaluations — base `/api/v1/evaluation` (réécrit vers `/api/...` ; ASP.NET). Propriétés en camelCase.
- `GET /quizzes/course/{courseId}` ; `GET /quizzes/{id}` ; `POST /quizzes` et `PUT /quizzes/{id}` (ENSEIGNANT/ADMIN) ;
  `DELETE /quizzes/{id}` ; `POST /quizzes/{id}/start` (ÉTUDIANT, renvoie une tentative avec `limiteUtc`) ;
  `POST /quizzes/{id}/submit` (ÉTUDIANT, corps `{ reponses: [{ questionId, reponseId }] }`).
- Résultats : `GET /resultats/me` (ÉTUDIANT), `GET /resultats/etudiant/{guid}`, `GET /resultats/quiz/{quizId}`
  (ENSEIGNANT/ADMIN), `GET /resultats/{id}`. Résultat : `id`, `quizId`, `etudiantId`, `score`, `datePassage`.
- Quiz : `id`, `titre`, `courseId`, `maxTentatives`, `dureeMinutes`, `questions[{ id, texte, reponses[{ id, texte }] }]`
  (les bonnes réponses ne sont pas envoyées à l'étudiant). Création : `reponses[{ texte, estCorrecte }]`.

### Notifications — base `/api/v1/notifications` (réécrit vers `/api/notifications` ; Laravel)
- `GET /?unread=1&per_page=20`, `GET /unread-count`, `PATCH /{id}/read`, `PATCH /read-all`, `DELETE /{id}`,
  `GET|PUT /preferences` (email, activation des e-mails, `muted_types`). `id` numérique.
- L'envoi d'annonces (broadcast) est INTERNE et non exposé : l'écran 29 n'est pas branchable.

### Inscriptions (Enrollment) — PAS ENCORE EXPOSÉ par la Gateway ni sécurisé
- Futur : `/api/v1/enrollments` (`etudiantId`, `coursId`, `dateInscription`, `progression.pourcentage`).
- En attendant : `EnrollmentService` avec des méthodes vides/fictives derrière une interface, « S'inscrire » désactivé,
  « Mes cours » étudiant en état vide.

### Utilisateurs (User) — non disponible
- Pas d'API de liste/détail/gestion. Profil : afficher prénom/nom/e-mail/rôle depuis le token (lecture seule) ;
  changement de mot de passe = lien vers la console de compte Keycloak.

## Écarts maquettes / API (décisions déjà prises)
1. Connexion : un seul formulaire, sans bouton Keycloak, sans « Créer un compte », sans « Mot de passe oublié ».
2. En-tête : prénom, nom, rôle (jamais de matricule). Cartes de cours : image, titre, catégorie, nb chapitres, formateur
   (nom du formateur indisponible → afficher « Formateur » tant que `UserDirectoryService` renvoie null). Pas d'étoiles.
3. Écran 4 « Détail d'un cours » : « S'inscrire » inactif (Enrollment absent). Surligner « Catalogue » dans le menu.
4. Écran 7 : actions par ligne Modifier, Aperçu, Publier, Archiver, Supprimer (selon statut) avec confirmation.
5. Écran 8 : pas de champ « Objectifs du cours » ni « Continuer » (un seul bouton Enregistrer) ; aperçu de l'image.
6. Écran 9 : ajouter le champ `contenu` du chapitre ; pas de panneau « Metadata/Statuts » ; message rouge si 0 chapitre.
7. Écrans 10–14 (forum) : pas de compteurs par catégorie ; sujets listés PAR COURS ; « Populaires » = tri client sur
   `repliesCount`/`viewsCount`, « Sans réponse » = filtre client `repliesCount === 0` ; afficher titre + question en haut
   du détail ; verrouillé → zone de réponse masquée + bandeau ; modération (ENSEIGNANT/ADMIN) : épingler, verrouiller,
   résolu, supprimer.
8. Écrans 15–18 : statut « À faire/En cours/Terminé » DÉDUIT (résultat existant = terminé) ; un quiz à la fois, UNE question
   par écran, minuteur depuis `limiteUtc`/`dureeMinutes` ; pas de seuil de validation, pas de points, pas d'explications,
   pas de correction détaillée ni de « Retenter » (l'API ne les fournit pas) → afficher score et date seulement.
9. Écrans 19–21 (formateur) : éditeur avec titre, durée, max tentatives, questions et réponses (une ou plusieurs bonnes) ;
   résultats par quiz = `GET /resultats/quiz/{id}` (ID étudiant seulement, pas de nom).
10. Écrans 22–24 : notifications + cloche (badge = `unread-count`, `9+` au-delà) ; préférences = e-mail + types coupés.
11. Écrans 25, 26, 27, 29, 30 (profil lecture seule), 31–33 (tableaux de bord) : données fictives ou partielles, derniers lots.
    Écran 28 (catégories forum, ADMIN) : branchable (CRUD catégories).

## Ordre des lots (un lot = une session, `/clear` entre deux)
1. Base : `environment`, thème SCSS (tokens), layout (sidebar + en-tête), AuthService, intercepteur, gardes,
   écrans 0 (connexion), 1 (403), 2 (session expirée).
2. Cours étudiant : catalogue (3), détail (4), lecture d'un chapitre (5), mes cours (6, vide).
3. Cours formateur : liste (7), formulaire (8), chapitres (9).
4. Forum : 10 à 14, puis écran 28 (catégories admin).
5. Notifications : 22, 23, 24.
6. Évaluations : 15 à 21.
7. Reste : tableaux de bord, profil, admin (données fictives si pas d'API), mode sombre.
8. Dockerisation : build Angular + nginx, bloc `docker-compose` (voir `Documentation/regles-communes-docker.txt`).

## Contraintes d'intégration
- La Gateway autorise CORS pour `http://localhost:4200`. En Docker, le frontend sera servi par nginx (le port sera défini à ce moment-là).
- Tout appel API passe par la Gateway (8080), jamais directement par un service.
