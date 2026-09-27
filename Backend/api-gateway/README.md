# API Gateway

**Framework :** Spring Cloud Gateway
**Port :** 8080

Point d'entrée unique de la plateforme. Route chaque requête `/api/...` vers le microservice correspondant, gère le CORS et la vérification du jeton d'authentification (JWT émis par le User Service).

## Démarrer en local

```bash
./mvnw spring-boot:run
```
