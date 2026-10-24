# Intégration équipe — Evaluation Service

Ce document décrit ce qui est nécessaire côté équipe (Eureka / API Gateway) pour
exposer l'Evaluation Service. Aucun fichier de la gateway n'a été modifié.

## Identité du service

| Élément | Valeur |
|---|---|
| Nom Eureka (ServiceId / VIP) | `evaluation-service` |
| Instance Eureka | `evaluation-service:localhost:8084` |
| URL directe | `http://localhost:8084` |
| Serveur Eureka | `http://localhost:8761/eureka/` |
| API Gateway | `http://localhost:8080` |
| Front Angular | `http://localhost:4200` |

Le service écoute sur `8084` (clé `Urls` de `appsettings.json`) et annonce le
même port à Eureka (`Eureka:Instance:Port`). Il démarre même si Eureka est
arrêté ; l'enregistrement est réessayé en arrière-plan.

## Route gateway à ajouter

Fichier : `Backend/api-gateway/src/main/resources/application.properties`.

Les index `[0]` (user-service) et `[1]` (forum-service) sont déjà utilisés :
l'index libre est `[2]`. Bloc exact, au même format que la route forum :

```properties
# Evaluation Service : /api/v1/evaluation/... devient /api/... cote service
spring.cloud.gateway.server.webmvc.routes[2].id=evaluation-service
spring.cloud.gateway.server.webmvc.routes[2].uri=lb://evaluation-service
spring.cloud.gateway.server.webmvc.routes[2].predicates[0]=Path=/api/v1/evaluation/**
spring.cloud.gateway.server.webmvc.routes[2].filters[0]=RewritePath=/api/v1/evaluation/(?<segment>.*), /api/$\{segment}
```

Après ajout, redémarrer la gateway. Elle possède déjà le client Eureka : aucune
autre modification n'est nécessaire côté gateway.

## Correspondance des chemins via la gateway

| Appel public (gateway 8080) | Route interne (service 8084) |
|---|---|
| `POST /api/v1/evaluation/quizzes` | `POST /api/quizzes` |
| `GET /api/v1/evaluation/quizzes/course/{courseId}` | `GET /api/quizzes/course/{courseId}` |
| `GET /api/v1/evaluation/quizzes/{id}` | `GET /api/quizzes/{id}` |
| `PUT /api/v1/evaluation/quizzes/{id}` | `PUT /api/quizzes/{id}` |
| `DELETE /api/v1/evaluation/quizzes/{id}` | `DELETE /api/quizzes/{id}` |
| `POST /api/v1/evaluation/quizzes/{id}/submit` | `POST /api/quizzes/{id}/submit` |
| `GET /api/v1/evaluation/resultats/etudiant/{etudiantId}` | `GET /api/resultats/etudiant/{etudiantId}` |
| `GET /api/v1/evaluation/resultats/quiz/{quizId}` | `GET /api/resultats/quiz/{quizId}` |
| `GET /api/v1/evaluation/resultats/{id}` | `GET /api/resultats/{id}` |

L'en-tête `Authorization: Bearer <token>` est transmis tel quel ; le service
valide lui-même le JWT émis par le User Service.

## Front Angular

- Le front tourne sur `http://localhost:4200` et doit appeler la gateway sur
  `http://localhost:8080` (le CORS de la gateway autorise déjà cette origine).
- Le CORS du service d'évaluation n'a pas été modifié ; il reste piloté par
  `CORS_ALLOWED_ORIGINS` (défaut `http://localhost:3000`) pour les appels
  directs au port 8084. En passant par la gateway, seul le CORS de la gateway
  s'applique.

## Health check

`GET /health` n'est pas encore exposé (prévu dans un lot ultérieur). La route
gateway ci-dessus ne concerne que l'API métier. L'état de l'instance dans
Eureka repose sur les heartbeats.

## Vérifications attendues

1. Eureka démarré (`http://localhost:8761`) : l'application `EVALUATION-SERVICE`
   apparaît avec l'instance `evaluation-service:localhost:8084`, port `8084`.
2. Gateway redémarrée avec la route `[2]` : un appel authentifié à
   `http://localhost:8080/api/v1/evaluation/quizzes/{id}` répond comme un appel
   direct à `http://localhost:8084/api/quizzes/{id}`.
3. Eureka arrêté puis service relancé : le service démarre normalement (les
   erreurs d'enregistrement sont seulement journalisées et réessayées).
