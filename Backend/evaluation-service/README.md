# Evaluation Service

**Framework :** ASP.NET Core Web API (.NET 10)
**Base de données :** SQL Server (Entity Framework Core, Code First)
**Port :** 8084
**Sécurité :** JWT HS256 (validation seule, token émis par le User Service)

Gère les quiz, les tentatives, leur correction et les résultats des étudiants.

Ce service est indépendant : `CourseId` référence le service Course (entier),
`EtudiantId` et `EnseignantId` référencent le service User (Guid). Aucune clé
étrangère SQL vers ces services.

## Démarrer en local

1. Créer un fichier `.env` local (non committé) à partir de l'exemple :

   ```bash
   cp .env.example .env
   ```

   puis renseigner `JWT_SECRET` (chaîne UTF-8 brute, **minimum 32 octets**),
   identique à celui du User Service.

2. Lancer le service :

   ```bash
   dotnet restore
   dotnet run --urls=http://localhost:8084
   ```

   Variante : `dotnet user-secrets set "JWT_SECRET" "..."` (le projet est
   initialisé pour les user-secrets) ou variable d'environnement `JWT_SECRET`.

L'API est disponible sur `http://localhost:8084`. En développement, la
documentation OpenAPI est exposée (`Program.cs`, `MapOpenApi`).

## Intégration Eureka / API Gateway

Le service s'enregistre dans Eureka sous le nom **`evaluation-service`** (VIP
`evaluation-service`), sur `http://localhost:8761/eureka/`, avec l'instance
`evaluation-service:localhost:8084`.

- Écoute HTTP fixée à `http://localhost:8084` par la clé `Urls` de
  `appsettings.json` (surchargeable par `ASPNETCORE_URLS` ou `--urls`).
- Port annoncé à Eureka : `Eureka:Instance:Port` = `8084`, cohérent avec
  l'écoute Kestrel.
- Le registre n'est pas interrogé (`ShouldFetchRegistry=false`) : le service
  ne dépend d'aucun autre service pour démarrer.
- Si le serveur Eureka (8761) est arrêté, le service démarre quand même ;
  l'enregistrement est réessayé en arrière-plan.
- `GET /health` est public et renvoie `{"status":"UP"}` (sans authentification),
  pour la gateway et l'orchestration. Eureka s'appuie aussi sur les heartbeats
  de l'instance.
- Côté gateway, router `/api/v1/evaluation/**` vers `lb://evaluation-service`
  avec une réécriture vers `/api/**` (la gateway n'est pas modifiée par ce
  dépôt).

## Tester avec Swagger

En développement uniquement, l'interface Swagger UI est disponible sur
`http://localhost:8084/swagger` (le JSON OpenAPI reste accessible sur
`http://localhost:8084/openapi/v1.json`).

1. Démarrer le service puis ouvrir `http://localhost:8084/swagger`.
2. Cliquer sur **Authorize**.
3. Coller le token JWT **sans** le mot `Bearer` (par exemple le champ
   `accessToken` renvoyé par `POST http://localhost:8081/api/v1/auth/login`).
4. Valider, puis appeler les endpoints protégés depuis Swagger UI.

Swagger UI n'est pas exposé en production (`ASPNETCORE_ENVIRONMENT` différent
de `Development`).

> Le service **refuse de démarrer** si `JWT_SECRET` est absent ou trop court
> (message explicite). Aucune valeur par défaut n'est stockée dans le code ni
> dans `appsettings.json`.

## Base de données

SQL Server LocalDB par défaut (`appsettings.json` ->
`ConnectionStrings:DefaultConnection`, surchargeable via
`ConnectionStrings__DefaultConnection`).

```bash
dotnet ef database update          # créer / mettre à jour la base
dotnet ef migrations add NomMigration
```

La migration `AddTentativesEtDuree` ajoute `MaxTentatives` (défaut 1) et
`DureeMinutes` à `Quizzes`, crée la table `Tentatives` et les index associés.

Équivalent en Console du Gestionnaire de package (Visual Studio) :

```powershell
Add-Migration Initial
Update-Database
```

## Sécurité

### Variables d'environnement

| Variable | Rôle | Défaut |
|---|---|---|
| `JWT_SECRET` | Secret HS256, chaîne UTF-8 brute (pas de Base64), min. 32 octets | aucune (obligatoire) |
| `JWT_ISSUER` | Issuer exigé (claim `iss`) | aucune (obligatoire) |
| `CORS_ALLOWED_ORIGINS` | Origines CORS autorisées, séparées par des virgules | `http://localhost:3000` |
| `ConnectionStrings__DefaultConnection` | Chaîne de connexion SQL Server | valeur de `appsettings.json` |

Sources possibles : fichier `.env` (copié depuis `.env.example`, non committé),
user-secrets, ou variables d'environnement.

### Caractéristiques du token attendu

- Algorithme **HS256**, clé = `JWT_SECRET` encodé en UTF-8 (pas de décodage Base64).
- **Issuer** exigé : `campushub-user-service` (`ValidateIssuer = true`).
- Pas de claim `aud` (`ValidateAudience = false`).
- `ValidateLifetime = true`, `ClockSkew = 30 s`.
- Claims : `sub` (id utilisateur, **Guid**), `role` (**une seule** chaîne :
  `ETUDIANT`, `ENSEIGNANT` ou `ADMIN`, sans préfixe `ROLE_`), plus `iss`, `iat`,
  `exp`, `jti`.
- `MapInboundClaims = false`, `NameClaimType = "sub"`, `RoleClaimType = "role"`.
- Les **headers d'identité envoyés par le client** (`X-User-Id`, `X-Role`, …)
  sont **ignorés** : l'identité provient uniquement du token.

Un token dont le `sub` n'est pas un Guid ou dont le `role` est inconnu est rejeté
(`401`).

### Droits par endpoint

| Méthode | Route | Accès |
|---|---|---|
| GET | `/api/quizzes/course/{courseId}` | tout utilisateur authentifié |
| GET | `/api/quizzes/{id}` | tout utilisateur authentifié (réponse sans `estCorrecte`) |
| POST | `/api/quizzes` | ENSEIGNANT ou ADMIN |
| PUT | `/api/quizzes/{id}` | créateur du quiz ou ADMIN |
| DELETE | `/api/quizzes/{id}` | créateur du quiz ou ADMIN ; `409` si des résultats existent |
| POST | `/api/quizzes/{id}/start` | ETUDIANT (démarre une tentative) |
| POST | `/api/quizzes/{id}/submit` | ETUDIANT (`/start` obligatoire si le quiz a une durée) |
| GET | `/api/resultats/etudiant/{etudiantId}` | l'étudiant lui-même ; ENSEIGNANT limité à ses quiz ; ADMIN |
| GET | `/api/resultats/quiz/{quizId}` | ENSEIGNANT créateur du quiz ou ADMIN |
| GET | `/api/resultats/me` | ETUDIANT (identité issue du claim `sub`) |
| GET | `/api/resultats/{id}` | propriétaire ; ENSEIGNANT créateur du quiz ; ADMIN |
| GET | `/health` | public |

Publics en développement uniquement : Swagger UI (`/swagger`) et le JSON
OpenAPI (`/openapi/v1.json`). `GET /health` reste public dans tous les
environnements. Tout le reste exige un token valide.

### Format des erreurs

Identique au User Service :

```json
{
  "timestamp": "2026-10-15T10:00:00Z",
  "status": 403,
  "code": "FORBIDDEN",
  "message": "You do not have permission to perform this operation",
  "fieldErrors": []
}
```

Codes : `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404),
`VALIDATION_ERROR` (400, `fieldErrors` rempli), `CONFLICT` (409),
`INTERNAL_SERVER_ERROR` (500, message générique sans détail technique).

Toute exception non gérée est journalisée côté serveur et renvoyée en `500`
au format CampusHub, sans stack trace ni détail interne.

### Limite connue

Le service ne vérifie que la **signature** du token. Après une suspension, un
changement de rôle ou de mot de passe, un token déjà émis **reste accepté
jusqu'à son expiration** (1 h au maximum).

## Endpoints

### Quiz

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/quizzes/course/{courseId}` | Liste des quiz d'un cours |
| GET | `/api/quizzes/{id}` | Détail d'un quiz (sans les bonnes réponses) |
| POST | `/api/quizzes` | Créer un quiz |
| PUT | `/api/quizzes/{id}` | Modifier un quiz (`409` si des résultats existent) |
| DELETE | `/api/quizzes/{id}` | Supprimer un quiz (`409` si des résultats existent) |
| POST | `/api/quizzes/{id}/start` | Démarrer une tentative (`409` si le quota est atteint) |
| POST | `/api/quizzes/{id}/submit` | Soumettre ses réponses et obtenir un résultat (`409` si quota atteint ou délai dépassé) |

### Résultats

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/resultats/me` | Résultats de l'étudiant connecté (ETUDIANT) |
| GET | `/api/resultats/etudiant/{etudiantId}` | Résultats d'un étudiant (`etudiantId` = Guid ; enseignant : ses quiz uniquement) |
| GET | `/api/resultats/quiz/{quizId}` | Résultats d'un quiz (créateur du quiz ou ADMIN) |
| GET | `/api/resultats/{id}` | Un résultat précis (enseignant : quiz qu'il a créé) |

### Santé

| Méthode | Route | Description |
|---|---|---|
| GET | `/health` | État du service, public : `{"status":"UP"}` |

## Exemples

Tous les appels exigent l'en-tête `Authorization: Bearer <token>`.

### Créer un quiz — `POST /api/quizzes` (ENSEIGNANT/ADMIN)

Entrée :

```json
{
  "titre": "Quiz JWT",
  "courseId": 10,
  "maxTentatives": 2,
  "dureeMinutes": 30,
  "questions": [
    {
      "texte": "Qu'est-ce qu'un JWT ?",
      "reponses": [
        { "texte": "Un token signe", "estCorrecte": true },
        { "texte": "Un mot de passe", "estCorrecte": false }
      ]
    }
  ]
}
```

Sortie (`201 Created`) — la réponse ne contient jamais `estCorrecte` :

```json
{
  "id": 1,
  "titre": "Quiz JWT",
  "courseId": 10,
  "maxTentatives": 2,
  "dureeMinutes": 30,
  "questions": [
    {
      "id": 1,
      "texte": "Qu'est-ce qu'un JWT ?",
      "reponses": [
        { "id": 1, "texte": "Un token signe" },
        { "id": 2, "texte": "Un mot de passe" }
      ]
    }
  ]
}
```

Règles de validation (sinon `400 VALIDATION_ERROR` avec `fieldErrors`) :

- `titre` obligatoire, non vide, 200 caractères maximum ;
- `courseId` strictement supérieur à 0 ;
- `maxTentatives` facultatif, entier supérieur ou égal à 1 (défaut : 1) ;
- `dureeMinutes` facultatif, `null` = pas de limite, sinon entier supérieur ou égal à 1 ;
- `questions` obligatoire et non vide ;
- `texte` de question obligatoire (500 caractères maximum) ;
- `texte` de réponse obligatoire (300 caractères maximum) ;
- au moins 2 réponses par question, dont exactement 1 correcte.

Les collections `null` sont rejetées proprement (aucune
`NullReferenceException`).

### Détail d'un quiz — `GET /api/quizzes/{id}`

`200 OK` : même format, sans `estCorrecte`. `404` si le quiz n'existe pas.

### Soumettre un quiz — `POST /api/quizzes/{id}/submit` (ETUDIANT)

L'étudiant est déduit du token (claim `sub`) : il n'y a **pas** d'identifiant
étudiant dans le corps (le champ s'appelle `etudiantId` dans les réponses).

Entrée :

```json
{
  "reponses": [
    { "questionId": 1, "reponseId": 1 }
  ]
}
```

Sortie (`200 OK`) — `score` en pourcentage :

```json
{
  "id": 1,
  "quizId": 1,
  "etudiantId": "11111111-1111-1111-1111-111111111111",
  "score": 100,
  "datePassage": "2026-10-16T00:49:06.5876806Z"
}
```

Validation de la soumission (sinon `400 VALIDATION_ERROR` avec `fieldErrors`) :
corps `null`, `reponses` `null` ou vide, `questionId` en doublon, `questionId`
absent du quiz, `reponseId` inexistant ou rattaché à une autre question. Les
questions non répondues restent comptées comme fausses.

### Démarrer une tentative — `POST /api/quizzes/{id}/start` (ETUDIANT)

Enregistre une tentative en cours et renvoie son identifiant, l'heure de début
et l'heure limite (`null` si le quiz n'a pas de durée) :

```json
{
  "id": 1,
  "quizId": 4,
  "etudiantId": "11111111-1111-1111-1111-111111111111",
  "debutUtc": "2026-10-26T18:14:27.1234567Z",
  "limiteUtc": "2026-10-26T18:15:27.1234567Z"
}
```

`404 NOT_FOUND` si le quiz n'existe pas, `409 CONFLICT` si le nombre maximal de
tentatives est déjà atteint. Un nouvel appel alors qu'une tentative non expirée
existe renvoie la même tentative (aucune nouvelle ligne). Une tentative expirée
est remplacée par une nouvelle.

### Tentatives et durée

- `maxTentatives` (défaut 1, minimum 1) et `dureeMinutes` (`null` = pas de
  limite, sinon minimum 1) sont acceptés à la création et au `PUT`, et exposés
  par `GET /api/quizzes/{id}`. Le `PUT` remplace le quiz : un champ omis (ou
  `null`) revient à `1` pour `maxTentatives` et à `null` pour `dureeMinutes`.
  Comme le `PUT` est refusé dès qu'un résultat existe, ces réglages ne sont
  plus modifiables après la première soumission.
- Les tentatives consommées sont comptées à partir des `Resultat` de l'étudiant
  pour le quiz. Si ce nombre atteint `maxTentatives`, la soumission et le
  `/start` renvoient `409 CONFLICT`.
- Quiz avec durée : `/start` est obligatoire avant la soumission, sinon
  `400 VALIDATION_ERROR` explicite. Au-delà de
  `debutUtc + dureeMinutes + 30 s` de tolérance, la soumission est refusée en
  `409 CONFLICT` (délai dépassé = conflit avec l'état de la tentative).
- Quiz sans durée : la soumission directe reste possible sans `/start`.
- Une soumission réussie consomme la tentative en cours (suppression).

### Modifier / supprimer un quiz

`PUT /api/quizzes/{id}` : même corps que la création ; remplace les questions
et réponses. `204 No Content` (créateur ou ADMIN), `403` sinon, `404` si absent,
`409 CONFLICT` si des résultats existent déjà pour ce quiz (la modification est
refusée pour ne pas rendre les anciens résultats incomparables).

`DELETE /api/quizzes/{id}` : `204 No Content` (créateur ou ADMIN), `403` sinon,
`409 CONFLICT` si des résultats existent déjà pour ce quiz (suppression refusée
pour ne pas laisser de résultats orphelins).

### Résultats

```json
{
  "id": 1,
  "quizId": 1,
  "etudiantId": "11111111-1111-1111-1111-111111111111",
  "score": 100,
  "datePassage": "2026-10-16T00:49:06.5876806Z"
}
```

`GET /api/resultats/me` renvoie les résultats de l'étudiant connecté, identifié
par le claim `sub` (réservé au rôle ETUDIANT).

`GET /api/resultats/etudiant/{etudiantId}` et `GET /api/resultats/quiz/{quizId}`
renvoient un tableau ; `GET /api/resultats/{id}` en renvoie un seul.

Règles d'accès aux résultats :

- ETUDIANT : uniquement ses propres résultats (`403` sinon) ;
- ENSEIGNANT : uniquement les résultats des quiz qu'il a créés, y compris via
  `/etudiant/{id}` qui est filtré sur ses quiz ;
- ADMIN : tous les résultats.

Pour un quiz, un résultat isolé ou un accès enseignant : `404` si le quiz ou le
résultat n'existe pas, `403` si le quiz appartient à un autre enseignant.

## Tests

Le fichier `EvaluationService.http` contient les cas de test (200 / 201 / 204 /
400 / 401 / 403 / 404 / 409), dont les tentatives et la durée (section 9).
Pour un token du User Service :
`POST http://localhost:8081/api/v1/auth/login` -> champ `accessToken`.

Pour générer localement des tokens de test (même `JWT_SECRET` et issuer) :

```bash
JWT_SECRET="..." node tools/generate-test-tokens.mjs
```

Le script produit des tokens ETUDIANT / ENSEIGNANT / ADMIN, ainsi que des cas
invalides (expiré, mauvais secret, mauvais issuer, rôle inconnu, `sub` non-Guid),
à coller dans `EvaluationService.http`.

## Structure du projet

```
evaluation-service/
├── .env.example            # Modèle de configuration locale (sans secret)
├── tools/
│   └── generate-test-tokens.mjs
└── EvaluationService/
    ├── Controllers/        # QuizzesController, ResultatsController
    ├── Data/               # AppDbContext (EF Core)
    ├── Dtos/               # Objets d'échange (entrée / sortie de l'API)
    ├── Errors/             # Format CampusHub + gestionnaire global des exceptions
    ├── Migrations/         # Migrations EF Core
    ├── Models/             # Entités : Quiz, Question, Reponse, Resultat, Tentative
    ├── Security/           # Rôles + accès aux claims (sub, role)
    ├── Program.cs
    └── appsettings.json
```
