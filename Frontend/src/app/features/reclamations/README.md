# Réclamations et assistant académique (service d'Aziz)

Écrans : `features/reclamations` (étudiant et administration), `features/assistant` (assistant, conversations),
`features/regulation` (règlement), `features/documents` (ADMIN).

Le front appelle `${apiUrl}/api/v1/reclamation/<ressource>/` (ressources : `reclamations`, `academic-assistant/ask`,
`conversations`, `academic-rules`, `ambiguities`, `documents`). La route `reclamation-service` existe déjà dans la
Gateway (`Path=/api/v1/reclamation/**`, réécrite en `/api/...` côté service).

## Lancer le service pour essayer les écrans

Depuis la racine du dépôt (le fichier d'override est nécessaire si la Gateway est publiée sur un autre port que 8080) :

```bash
docker compose -f docker-compose.yml -f docker-compose.override.yml -f Backend/reclamation/rag_project/docker-compose.reclamation.yml up --build -d
```

- Réclamations, règlement et documents fonctionnent sans configuration supplémentaire.
- L'assistant (chat) exige une clé de modèle (`LLM_API_KEY`, `EMBED_API_KEY` dans un `.env` à la racine, jamais commité) ;
  sans elle, le front affiche une erreur et rend la question à l'utilisateur pour qu'il réessaie.
- Le règlement reste vide tant que `manage.py ingest_regulation` n'a pas été exécuté (il demande aussi la clé d'embeddings).

## Remarque pour le service

Les endpoints `documents` et `academic-rules` n'ont pas de contrôle de rôle : le front n'affiche « Documents » qu'à
l'ADMIN, mais le service devrait aussi le refuser aux autres rôles.
