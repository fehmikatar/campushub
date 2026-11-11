# Quiz / Evaluation

Frontend Angular 22 standalone, dans le layout existant. Aucun changement du backend.

- `/quiz` : cours paginés, liste des quiz du cours, actions selon le rôle.
- `/quiz/new?courseId=12` et `/quiz/:id/edit` : éditeur enseignant/admin.
- `/quiz/:id/play` : passage étudiant, une question à la fois, progression et minuterie.
- `/quiz/result/:id` : score, date, tentatives restantes et nouvelle tentative si autorisée.
- `/quiz/:id/results` : résultats par étudiant, accessibles au créateur ou à l'admin.
- `/evaluations` : historique personnel de l'étudiant ; gestion par cours pour l'enseignant.

Le menu Quiz apparaît immédiatement avant Notifications pour les trois rôles.
Le détail d'un cours contient également un lien vers ses quiz. Login, refresh,
guards et intercepteur HTTP existants sont réutilisés. Toutes les requêtes utilisent
AppConfig.apiUrl + `/api/v1/evaluation` et le token transmis par l'intercepteur.

## Tests manuels

1. Enseignant/admin : choisir un cours existant, créer un quiz avec deux tentatives,
   une minute, une question et deux réponses. Sélectionner exactement une bonne réponse.
2. Avant tout passage étudiant, modifier le titre puis les questions. Resélectionner
   les bonnes réponses lors de l'édition. Vérifier aussi la suppression avec confirmation
   sur un autre quiz de test.
3. Étudiant : aucun bouton de création, accès direct à `/quiz/new` refusé. Choisir le
   cours, ouvrir le quiz puis Commencer. Ouvrir la page seule ne démarre pas de tentative.
4. Sélectionner une réponse, passer aux questions suivantes, soumettre et confirmer.
   Vérifier le score, la date et le nombre de tentatives restantes depuis l'API.
5. Refaire une tentative puis vérifier que le quota empêche de recommencer.
6. Sur un autre quiz chronométré, sélectionner au moins une réponse et laisser le temps
   expirer : un seul envoi automatique doit être effectué à l'échéance du serveur.
7. Créateur/admin : consulter les résultats. Les modifications/suppressions d'un quiz
   possédant déjà des résultats reçoivent 409, conformément au backend.

## Contraintes de l'API constatées

- Une seule bonne réponse par question, et non plusieurs.
- Le DTO de lecture ne renvoie jamais `estCorrecte`, même pour le créateur : la correction
  doit être resélectionnée explicitement à chaque modification ; aucune correction inventée.
- Le DTO Quiz ne contient pas l'identifiant du créateur. Le frontend ne peut pas déduire
  l'appartenance d'un quiz depuis ce DTO. Le backend contrôle la propriété pour PUT,
  DELETE et résultats et peut répondre 403 aux autres enseignants.
- Le serveur refuse une soumission sans aucune réponse (400). A l'expiration sans réponse,
  l'interface explique qu'aucun résultat n'a été enregistré et propose une nouvelle tentative
  si le quota le permet ; aucun faux score n'est fabriqué. Les questions non répondues
  comptent comme fausses lorsqu'au moins une réponse valide est fournie.
- La reprise d'une tentative utilise sa limite UTC serveur. Les réponses sont conservées
  dans la session du navigateur par utilisateur, quiz et identifiant de tentative. Seules
  les réponses appartenant encore au quiz sont restaurées. Le brouillon est supprimé après
  succès. Une confirmation prévient avant de quitter. Après une réponse réseau perdue,
  l'historique serveur est consulté avant de renvoyer pour éviter une soumission en double.
- Si Evaluation est indisponible (503/réseau) ou Course refuse son contrôle d'existence,
  les erreurs restent visibles. Aucune modification backend ou contournement d'API inclus.

## Lancement et validation

Depuis Frontend avec Node compatible : `npm.cmd start`. Si nécessaire :

```powershell
npm.cmd exec --yes --package=node@24.15.0 -- node node_modules/@angular/cli/bin/ng.js serve --host localhost --port 4200
npm.cmd exec --yes --package=node@24.15.0 -- node node_modules/@angular/cli/bin/ng.js test --watch=false
npm.cmd exec --yes --package=node@24.15.0 -- node node_modules/@angular/cli/bin/ng.js build
```

Services requis : Gateway, Keycloak, Course, Evaluation et leurs bases. Utiliser les
comptes Keycloak déjà configurés, avec les rôles exacts ETUDIANT, ENSEIGNANT et ADMIN.

### Proxy local pour les essais navigateur

Le backend Evaluation actif renvoie actuellement une valeur CORS en double avec
la Gateway, bloquée par Chrome (`MultipleAllowOriginValues`). Aucune modification
backend n'a été faite. Le proxy de développement Angular transmet `/gateway/**`
à `http://localhost:8080`, en retirant le préfixe `/gateway`.

Pour l'activer sur une autre machine, copier `public/config.local.example.json`
vers `public/config.local.json` (ignoré par Git), puis redémarrer `ng serve`.
Le frontend appelle ainsi la même origine et la Gateway reste le point d'entrée API.
Les adresses de Keycloak et le stockage de session existants restent inchangés.

Ce proxy appartient au serveur de développement Angular. Avant un déploiement,
supprimer l'override local de l'artefact et faire corriger le doublon CORS côté
Gateway/Evaluation, ou fournir un reverse proxy équivalent dans l'hébergement.
