# Eureka Server

Registre de services de CampusHub. Les microservices s'y enregistrent et peuvent ainsi se retrouver par leur nom.

**Framework :** Spring Boot 4.1.1 + Spring Cloud 2025.1.3
**Port :** 8761
**Prérequis :** Java 17 ou plus (rien d'autre à installer, Maven est fourni par `mvnw`)

## Démarrer en local

```bash
# Windows
.\mvnw spring-boot:run

# macOS / Linux
./mvnw spring-boot:run
```

Quand la console affiche `Started EurekaServerApplication`, ouvrir http://localhost:8761.
Les services enregistrés apparaissent sous « Instances currently registered with Eureka ».

## Enregistrer un service

Chaque service pointe vers l'adresse du serveur Eureka (`localhost:8761` par défaut) :
- Spring Boot : dépendance *Eureka Discovery Client*.
- Express / NestJS : paquet `eureka-js-client` (exemple : `Backend/forum-service/src/config/eureka.js`).
- ASP.NET : bibliothèque Steeltoe.