# Lancer CampusHub en local (une seule machine)

Tout tourne dans Docker : un seul `docker compose`, aucun service à installer à la main.

## 1. Prérequis

- **Docker Desktop** démarré (le premier build télécharge plusieurs images : prévoir 10 à 15 minutes et ~10 Go de disque).
- Ports libres : `4200`, `8080`, `8085`, `8084`, `8180`, `8761`, `5672`, `15672`.
  Si `npm start` ou un ancien service tourne encore sur l'un d'eux, l'arrêter avant.
- Git, pour récupérer le dépôt à jour (`git checkout main && git pull`).

## 2. Démarrer

Depuis la **racine** du dépôt :

```bash
docker compose up --build -d
```

- Le premier lancement doit se faire **avec `--build`** (les images sont construites localement, sinon : `pull access denied`).
- Attendre **1 à 2 minutes** après la fin de la commande : les services s'enregistrent dans Eureka et peuvent répondre 500/503 pendant ce délai.

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

## 4. Comptes de test

Mot de passe commun : `Test1234!`

| Compte | Rôle |
|---|---|
| `etudiant1` | Étudiant |
| `enseignant1` | Enseignant |
| `admin1` | Administrateur |

- **Inscription** : lien « Créer un compte » sur la page de connexion. Tout nouveau compte est Étudiant.
- **Devenir enseignant** : choisir « Enseignant » dans « Rôle souhaité » ; un administrateur valide ensuite la demande (`admin1` → menu **Utilisateurs** → « Valider enseignant »), puis l'utilisateur se reconnecte.
- Le navigateur peut préremplir le formulaire de connexion avec un autre compte : taper les identifiants à la main.

## 5. Données de départ (premier lancement)

Les bases démarrent vides. Pour avoir de quoi tester :

1. Connexion `admin1` → **Catégories** : créer une catégorie.
2. Connexion `enseignant1` → créer un cours avec au moins **un chapitre visible**, puis le **publier** (bouton dans la liste des cours).
3. Le cours apparaît pour les étudiants (Catalogue, Forum, Quiz).

## 6. Vérifications rapides

| Test | Résultat attendu |
|---|---|
| Connexion `etudiant1` sur http://localhost:4200 | tableau de bord étudiant |
| Forum : créer un sujet avec du Markdown, répondre, aimer | sujet et réponse affichés |
| Forum, `enseignant1` : épingler / verrouiller / résolu | badges visibles dans la liste |
| Quiz, `enseignant1` : créer un quiz (2 tentatives) | quiz listé pour le cours |
| Quiz, `etudiant1` : passer le quiz deux fois | score affiché, 3ᵉ tentative refusée (409) |
| Cloche de notifications | une notification par action du Forum / résultat de quiz |
| Eureka http://localhost:8761 | `COURSE-SERVICE`, `FORUM-SERVICE`, `EVALUATION-SERVICE`, `ENROLLMENT-SERVICE`, `NOTIFICATION-SERVICE` enregistrés |

Test d'un appel API par la Gateway (PowerShell) : cours inexistant → 404 :

```powershell
$t = (Invoke-RestMethod -Method Post -Uri "http://localhost:8180/realms/campushub/protocol/openid-connect/token" -Body @{grant_type="password"; client_id="campushub-frontend"; username="etudiant1"; password="Test1234!"}).access_token
try { Invoke-RestMethod -Method Post -Uri "http://localhost:8080/api/v1/forum/courses/cours-inexistant/topics" -Headers @{Authorization="Bearer $t"} -ContentType "application/json" -Body '{"title":"Test cours inconnu","content":"test"}' } catch { $_.Exception.Response.StatusCode.value__; $_.ErrorDetails.Message }
```

## 7. Commandes utiles

| Besoin | Commande |
|---|---|
| Voir les logs d'un service | `docker compose logs -f forum-service` |
| Reconstruire un seul service | `docker compose up --build -d forum-service` |
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
| `THESE PACKAGES DO NOT MATCH THE HASHES` pendant un build Python | téléchargement coupé : relancer la même commande |
| RabbitMQ en `Exited (1)`, `.erlang.cookie eacces` | `docker compose down`, `docker volume rm campushub_rabbitmq_data`, puis `docker compose up --build -d` |
| La page d'inscription n'affiche pas « Rôle souhaité » | ancien realm conservé : recréer le volume Keycloak (section 7) |
| « You are already authenticated as different user » | se déconnecter dans l'application avant de créer un autre compte |
| Forum : « Aucun cours accessible » | aucun cours publié : voir section 5 |
| Port déjà utilisé | arrêter l'autre programme (souvent `npm start` sur 4200) |
| PowerShell : avertissement d'`Invoke-WebRequest` | répondre `O` ou ajouter `-UseBasicParsing` |

## 9. État de l'intégration (à mettre à jour)

| Service | Dans le `docker-compose.yml` global |
|---|---|
| Keycloak, RabbitMQ, MongoDB, Eureka, Gateway | oui |
| Forum, Course, Enrollment, Evaluation, Notification, Frontend | oui |
| User Service | **à intégrer** (conversion à Keycloak, Dockerfile, base MySQL) |
| Reclamation Service | **à intégrer** (bloc fourni dans `Backend/reclamation/rag_project/docker-compose.reclamation.yml`) |

Tant que Reclamation n'est pas dans le compose, les écrans **Réclamations, Assistant et Règlement** affichent une erreur : c'est attendu. L'assistant RAG nécessite en plus une clé de fournisseur (variables `RECLAMATION_LLM_API_KEY` et `RECLAMATION_EMBED_API_KEY`, fichier `.env` à la racine, non committé).
