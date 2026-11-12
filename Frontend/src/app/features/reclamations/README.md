# Réclamations et assistant académique (service d'Aziz)

Écrans : `features/reclamations` (étudiant et administration), `features/assistant` (assistant, conversations),
`features/regulation` (règlement), `features/documents` (ADMIN).

Le front appelle `${apiUrl}/api/v1/reclamation/<ressource>/` (ressources : `reclamations`, `academic-assistant/ask`,
`conversations`, `academic-rules`, `ambiguities`, `documents`).

## À ajouter côté Gateway / Docker (Fehmi ou Aziz)

Route Gateway :

```yaml
- id: reclamation-service
  uri: lb://reclamation-service
  predicates:
    - Path=/api/v1/reclamation/**
  filters:
    - RewritePath=/api/v1/reclamation/(?<segment>.*), /api/${segment}
```

- Ajouter le service au `docker-compose` et l'enregistrer dans Eureka sous le nom `reclamation-service`.
- Les endpoints `documents` et `academic-rules` n'ont pas de contrôle de rôle côté service : le front n'affiche
  « Documents » qu'à l'ADMIN, mais le service devrait aussi le refuser aux autres rôles.
