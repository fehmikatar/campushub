# Notification Service

**Framework :** Laravel 11 (PHP 8.2+)
**Base de données :** MySQL
**Port :** 8085

Gère les notifications in-app des utilisateurs. Pour l'instant, elles sont alimentées par les événements du **forum-service** :

| Événement forum | Destinataire |
|---|---|
| `post.created` | auteur du sujet + auteur du message parent (si réponse imbriquée) |
| `post.liked` | auteur de la réponse |
| `post.accepted` | auteur de la réponse validée |
| `topic.locked` | auteur du sujet |
| `topic.resolved` | auteur du sujet |

L'auteur de l'action n'est jamais notifié, et un destinataire ne reçoit qu'une notification par événement.

## Démarrer en local

```bash
composer install
cp .env.example .env
php artisan key:generate
# renseigner DB_*, JWT_SECRET (identique au user-service) et INTERNAL_API_KEY
php artisan migrate
php artisan serve --port=8085
```

Tests : `php artisan test` (SQLite en mémoire, aucune base requise).

## API

Authentification : `Authorization: Bearer <JWT>` délivré par **Keycloak** (voir « Sécurité avec Keycloak » plus bas).

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/notifications?unread=1&per_page=20` | Mes notifications (paginées, plus récentes d'abord) |
| GET | `/api/notifications/unread-count` | Nombre de non lues |
| PATCH | `/api/notifications/{id}/read` | Marquer comme lue |
| PATCH | `/api/notifications/read-all` | Tout marquer comme lu |
| DELETE | `/api/notifications/{id}` | Supprimer |

Un utilisateur ne peut agir que sur ses propres notifications (404 sinon).

### Interne (service à service)

`POST /api/internal/events/forum` avec l'en-tête `X-Internal-Key: <INTERNAL_API_KEY>` — à ne pas exposer via l'API Gateway.

```json
{
  "event": "post.created",
  "actorId": "42",
  "topic": { "id": "…", "title": "…", "authorId": "7", "courseId": "…" },
  "post": { "id": "…", "authorId": "42", "parentAuthorId": "9" }
}
```

`post` est obligatoire pour `post.*`. Côté forum-service, définir `NOTIFICATION_SERVICE_URL=http://localhost:8085` et le même `INTERNAL_API_KEY` ; si l'URL est vide, l'envoi est désactivé. L'envoi est best-effort : une panne du notification-service ne casse jamais le forum.

## Swagger (tester l'API)

Lancer `php artisan serve --port=8085` puis ouvrir **http://localhost:8085/docs/** (spec : `public/docs/openapi.json`).
Générer un token : `php artisan token:make alice ETUDIANT`, puis *Authorize* dans Swagger.

## Fonctionnalités avancées

- **Préférences** (`GET/PUT /api/notifications/preferences`) : email de l'utilisateur, activation des emails, types de notifications coupés (`muted_types`, ex. `forum.like`).
- **Emails** : envoyés via Laravel Mail dès qu'une adresse est renseignée (driver `log` par défaut : le mail s'écrit dans `storage/logs/laravel.log` ; passer `MAIL_MAILER=smtp` pour un vrai envoi). Un échec d'email ne perd jamais la notification.
- **Diffusion générique** (`POST /api/internal/events/broadcast`, clé interne) : pour les autres services (notes, annonces, rappels d'échéance), types `grade`, `announcement`, `deadline`, `system`, jusqu'à 500 destinataires.
- Toute création passe par `NotificationDispatcher` (préférences + email), utilisé aussi par les événements du forum.

## Eureka et API Gateway

- Enregistrement dans Eureka (à lancer à côté de `php artisan serve`) : `php artisan eureka:register` (signal de vie toutes les 30 s ; `--once` pour un seul enregistrement). Réglages : `EUREKA_HOST`, `EUREKA_PORT`, `EUREKA_INSTANCE_HOST`, `SERVICE_PORT`.
- Via la Gateway : `GET http://localhost:8080/api/v1/notifications` est redirigé vers `/api/notifications`. Les routes `/api/internal/**` ne sont pas exposées.
- Si le port 8080 est déjà pris (ex. base Oracle), lancer la Gateway ailleurs : `./mvnw spring-boot:run -Dspring-boot.run.arguments=--server.port=8090`.

## Structure du code

```
notification-service/
├── app/
│   ├── Console/Commands/     eureka:register, token:make        (équivalent de scripts/)
│   ├── Enums/                ForumEvent, BroadcastType          (valeurs autorisées)
│   ├── Http/
│   │   ├── Controllers/      Notification, Preference, ForumEvent, Broadcast
│   │   ├── Middleware/       AuthenticateJwt, RequireInternalKey, RejectInvalidJson
│   │   └── Requests/         validation des entrées             (équivalent de validate.js)
│   ├── Mail/                 NotificationMail
│   ├── Models/               Notification, NotificationPreference
│   └── Services/             JwtService, EurekaClient, NotificationDispatcher, ForumNotifier   (logique métier)
├── config/                   roles.php, services.php (jwt, eureka, clé interne)
├── database/migrations/      tables notifications et notification_preferences
├── routes/api.php            routes publiques (JWT) et internes (clé partagée)
├── public/docs/              Swagger UI + openapi.json
└── tests/
    ├── Support/              helpers communs (tokens, payloads)
    └── Feature/              AuthTest, NotificationsTest, ForumEventsTest, BroadcastTest, PreferencesTest
```

Règle : les contrôleurs restent fins (validation dans `Requests`, logique dans `Services`).

## Communication asynchrone (RabbitMQ)

Le notification-service est le **seul consommateur** : il déclare les 4 files durables `forum.events`, `evaluation.events`, `course.events` et `reclamation.events`. Les autres services **publient seulement** (ils ne déclarent pas les files).

- Variable d'environnement : `RABBITMQ_URL=amqp://guest:guest@localhost:5672` (vide = consommation désactivée, le service marche normalement).
- Lancer RabbitMQ : `docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management` (interface : http://localhost:15672, `guest` / `guest`).
- Lancer le consommateur, dans son propre terminal : `php artisan rabbitmq:consume`.
- Ordre de démarrage : RabbitMQ, puis Notification, puis les producteurs.
- Extension PHP requise : `sockets` (à activer dans `php.ini`).

### Format des messages (JSON persistants, même enveloppe pour tous)

```json
{ "event": "nom.evenement", "occurredAt": "2026-11-10T12:00:00Z", "actorId": "<uuid>", "data": { } }
```

| File | `event` | `data` | Destinataire |
|---|---|---|---|
| `forum.events` | `post.created`, `post.liked`, `post.accepted`, `topic.locked`, `topic.resolved` | `{ "topic": {"id","title","authorId","courseId?"}, "post?": {"id","authorId","parentAuthorId?"} }` (`post` obligatoire pour `post.*`, `actorId` obligatoire) | auteur du sujet ou de la réponse |
| `evaluation.events` | `result.published` | `{ "studentId", "quizTitle", "score?" }` | l'étudiant |
| `course.events` | `course.published` | `{ "courseId", "title", "userIds": [...] }` | chaque utilisateur de `userIds` |
| `reclamation.events` | `reclamation.status_changed` | `{ "reclamationId", "reference", "studentSub", "oldStatus", "newStatus" }` | l'étudiant auteur (`studentSub`) |
| `reclamation.events` | `reclamation.created` | `{ "reclamationId", "reference", "studentSub", "category" }` | les administrateurs de `RECLAMATION_ADMIN_IDS` (vide = personne) |

Réclamations (`reclamation.events`, publié par le reclamation-service) :
- `studentSub` est le sub Keycloak (UUID) de l'auteur enregistré par Reclamation, le même identifiant que `user_id` ici ; un message sans UUID valide est écarté. `oldStatus` / `newStatus` : `new` / `in_progress` -> `in_progress` / `resolved` / `rejected`, toujours différents.
- `RECLAMATION_ADMIN_IDS` (obligatoire pour prévenir les administrateurs) : les sub Keycloak des administrateurs, séparés par des virgules, par exemple ceux des comptes ADMIN du realm `campushub` (Keycloak, Utilisateurs, colonne ID). Le user-service ne fournit la liste des administrateurs qu'avec un token ADMIN, que le consommateur n'a pas : la liste est donc une configuration. Une entrée qui n'est pas un UUID est ignorée ; si aucune n'est valide, `reclamation.created` est confirmé sans notification et un avertissement est écrit dans le journal (et au démarrage de `rabbitmq:consume`).

### Comportement
- Message traité : confirmé (ack) et retiré de la file. Les préférences de l'utilisateur (types coupés, email) sont appliquées comme pour l'API HTTP.
- Message inutilisable (JSON invalide, enveloppe incomplète, événement ou file inconnus) : confirmé (ack) pour ne pas revenir en boucle, avec une ligne dans `storage/logs/laravel.log`.
- Panne passagère (base indisponible) : le message est remis dans la file pour un nouvel essai.
- Côté producteur : l'envoi doit être « best effort », une erreur RabbitMQ ne doit jamais faire échouer la requête.

## Sécurité avec Keycloak

Le service ne crée plus de token : il **vérifie** celui de Keycloak (RS256), à chaque requête, même derrière la Gateway.

| Variable | Valeur |
|---|---|
| `KEYCLOAK_ISSUER_URI` | `http://localhost:8180/realms/campushub` (vide = ancien mode `JWT_SECRET`, transition) |
| `KEYCLOAK_JWKS_URI` | optionnelle : adresse des clés si différente de l'issuer (Docker : `http://host.docker.internal:8180/realms/campushub/protocol/openid-connect/certs`) |

- Identifiant : claim `sub`. Rôle : le plus élevé de `realm_access.roles` parmi `ETUDIANT`, `ENSEIGNANT`, `ADMIN` (les autres rôles sont ignorés). `aud` n'est pas vérifié.
- Clés publiques (JWKS, uniquement `use: sig`) mises en cache 10 minutes ; rechargées une fois si la clé du token est inconnue.
- Réponses : **401** (pas de token, mal formé, mauvaise signature, expiré, mauvais issuer, algorithme autre que RS256), **403** (aucun rôle CampusHub, ou rôle insuffisant sur une route `jwt:ROLE1,ROLE2`), **503** (Keycloak injoignable et clé inconnue du cache, jamais 500).
- Token de test : `Invoke-RestMethod -Method Post -Uri "http://localhost:8180/realms/campushub/protocol/openid-connect/token" -ContentType "application/x-www-form-urlencoded" -Body "grant_type=password&client_id=campushub-frontend&username=etudiant1&password=Test1234!"`, puis `Authorization: Bearer <access_token>`.
- `php artisan token:make` ne produit que des tokens HS256 de l'ancien mode (inutiles quand `KEYCLOAK_ISSUER_URI` est renseigné).
- Code : `app/Services/JwtService.php`, `app/Http/Middleware/AuthenticateJwt.php` ; tests : `tests/Feature/KeycloakAuthTest.php` (clés RSA de test et Keycloak simulé).

## Communication synchrone : Notification → User

Seul appel HTTP sortant du service (règles communes du synchrone) : pour les notifications d'une ou deux personnes (forum, résultat d'évaluation), le prénom du destinataire est récupéré avec `GET /api/v1/users/{id}/public` sur user-service (sans token : `id`, `prenom`, `nom`) et la notification devient « Bonjour Alice, … ».

- Service trouvé via Eureka (nom `user-service`) ; `USER_SERVICE_URL` le remplace (utile en Docker).
- 3 secondes maximum, un seul essai, jamais de nouvelle tentative.
- 404, 5xx, délai dépassé, service introuvable : la notification part quand même, sans prénom ; le consommateur n'échoue jamais pour cette raison.
- Pas d'appel dans une boucle : les envois à une liste (`course.published`, `broadcast`) n'ajoutent pas de prénom, en attendant un endpoint « par lot » côté User.
- Code : `app/Services/UserDirectory.php` ; tests : `tests/Feature/UserDirectoryTest.php`.

## Lancer avec Docker

### Dans le compose global
`docker-compose.yml` est le **bloc du service** à copier dans le compose commun : `notification-service` (API + enregistrement Eureka), `notification-consumer` et `notification-mysql` (base propre au service). RabbitMQ, Keycloak et Eureka sont **partagés** et doivent s'appeler `rabbitmq`, `keycloak` et `eureka-server` (sinon adapter `RABBITMQ_URL`, `KEYCLOAK_JWKS_URI`, `EUREKA_HOST`). L'instance est enregistrée dans Eureka sous `notification-service:8085` (`EUREKA_INSTANCE_HOST=notification-service`).

### Le service seul
```bash
docker compose up --build
```
`docker-compose.override.yml` est chargé automatiquement : il ajoute RabbitMQ et pointe Keycloak et Eureka vers la machine hôte (ports 8180 et 8761). Il n'est pas à copier dans le compose global.

| Conteneur | Rôle | Accès |
|---|---|---|
| `notification-service` | API HTTP Laravel (migrations au démarrage) + enregistrement Eureka (nouvel essai toutes les 10 s) | http://localhost:8085/docs/ |
| `notification-consumer` | `php artisan rabbitmq:consume` en continu (redémarre tout seul) | — |
| `rabbitmq` (override) | broker | AMQP `localhost:5672`, interface http://localhost:15672 (`guest` / `guest`) |
| `notification-mysql` | base `campushub_notification` | `localhost:3307` (`root` / `root`, port publié par l'override) |

Dans Docker, le service est en mode Keycloak par défaut (Keycloak sur la machine hôte, port 8180) ; pour l'ancien mode, lancer avec `KEYCLOAK_ISSUER_URI=` vide. Valeurs par défaut de développement : `JWT_SECRET=dev-secret`, `INTERNAL_API_KEY=dev-key` (modifiables avec des variables d'environnement avant `docker compose up`). La clé d'application Laravel est générée au démarrage, aucun secret n'est dans le dépôt. Le mail est en mode `log`. Pour arrêter : `docker compose down` (`-v` pour effacer aussi la base).

Hors Docker, l'enregistrement Eureka se lance à la main : `php artisan eureka:register`.
