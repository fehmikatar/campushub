# CampusHub

Plateforme e-learning centralisée, construite en architecture microservices — Projet final AWD, ESPRIT.

## Idée

Un seul point d'accès pour les cours, la progression, les évaluations, les échanges et les réclamations entre étudiants, enseignants et administrateurs.

## Lancer le projet

Une seule commande, depuis la racine du dépôt :

```bash
docker compose up --build -d
```

Puis ouvrir **http://localhost:4200** (compte de test : `etudiant1` / `Test1234!`).
Guide complet, comptes de test et dépannage : [`Documentation/RUN-LOCAL.md`](Documentation/RUN-LOCAL.md).

L'assistant de réclamations (RAG) demande une clé de fournisseur dans un fichier `.env` à la racine (non committé) : voir la section 9 de `RUN-LOCAL.md`. Sans clé, tout le reste fonctionne.

## Équipe

| Membre | Responsabilité | Technologie |
|---|---|---|
| Fehmi | Forum Service, API Gateway, Eureka, Keycloak, `docker-compose` global | Express.js, Spring Cloud Gateway |
| Aziz | User Service, Reclamation Service (+ assistant RAG) | Spring Boot, Django |
| Wassim | Course Service | NestJS |
| Oussama | Enrollment Service | Django REST |
| Lamin | Evaluation Service | ASP.NET Core |
| Rayen | Notification Service, Frontend | Laravel, Angular |

## Architecture

4 couches : **Présentation** (Frontend Angular) → **Accès** (API Gateway) → **Métier** (microservices) → **Données** (une base par service).

```
Navigateur ──► Frontend (nginx, :4200)
                  │  token Keycloak (JWT RS256)
                  ▼
            API Gateway (:8080) ── valide le token, route par nom via Eureka
                  │
   ┌──────────┬───┴──────┬────────────┬─────────────┬──────────────┐
 Forum      Course   Enrollment   Evaluation   Notification   Reclamation
(Mongo)  (PostgreSQL) (PostgreSQL) (SQL Server)   (MySQL)       (Mongo)
   │          ▲            │            │            ▲              │
   └── appel synchrone ────┘            │            │              │
        Forum / Evaluation / Reclamation ► Course     │              │
   └────────── événements asynchrones (RabbitMQ) ─────┘──────────────┘
```

Diagrammes détaillés : `Documentation/Diagrams/`.

### Sécurité

- **Keycloak** (realm `campushub`) authentifie les utilisateurs et délivre les tokens ; les services ne créent aucun token, ils **vérifient** celui qu'on leur envoie (signature RS256, issuer, expiration).
- Rôles : `ETUDIANT`, `ENSEIGNANT`, `ADMIN`.
- Keycloak est la **seule source d'identité** (comptes, mots de passe, rôles). Le User service ne garde qu'un profil (nom, prénom, e-mail) dont l'`id` est le `sub` du token, créé au premier appel de `GET /api/v1/users/me`.
- Inscription libre depuis la page de connexion : tout nouveau compte est `ETUDIANT`. Un compte qui demande `ENSEIGNANT` doit être **validé par un administrateur** (écran « Utilisateurs »).
- La Gateway valide le token, puis chaque service le revalide lui-même.
- Règles communes : [`Documentation/regles-communes-keycloak.txt`](Documentation/regles-communes-keycloak.txt).

### Communication

| Type | Où | Détail |
|---|---|---|
| Synchrone (HTTP) | Forum → Course | vérifie qu'un cours existe avant de créer un sujet (404 sinon) |
| Synchrone (HTTP) | Evaluation → Course, Reclamation → Course | contrôle d'existence du cours |
| Synchrone (HTTP) | Notification → User | lecture du nom d'un utilisateur (`GET /api/v1/users/{id}/public`, sans e-mail) |
| Asynchrone (RabbitMQ) | Forum, Evaluation, Course, Reclamation → Notification | files `forum.events`, `evaluation.events`, `course.events`, `reclamation.events`, consommées par `notification-consumer` |

## Microservices

| Service | Responsabilité | Technologie | Base | Port |
|---|---|---|---|---|
| API Gateway | Point d'entrée unique, validation du token, routage | Spring Cloud Gateway | — | 8080 |
| Eureka | Registre des services | Spring Cloud Netflix | — | 8761 |
| Keycloak | Identité, rôles, tokens | Keycloak 26 | volume | 8180 |
| User | Profils utilisateurs | Spring Boot | MySQL | 8081 |
| Course | Cours, chapitres, catégories | NestJS | PostgreSQL | 8082 |
| Enrollment | Inscriptions et progression | Django REST | PostgreSQL | 8083 |
| Evaluation | Quiz, tentatives, résultats | ASP.NET Core | SQL Server | 8084 |
| Notification | Notifications in-app, e-mails | Laravel | MySQL | 8085 |
| Forum | Sujets, réponses, modération | Express.js | MongoDB | 8086 |
| Reclamation | Réclamations, règlement, assistant RAG | Django | MongoDB + SQLite | 8087 |
| RabbitMQ | Bus d'événements | RabbitMQ 3 | — | 5672 / 15672 |
| Frontend | Interface web | Angular 22 + nginx | — | 4200 |

### Routes de la Gateway

| Préfixe | Service |
|---|---|
| `/api/v1/users/**` | User |
| `/api/v1/courses/**`, `/uploads/**` | Course |
| `/api/v1/enrollments/**` | Enrollment |
| `/api/v1/evaluation/**` | Evaluation |
| `/api/v1/notifications/**` | Notification |
| `/api/v1/forum/**` | Forum |
| `/api/v1/reclamation/**` | Reclamation |

> Tous les services sont dans le `docker-compose.yml` global. User et Reclamation n'exposent aucun port : on ne les joint que par la Gateway, avec un token. Eureka a un healthcheck et les autres services l'attendent avant de démarrer.

## Structure du dépôt

```
campushub/
├── Backend/
│   ├── api-gateway/
│   ├── eureka-server/
│   ├── USERMICROSERVICE/
│   ├── course-service/
│   ├── enrollment-service/
│   ├── evaluation-service/
│   ├── notification-service/
│   ├── forum-service/
│   └── reclamation/
├── Frontend/
├── keycloak/                 # realm importé au démarrage (comptes de test inclus)
├── Documentation/
│   ├── RUN-LOCAL.md
│   ├── regles-communes-keycloak.txt
│   ├── Presentation/
│   ├── Diagrams/
│   └── Maquettes/
├── docker-compose.yml
└── README.md
```

## Organisation Git

- `main` : version stable, toujours exécutable avec `docker compose up --build -d`
- `feature/<prénom>-<sujet>` : une branche par tâche, créée depuis `main` à jour
- Toute fusion vers `main` passe par une Pull Request, testée avant le merge
- Messages de commit conventionnels, sur une seule ligne : `feat(forum): ...`, `fix(gateway): ...`