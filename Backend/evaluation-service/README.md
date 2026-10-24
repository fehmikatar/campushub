# Evaluation Service

**Framework :** ASP.NET Core Web API (.NET 10)
**Base de données :** SQL Server (Entity Framework Core, Code First)
**Port :** 8084
**Sécurité :** JWT HS256 (validation seule, token émis par le User Service)

Gère les quiz, leur correction et les résultats des étudiants.

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

## Eureka

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
- `GET /health` n'existe pas encore (à venir). Eureka s'appuie sur les
  heartbeats de l'instance pour son état.
- La route gateway correspondante est documentée dans `INTEGRATION_EQUIPE.md`
  (la gateway n'est pas modifiée par ce dépôt).

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
| DELETE | `/api/quizzes/{id}` | créateur du quiz ou ADMIN |
| POST | `/api/quizzes/{id}/submit` | ETUDIANT |
| GET | `/api/resultats/etudiant/{etudiantId}` | l'étudiant lui-même, ou ENSEIGNANT/ADMIN |
| GET | `/api/resultats/quiz/{quizId}` | ENSEIGNANT ou ADMIN |
| GET | `/api/resultats/{id}` | propriétaire du résultat, ou ENSEIGNANT/ADMIN |

Publics en développement uniquement : Swagger UI (`/swagger`) et le JSON
OpenAPI (`/openapi/v1.json`). Tout le reste exige un token valide.

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
`VALIDATION_ERROR` (400, `fieldErrors` rempli).

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
| PUT | `/api/quizzes/{id}` | Modifier un quiz |
| DELETE | `/api/quizzes/{id}` | Supprimer un quiz |
| POST | `/api/quizzes/{id}/submit` | Soumettre ses réponses et obtenir un résultat |

### Résultats

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/resultats/etudiant/{etudiantId}` | Résultats d'un étudiant (`etudiantId` = Guid) |
| GET | `/api/resultats/quiz/{quizId}` | Résultats d'un quiz |
| GET | `/api/resultats/{id}` | Un résultat précis |

## Exemples

Tous les appels exigent l'en-tête `Authorization: Bearer <token>`.

### Créer un quiz — `POST /api/quizzes` (ENSEIGNANT/ADMIN)

Entrée :

```json
{
  "titre": "Quiz JWT",
  "courseId": 10,
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

Règles de validation (sinon `400 VALIDATION_ERROR`) : au moins 1 question, et
chaque question doit avoir au moins 2 réponses dont exactement 1 correcte.

### Détail d'un quiz — `GET /api/quizzes/{id}`

`200 OK` : même format, sans `estCorrecte`. `404` si le quiz n'existe pas.

### Soumettre un quiz — `POST /api/quizzes/{id}/submit` (ETUDIANT)

L'étudiant est déduit du token (claim `sub`) : il n'y a **pas** de `userId` dans
le corps.

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

### Modifier / supprimer un quiz

`PUT /api/quizzes/{id}` : même corps que la création ; remplace les questions
et réponses. `204 No Content` (créateur ou ADMIN), `403` sinon, `404` si absent.

`DELETE /api/quizzes/{id}` : `204 No Content` (créateur ou ADMIN), `403` sinon.

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

`GET /api/resultats/etudiant/{etudiantId}` et `GET /api/resultats/quiz/{quizId}`
renvoient un tableau ; `GET /api/resultats/{id}` en renvoie un seul.

## Tests

Le fichier `EvaluationService.http` contient les cas de test (200 / 401 / 403 /
400 / 404). Pour un token du User Service :
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
├── INTEGRATION_EQUIPE.md   # Route gateway et points d'intégration
├── tools/
│   └── generate-test-tokens.mjs
└── EvaluationService/
    ├── Controllers/        # QuizzesController, ResultatsController
    ├── Data/               # AppDbContext (EF Core)
    ├── Dtos/               # Objets d'échange (entrée / sortie de l'API)
    ├── Errors/             # Format d'erreur CampusHub (ApiError, factory)
    ├── Migrations/         # Migrations EF Core
    ├── Models/             # Entités : Quiz, Question, Reponse, Resultat
    ├── Security/           # Rôles + accès aux claims (sub, role)
    ├── Program.cs
    └── appsettings.json
```
