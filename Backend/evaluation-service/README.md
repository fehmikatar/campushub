# Evaluation Service

**Framework :** ASP.NET Core Web API (.NET 10)
**Base de données :** SQL Server (Entity Framework Core, Code First)
**Port :** 8084

Gère les quiz, leur correction et les résultats des étudiants.

Ce service est indépendant : `CourseId` et `UserId` sont de simples entiers
(références vers les services Course et User, sans clé étrangère SQL).

## Démarrer en local

```bash
dotnet restore
dotnet run --urls=http://localhost:8084
```

L'API est alors disponible sur `http://localhost:8084`.
En environnement de développement, la documentation OpenAPI est exposée
(voir `Program.cs`, `MapOpenApi`).

## Base de données

Le projet utilise SQL Server LocalDB (`appsettings.json` ->
`ConnectionStrings:DefaultConnection`). Pour créer/mettre à jour la base :

```bash
dotnet ef database update
```

Pour (re)générer une migration :

```bash
dotnet ef migrations add NomDeLaMigration
```

Équivalent en Console du Gestionnaire de package (Visual Studio) :

```powershell
Add-Migration Initial
Update-Database
```

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
| GET | `/api/resultats/user/{userId}` | Résultats d'un utilisateur |
| GET | `/api/resultats/quiz/{quizId}` | Résultats d'un quiz |
| GET | `/api/resultats/{id}` | Un résultat précis |

## Exemples

### Créer un quiz — `POST /api/quizzes`

Entrée :

```json
{
  "titre": "Quiz EF Core",
  "courseId": 10,
  "questions": [
    {
      "texte": "Qu'est-ce que EF Core ?",
      "reponses": [
        { "texte": "Un ORM", "estCorrecte": true },
        { "texte": "Un serveur web", "estCorrecte": false }
      ]
    }
  ]
}
```

Sortie (`201 Created`) — la réponse ne contient jamais `estCorrecte` :

```json
{
  "id": 1,
  "titre": "Quiz EF Core",
  "courseId": 10,
  "questions": [
    {
      "id": 1,
      "texte": "Qu'est-ce que EF Core ?",
      "reponses": [
        { "id": 1, "texte": "Un ORM" },
        { "id": 2, "texte": "Un serveur web" }
      ]
    }
  ]
}
```

Règles de validation (sinon `400 Bad Request`) : au moins 1 question, et chaque
question doit avoir au moins 2 réponses dont exactement 1 correcte.

### Détail d'un quiz — `GET /api/quizzes/{id}`

Sortie (`200 OK`) : même format que ci-dessus, sans `estCorrecte`.
`404 Not Found` si le quiz n'existe pas.

### Soumettre un quiz — `POST /api/quizzes/{id}/submit`

Entrée :

```json
{
  "userId": 7,
  "reponses": [
    { "questionId": 1, "reponseId": 1 },
    { "questionId": 2, "reponseId": 4 }
  ]
}
```

Sortie (`200 OK`) — `score` est en pourcentage (bonnes réponses / nombre de questions) :

```json
{
  "id": 1,
  "quizId": 1,
  "userId": 7,
  "score": 50,
  "datePassage": "2026-10-15T15:43:53.8658843Z"
}
```

### Modifier / supprimer un quiz

`PUT /api/quizzes/{id}` : même corps que la création ; remplace les questions
et réponses existantes. Retourne `204 No Content` (`404` si introuvable).

`DELETE /api/quizzes/{id}` : retourne `204 No Content` (`404` si introuvable).

### Résultats

```json
{
  "id": 1,
  "quizId": 1,
  "userId": 7,
  "score": 50,
  "datePassage": "2026-10-15T15:43:53.8658843"
}
```

`GET /api/resultats/user/{userId}` et `GET /api/resultats/quiz/{quizId}`
renvoient un tableau de ces objets ; `GET /api/resultats/{id}` en renvoie un seul.

## Structure du projet

```
evaluation-service/
└── EvaluationService/
    ├── Controllers/     # QuizzesController, ResultatsController
    ├── Data/            # AppDbContext (EF Core)
    ├── Dtos/            # Objets d'échange (entrée / sortie de l'API)
    ├── Migrations/      # Migrations EF Core
    ├── Models/          # Entités : Quiz, Question, Reponse, Resultat
    ├── Program.cs
    └── appsettings.json
```
