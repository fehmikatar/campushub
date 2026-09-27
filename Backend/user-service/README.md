# User Service

**Framework :** Spring Boot
**Base de données :** MySQL
**Port :** 8081

Gère les comptes utilisateurs, les rôles (Étudiant, Formateur, Administrateur) et l'authentification (émission des jetons JWT).

## Démarrer en local

```bash
./mvnw spring-boot:run
```

## Configuration base de données

Voir `src/main/resources/application.properties` (MySQL, `localhost:3306`).
