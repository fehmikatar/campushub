# Lancer CampusHub en local (une seule machine)

Tout tourne dans Docker : un seul `docker compose`, aucun service à installer à la main.

## 1. Prérequis

- **Docker Desktop** démarré (le premier build télécharge plusieurs images : prévoir 10 à 15 minutes et ~10 Go de disque).
- Ports libres : `4200`, `8080`, `8082`, `8084`, `8085`, `8180`, `8761`, `5672`, `15672`.
  Si `npm start` ou un ancien service tourne encore sur l'un d'eux, l'arrêter avant.
- Git, pour récupérer le dépôt à jour (`git checkout main && git pull`).
- Facultatif : un fichier `.env` à la racine pour l'assistant de réclamations (voir section 9).

## 2. Démarrer

Depuis la **racine** du dépôt :

```bash
docker compose up --build -d
```

- Le premier lancement doit se faire **avec `--build`** (les images sont construites localement, sinon : `pull access denied`).
- Le démarrage est ordonné : Eureka doit être `healthy` avant que les autres services ne démarrent. Compter **3 à 4 minutes** à froid.
- Attendre ensuite **1 à 2 minutes** : les services finissent de s'enregistrer dans Eureka et peuvent répondre 500/503 pendant ce délai.

Vérifier l'état :

```bash
docker compose ps
```

Tous les services doivent être `Up` ou `healthy`. `evaluation-migrate` est **`Exited (0)`** : c'est normal (il applique les migrations puis s'arrête).

## 3. Adresses

| Quoi | Adresse |
|---|---|
| Application (Angular) | http://localhost:4200 |
| API Gateway | http://localhost:8080 |
| Keycloak (admin / admin) | http://localhost:8180 |
| Eureka (services enregistrés) | http://localhost:8761 |
| RabbitMQ (guest / guest) | http://localhost:15672 |
| Swagger Evaluation | http://localhost:8084/swagger |

Utiliser **`localhost`** et non `127.0.0.1` : l'`iss` des tokens Keycloak est `http://localhost:8180/realms/campushub`.

Les services **User** et **Reclamation** n'exposent aucun port : on les joint uniquement par la Gateway (`http://localhost:8080/api/v1/...`) avec un token Keycloak.

## 4. Comptes de test

Mot de passe commun : `Test1234!`

| Compte | Rôle |
|---|---|
| `etudiant1` | Étudiant |
| `enseignant1` | Enseignant |
| `admin1` | Administrateur |

- **Inscription** : lien « Créer un compte » sur la page de connexion. Tout nouveau compte est Étudiant.
- **Devenir enseignant** : choisir « Enseignant » dans « Rôle souhaité » ; un administrateur valide ensuite la demande (`admin1` → menu **Utilisateurs** → **Valider enseignant**), puis l'utilisateur se reconnecte.
- Les comptes, mots de passe et rôles vivent **uniquement dans Keycloak**. Le User service ne garde qu'un profil (nom, prénom, e-mail), créé au premier appel de `GET /api/v1/users/me`.
- Le navigateur peut préremplir le formulaire de connexion avec un autre compte : taper les identifiants à la main.

## 5. Données de départ (premier lancement)

Les bases démarrent vides. Pour avoir de quoi tester :

1. Connexion `admin1` → **Catégories** : créer une catégorie.
2. Connexion `enseignant1` → créer un cours avec au moins **un chapitre visible**, puis le **publier** (bouton dans la liste des cours).
3. Le cours apparaît pour les étudiants (Catalogue, Forum, Quiz, inscription).

## 6. Vérifications rapides

| Test | Résultat attendu |
|---|---|
| Connexion `etudiant1` sur http://localhost:4200 | tableau de bord étudiant |
| Catalogue, `etudiant1` : ouvrir un cours publié → **S'inscrire** | le cours apparaît dans **Mes cours** ; **Se désinscrire** l'en retire |
| Forum : créer un sujet avec du Markdown, répondre, aimer | sujet et réponse affichés |
| Forum, `enseignant1` : épingler / verrouiller / résolu | badges visibles dans la liste |
| Quiz, `enseignant1` : créer un quiz (2 tentatives) | quiz listé pour le cours |
| Quiz, `etudiant1` : passer le quiz deux fois | score affiché, 3ᵉ tentative refusée (409) |
| Réclamations, `etudiant1` : créer une réclamation | réclamation listée « En cours » ; `admin1` la voit et change son statut |
| Cloche de notifications | une notification par action du Forum / résultat de quiz / réclamation |
| Eureka http://localhost:8761 | `API-GATEWAY`, `COURSE-SERVICE`, `ENROLLMENT-SERVICE`, `EVALUATION-SERVICE`, `FORUM-SERVICE`, `NOTIFICATION-SERVICE`, `RECLAMATION-SERVICE`, `USER-SERVICE` enregistrés |

Test d'un appel API par la Gateway (PowerShell) : cours inexistant → 404 :

```powershell
$t = (Invoke-RestMethod -Method Post -Uri "http://localhost:8180/realms/campushub/protocol/openid-connect/token" -Body @{grant_type="password"; client_id="campushub-frontend"; username="etudiant1"; password="Test1234!"}).access_token
try { Invoke-RestMethod -Method Post -Uri "http://localhost:8080/api/v1/forum/courses/cours-inexistant/topics" -Headers @{Authorization="Bearer $t"} -ContentType "application/json" -Body '{"title":"Test cours inconnu","content":"test"}' } catch { $_.Exception.Response.StatusCode.value__; $_.ErrorDetails.Message }
```

Profil de l'utilisateur connecté (User service, avec le même `$t`) :

```powershell
Invoke-RestMethod -Uri "http://localhost:8080/api/v1/users/me" -Headers @{Authorization="Bearer $t"}
```

## 7. Commandes utiles

| Besoin | Commande |
|---|---|
| Voir les logs d'un service | `docker compose logs -f forum-service` |
| Reconstruire un seul service | `docker compose up --build -d forum-service` |
| Redémarrer un seul service | `docker compose restart course-service` |
| Arrêter (données conservées) | `docker compose down` |
| **Tout effacer** (bases, comptes créés à la main, realm) | `docker compose down -v` |
| Repartir d'un realm Keycloak neuf | `docker compose down` puis `docker volume rm campushub_keycloak_data` |

Ne pas utiliser `down -v` par réflexe : cela supprime toutes les données.
Utiliser toujours `docker compose up -d` (avec `-d`) pour garder la main sur le terminal.

## 8. Problèmes connus

| Symptôme | Cause et solution |
|---|---|
| `pull access denied for campushub/...` | images jamais construites : relancer avec `--build` |
| Erreur 500/503 juste après le démarrage | services pas encore enregistrés dans Eureka : attendre 1 à 2 minutes |
| Erreur 500 persistante sur un service (ex. catalogue) | le service ne figure pas dans Eureka : `docker compose restart <service>`, puis vérifier http://localhost:8761 |
| `THESE PACKAGES DO NOT MATCH THE HASHES` pendant un build Python | téléchargement coupé : relancer la même commande |
| RabbitMQ en `Exited (1)`, `.erlang.cookie eacces` | `docker compose down`, `docker volume rm campushub_rabbitmq_data`, puis `docker compose up --build -d` |
| La page d'inscription n'affiche pas « Rôle souhaité » | ancien realm conservé : recréer le volume Keycloak (section 7) |
| « You are already authenticated as different user » | se déconnecter dans l'application avant de créer un autre compte |
| Forum : « Aucun cours accessible » | aucun cours publié : voir section 5 |
| Mes cours : « Cours indisponible » | inscription vers un cours supprimé ou inexistant (données de test) : sans conséquence |
| Assistant : 503 « provider is not configured » | clés absentes dans `.env` : voir section 9 |
| Assistant : 503 « The LLM took too long » | modèle trop lent : changer `RECLAMATION_LLM_MODEL` (section 9) |
| Port déjà utilisé | arrêter l'autre programme (souvent `npm start` sur 4200) |
| PowerShell : avertissement d'`Invoke-WebRequest` | répondre `O` ou ajouter `-UseBasicParsing` |

## 9. Assistant de réclamations (clé de fournisseur)

Les réclamations fonctionnent sans configuration. L'**assistant** et l'écran **Règlement** utilisent un fournisseur compatible OpenAI (Gemini par défaut) et demandent une clé.

1. Créer un fichier **`.env`** à la **racine** du dépôt (ignoré par git : **ne jamais le committer**, ne jamais coller la clé dans le chat ou un commit) :

```env
RECLAMATION_EMBED_API_KEY=votre_cle
RECLAMATION_LLM_API_KEY=votre_cle
RECLAMATION_LLM_MODEL=gemini-3.5-flash
```

2. Recréer le service pour qu'il lise le fichier :

```bash
docker compose up -d reclamation-service
```

3. Importer le règlement (3 fichiers JSON), **une seule fois** :

```bash
docker compose exec reclamation-service python manage.py ingest_regulation
```

   L'offre gratuite limite le débit : la commande se met en pause toute seule, c'est normal. Les données restent dans le volume `reclamation_data` (conservées par `docker compose down`).

4. Tester : connexion `etudiant1` → **Assistant** → poser une question sur le règlement ; la réponse cite ses sources.

## 10. État de l'intégration

Tous les services sont dans le `docker-compose.yml` global :

| Service | Technologie | Remarque |
|---|---|---|
| Keycloak, RabbitMQ, MongoDB, Eureka, Gateway | — | Eureka a un healthcheck : les autres services l'attendent |
| Forum, Course, Enrollment, Evaluation | Express, NestJS, Django, ASP.NET | enregistrés dans Eureka |
| User | Spring Boot + MySQL | profils seulement, identité dans Keycloak, joignable par la Gateway |
| Reclamation | Django + MongoDB + ChromaDB | joignable par la Gateway ; assistant : voir section 9 |
| Notification, Frontend | Laravel, Angular | consomment les événements RabbitMQ (forum, evaluation, course, reclamation) |