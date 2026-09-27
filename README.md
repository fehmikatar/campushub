# CampusHub

Plateforme e-learning centralisée, construite en architecture microservices — Projet final AWD, ESPRIT.

## Idée

Un seul point d'accès pour les cours, la progression, les évaluations et les échanges entre étudiants, formateurs et administrateurs.

## Équipe

| Membre | Service | Framework |
|---|---|---|
| Hosni Aziz | API Gateway + User Service | Spring Boot |
| Zerai Wassim | Course Service | NestJS |
| [Nom membre 3] | Enrollment Service | Django REST |
| [Nom membre 4] | Evaluation Service | ASP.NET Core |
| [Nom membre 5] | Notification Service | Laravel |
| Katar Fehmi | Forum Service | Express.js |

Chaque membre est responsable de son service de bout en bout ; le frontend React est partagé.

## Architecture

4 couches : **Présentation** (Frontend) → **Accès** (API Gateway) → **Métier** (6 microservices) → **Données** (une base par service).

Diagramme complet : `Documentation/Diagrams/`

## Microservices

| Service | Responsabilité | Framework | Base | Port |
|---|---|---|---|---|
| API Gateway | Point d'entrée unique, routage | Spring Cloud Gateway | — | 8080 |
| User | Comptes, rôles, authentification | Spring Boot | MySQL | 8081 |
| Course | Cours et contenus | NestJS | PostgreSQL | 8082 |
| Enrollment | Inscriptions et progression | Django REST | PostgreSQL | 8083 |
| Evaluation | Quiz et résultats | ASP.NET Core | SQL Server | 8084 |
| Notification | Emails et alertes | Laravel | MySQL | 8085 |
| Forum | Discussions et échanges | Express.js | MongoDB | 8086 |

## Structure du dépôt

```
campushub/
├── Backend/
│   ├── api-gateway/
│   ├── user-service/
│   ├── course-service/
│   ├── enrollment-service/
│   ├── evaluation-service/
│   ├── notification-service/
│   └── forum-service/
├── Frontend/
├── Documentation/
│   ├── Presentation/
│   └── Diagrams/
└── README.md
```

## Organisation Git

- `main` : version stable
- `develop` : intégration
- `feature/<service>-<tâche>` : une branche par tâche

Toute fusion vers `develop` ou `main` passe par une Pull Request relue par un autre membre.

## Liens

- Présentation (séance 4) : https://claude.ai/artifact/28QZpYMPY89qHGfygAJd7e
- Diagramme d'architecture globale : https://claude.ai/artifact/1G7oVeZCZHXKcfq5J9xgPf
