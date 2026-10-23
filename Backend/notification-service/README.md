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

Authentification : `Authorization: Bearer <JWT>` (HS256, même secret et issuer que user-service / forum-service).

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
