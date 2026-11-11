# Interfaces Course

Module autonome Angular : catalogue, mes cours, detail, lecture, creation/modification,
images, publication/archivage/suppression, chapitres et PDF. Les appels passent par
`environment.apiUrl` et la Gateway, jamais directement par Course.

## Connexion et design de main

Le login /login, AuthService, le renouvellement de session, les gardes, l'intercepteur
HTTP et le layout partages de main sont conserves. Course lit le token courant via
AuthService.accessToken(), sans copie manuelle ni second stockage.

Les liens du menu existant /catalogue et /mes-cours ouvrent les interfaces Course.
Les routes /courses/:id, /courses/new, /courses/:id/edit et /courses/:id/chapters
sont hebergees dans le meme layout protege. La page admin /cours conserve son design
et ses actions, avec des liens vers les formulaires et chapitres.

## Lancement local

Node 24.15 minimum pour la branche 24 (ou Node 22.22.3 minimum pour la branche 22).
Depuis `Frontend` : `npm.cmd ci`, puis `npm.cmd start`.
Avec l'ancienne version locale de Node :

```powershell
npm.cmd exec --yes --package=node@24.15.0 -- node node_modules/@angular/cli/bin/ng.js serve --host localhost
```

Ouvrir http://localhost:4200/courses. Gateway (8080), Eureka, Course, PostgreSQL et
Keycloak doivent fonctionner ; Course doit etre enregistre dans Eureka.

Ouvrir /login et utiliser un compte Keycloak existant avec le role voulu.
Aucune configuration serveur Keycloak n'est modifiee par ce module.

## Parcours manuel : enseignant

1. Se connecter avec un compte possedant le realm role ENSEIGNANT.
2. Ouvrir /courses/mine : seuls ses cours sont demandes avec formateurId=sub.
3. Creer un cours (titre, categorie, description, image facultative).
4. Dans la gestion des chapitres : ajouter deux chapitres ; rendre le premier visible,
   garder le second masque. Modifier leur contenu, puis changer leur ordre par les
   fleches ou par glisser-deposer. Le serveur recoit TOUS les identifiants.
5. Ajouter un PDF de moins de 20 Mo, le remplacer, le consulter puis le retirer.
6. Depuis Mes cours : publier, consulter, modifier puis archiver le cours ; republier
   si necessaire. Le bouton Publier est inactif sans chapitre ou si deja publie.
7. Verifier que le dernier chapitre d'un cours publie ne peut pas etre supprime.
8. Tester image JPG/PNG/WebP (max 1 Mo), retrait d'image et refus des fichiers trop gros.
9. Supprimer le cours de test apres confirmation.
10. Avec un second enseignant, ouvrir le cours du premier : lecture autorisee, controles
    d'edition absents ; les URL d'edition affichent un refus.

## Parcours manuel : etudiant

1. Se deconnecter puis se reconnecter avec un compte ETUDIANT.
2. Verifier le catalogue, recherche, categorie et pagination.
3. Consulter un cours PUBLIE : seuls les chapitres visibles apparaissent.
4. Lire un chapitre et ouvrir son PDF (requete authentifiee en blob).
5. Le bouton Telecharger disparait quand telechargementAutorise=false.
6. Aucun bouton de creation/modification ; une URL d'edition directe est refusee.
7. Un cours brouillon/archive ou un chapitre masque doit retourner 404.
8. Mes cours affiche un etat vide : Enrollment n'est pas encore disponible, aucun
   faux cours inscrit ni fausse progression. Le bouton S'inscrire est desactive.

## Verification automatique

```powershell
npm.cmd exec --yes --package=node@24.15.0 -- node node_modules/@angular/cli/bin/ng.js test --watch=false
npm.cmd exec --yes --package=node@24.15.0 -- node node_modules/@angular/cli/bin/ng.js build
```

Les tests verifient les droits affiches depuis la session et les contrats HTTP Gateway
(token, filtres, creation sans formateurId, ordre complet, multipart PDF et blob protege).
Ils ne remplacent pas le parcours manuel sur les vrais services.
