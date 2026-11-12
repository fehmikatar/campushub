# Enrollment Service

Microservice Django REST Framework dédié à la gestion des inscriptions des étudiants aux cours et au suivi de leur progression pédagogique.

- **Framework :** Django 6 / Django REST Framework
- **Port d'écoute :** `8083`
- **Base de données :** PostgreSQL (`enrollment_db`)
- **Authentification :** JWT RS256 émis par Keycloak (realm `campushub`)
- **Service Discovery :** Netflix Eureka

---

## Variables d'environnement (`.env.example`)

| Variable | Description | Valeur par défaut / exemple |
|---|---|---|
| `DEBUG` | Active le mode debug | `True` (dev) / `False` (prod/docker) |
| `SECRET_KEY` | Clé secrète Django | `change-me` |
| `ALLOWED_HOSTS` | Liste des hôtes autorisés séparés par des virgules | `localhost,127.0.0.1,enrollment-service` |
| `CORS_ALLOWED_ORIGINS` | Origines autorisées pour les requêtes CORS | `http://localhost:4200` |
| `DB_NAME` | Nom de la base PostgreSQL | `enrollment_db` |
| `DB_USER` | Utilisateur PostgreSQL | `postgres` (local) / `enrollment` (docker) |
| `DB_PASSWORD` | Mot de passe de la base de données | `change-me` |
| `DB_HOST` | Hôte de la base de données | `localhost` / `enrollment-db` |
| `DB_PORT` | Port de la base de données | `5432` |
| `PORT` | Port d'écoute du service web | `8083` |
| `KEYCLOAK_ISSUER_URI` | URL de l'émetteur du realm Keycloak | `http://localhost:8180/realms/campushub` |
| `KEYCLOAK_JWKS_URI` | URL JWKS pour la validation des clés publiques | `http://keycloak:8080/realms/...` (Docker) |
| `EUREKA_ENABLED` | Active l'enregistrement auprès d'Eureka | `False` (local) / `True` (Docker) |
| `EUREKA_CLIENT_SERVICEURL_DEFAULTZONE` | URL du serveur Eureka | `http://localhost:8761/eureka/` |
| `EUREKA_INSTANCE_HOST` | Nom d'hôte de l'instance dans Eureka | `localhost` / `enrollment-service` |

---

## Endpoints de l'API

Toutes les routes nécessitent un token Bearer JWT Keycloak valide.  
Les routes ci-dessous sont exposées par l'API Gateway via le préfixe `/api/v1/enrollments` (ou en direct sur le service via `/api/enrollments/`).

| Méthode | Endpoint (Gateway) | Rôles autorisés | Description |
|---|---|---|---|
| `POST` | `/api/v1/enrollments` | `ETUDIANT` | Inscription au cours indiqué par `cours_id` (l'`etudiant_id` provient du token). |
| `GET` | `/api/v1/enrollments` | `ETUDIANT`, `ENSEIGNANT`, `ADMIN` | Liste des inscriptions. Un étudiant ne voit que les siennes. Possibilité de filtrer par `?coursId=` ou `?etudiantId=` (sauf étudiant). |
| `GET` | `/api/v1/enrollments/{id}` | `ETUDIANT`, `ENSEIGNANT`, `ADMIN` | Détail d'une inscription et de sa progression. |
| `DELETE` | `/api/v1/enrollments/{id}` | `ETUDIANT`, `ADMIN` | Annulation d'une inscription. Interdit aux enseignants (`ENSEIGNANT`). |
| `GET` | `/api/v1/enrollments/{id}/progress` | `ETUDIANT`, `ENSEIGNANT`, `ADMIN` | Consultation du pourcentage de progression d'une inscription. |
| `PUT` | `/api/v1/enrollments/{id}/progress` | `ETUDIANT` | Mise à jour de la progression (`pourcentage` entre 0 et 100). |

---

## Démarrage en local

1. **Activer l'environnement virtuel et installer les dépendances :**
   ```bash
   python -m venv venv
   # Windows PowerShell
   .\venv\Scripts\Activate.ps1
   # Linux / macOS
   source venv/bin/activate

   pip install -r requirements.txt
   ```

2. **Configurer l'environnement :**
   Copiez `.env.example` en `.env` et ajustez `DB_PASSWORD`. Laissez `EUREKA_ENABLED=False` en local sans conteneur.

3. **Appliquer les migrations :**
   ```bash
   python manage.py makemigrations
   python manage.py migrate
   ```

4. **Lancer les tests unitaires :**
   ```bash
   python manage.py test enrollments
   ```

5. **Démarrer le serveur de développement :**
   ```bash
   python manage.py runserver 8083
   ```
