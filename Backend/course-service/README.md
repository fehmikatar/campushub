# Course Service

**Framework :** NestJS
**Base de données :** PostgreSQL
**Port :** 8082

Gère les cours et leurs contenus (chapitres, ressources pédagogiques).

## Démarrer en local

```bash
npm install
cp .env.example .env   # renseigner DB_*, JWT_SECRET (identique au user-service)
npm run start:dev
```

Swagger : http://localhost:8082/api (bouton **Authorize** pour coller le token).
Tests : `npm test`.

## Authentification

Toutes les routes exigent `Authorization: Bearer <JWT>` (HS256, même secret et issuer que le user-service ; claims `sub` = UUID de l'utilisateur, `role`). Sans token valide : 401.

| Rôle | Droits |
|---|---|
| `ETUDIANT` | Lecture des cours `PUBLIE` et de leurs chapitres visibles |
| `ENSEIGNANT` | Lecture de tout ; création ; modification de ses propres cours (sinon 403) |
| `ADMIN` | Lecture et modification de tous les cours |

À la création, `formateurId` est l'utilisateur connecté (`sub` du token), pas une valeur du corps de la requête. Les images de couverture (`/uploads/images/...`) restent publiques.

Token de test : `npm run token -- ENSEIGNANT` (ou `ETUDIANT`, `ADMIN`, avec un UUID en second argument pour choisir l'utilisateur).

## Événements RabbitMQ

Avec `RABBITMQ_URL` renseigné, le service publie sur la file `course.events` (déclarée par le notification-service) : `course.published`, `course.archived`, `chapter.created`. Envoi « best effort » ; sans `RABBITMQ_URL`, rien n'est envoyé.
