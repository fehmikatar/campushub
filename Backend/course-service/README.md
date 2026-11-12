# Course Service - Docker

## Port
- **8082** (HTTP)

## Variables d'environnement

| Variable | Description | Défaut | Requis |
|----------|-------------|--------|--------|
| `PORT` | Port d'écoute | `8082` | Non |
| `NODE_ENV` | Environnement | `production` | Non |
| `DB_HOST` | Host PostgreSQL | `localhost` | Oui |
| `DB_PORT` | Port PostgreSQL | `5432` | Non |
| `DB_USER` | User PostgreSQL | `postgres` | Oui |
| `DB_PASS` | Password PostgreSQL | `postgres` | Oui |
| `DB_NAME` | Base de données | `course_db` | Oui |
| `KEYCLOAK_ISSUER_URI` | Issuer Keycloak (identique partout) | Non défini (mode legacy) | Non |
| `KEYCLOAK_JWKS_URI` | URI JWKS, à définir si l'hôte des clés diffère de l'issuer | Dérivée de l'issuer | Non |
| `JWT_SECRET` | Secret HS256 d'au moins 32 octets | Non défini | Requis en mode legacy |
| `JWT_ISSUER` | Issuer JWT legacy | `campushub-user-service` | Non |
| `EUREKA_ENABLED` | Désactiver Eureka uniquement avec la valeur `false` | `true` | Non |
| `EUREKA_HOST` | Hôte Eureka | `localhost` | Non |
| `EUREKA_PORT` | Port Eureka | `8761` | Non |
| `EUREKA_INSTANCE_HOST` | Nom d'hôte annoncé à Eureka | `localhost` | Non |
| `RABBITMQ_URL` | URL RabbitMQ (vide pour désactiver la publication) | Non défini | Non |
| `EVALUATION_SERVICE_URL` | URL Evaluation Service (optionnel, priorité sur Eureka) | - | Non |

Dans Docker, utiliser `KEYCLOAK_ISSUER_URI=http://localhost:8180/realms/campushub` (issuer
des tokens) et `KEYCLOAK_JWKS_URI=http://keycloak:8080/realms/campushub/protocol/openid-connect/certs`.
Le bloc compose prêt à intégrer est dans [`docker-compose.block.yml`](./docker-compose.block.yml).

## Build & Run

```bash
# Depuis la racine du dépôt
docker build -f Backend/course-service/Dockerfile -t course-service Backend/course-service

# Run (nécessite postgres, rabbitmq, keycloak sur le même réseau)
docker run -d \
  --name course-service \
  -p 8082:8082 \
  -e DB_HOST=postgres \
  -e DB_PASS=postgres \
  -e KEYCLOAK_ISSUER_URI=http://localhost:8180/realms/campushub \
  -e KEYCLOAK_JWKS_URI=http://keycloak:8080/realms/campushub/protocol/openid-connect/certs \
  -e RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672 \
  course-service
```

## Endpoints principaux
- `GET    /courses` - Liste cours (auth)
- `POST   /courses` - Créer cours (ENSEIGNANT/ADMIN)
- `GET    /courses/categories` - Catégories
- `GET    /courses/:id` - Détail cours
- `PUT    /courses/:id` - Modifier (ENSEIGNANT/ADMIN)
- `PATCH  /courses/:id/publish` - Publier (ENSEIGNANT/ADMIN)
- `PATCH  /courses/:id/archive` - Archiver (ENSEIGNANT/ADMIN)
- `POST   /courses/:id/image` - Upload image (ENSEIGNANT/ADMIN)
- `DELETE /courses/:id/image` - Supprimer image (ENSEIGNANT/ADMIN)
- `DELETE /courses/:id` - Supprimer (ENSEIGNANT/ADMIN)
- `GET    /courses/:coursId/chapters` - Chapitres
- `POST   /courses/:coursId/chapters` - Créer chapitre
- `GET    /courses/:coursId/chapters/:id` - Détail chapitre
- `PUT    /courses/:coursId/chapters/:id` - Modifier chapitre
- `DELETE /courses/:coursId/chapters/:id` - Supprimer chapitre
- `POST   /courses/:coursId/chapters/:id/pdf` - Upload PDF
- `GET    /courses/:coursId/chapters/:id/pdf` - Télécharger PDF

## Swagger
`http://localhost:8082/api`

## Appels du navigateur et CORS
Le frontend appelle Course via la Gateway (`http://localhost:8080/api/v1/courses`).
La Gateway gere les autorisations CORS. Course ne doit pas ajouter une seconde
valeur `Access-Control-Allow-Origin` : le navigateur refuserait la reponse,
meme avec un statut HTTP 200. Swagger reste utilisable directement sur le port 8082.

## Verification du cours par Evaluation
`GET /courses/:id` consulte uniquement la base Course, sans rappeler Evaluation.
Les controles d'authentification et de visibilite restent actifs. `nbQuiz` vaut
`null` en attendant la decision de l'equipe sur son alimentation. Cela evite la
chaine Evaluation -> Course -> Evaluation lors de la creation d'un quiz.

## Authentification
- Bearer token Keycloak (RS256) ou JWT legacy (HS256)
- Rôles : `ETUDIANT`, `ENSEIGNANT`, `ADMIN`
- Header : `Authorization: Bearer <token>`

## Taille des fichiers
Images : JPG/PNG/WebP, 1 Mo maximum. PDF de chapitre : 20 Mo maximum
(20 * 1024 * 1024 octets). La Gateway autorise 21 Mo par requete multipart
pour laisser de la place aux en-tetes.
