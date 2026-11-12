# CampushubFrontend

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.2.6.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.

## Docker (nginx)

L'image construit l'application (`ng build --configuration production`) puis la sert avec nginx.

| Élément | Rôle |
|---|---|
| `Dockerfile` | build Angular puis image `nginx:1.27-alpine` |
| `docker/nginx.conf.template` | repli sur `index.html` pour les routes Angular, cache, et relais `/gateway/` vers la Gateway |
| `docker/40-runtime-config.sh` | écrit `config.local.json` au démarrage depuis les variables d'environnement |
| `docker-compose.yml` | service `frontend` (à ajouter dans `include:` du compose racine) |

Seul : `docker compose -f Frontend/docker-compose.yml up --build -d`, puis http://localhost:4200.
Dans le compose global, ajouter `- path: Frontend/docker-compose.yml` sous `include:` ; la Gateway est alors jointe par son nom `api-gateway`.

Le port reste **4200** : Keycloak (redirections) et la Gateway (CORS) n'acceptent que `http://localhost:4200`. Arrêter `npm start` avant de lancer l'image.

### Variables

| Variable | Défaut | Rôle |
|---|---|---|
| `API_URL` | `/gateway` | adresse de l'API vue par le navigateur (`/gateway` = relayée par nginx, sans CORS) |
| `GATEWAY_URL` | `http://api-gateway:8080` | Gateway vue par nginx, sur le réseau Docker |
| `KEYCLOAK_URL` | `http://localhost:8180` | Keycloak vu par le navigateur (même adresse que l'`iss` des tokens) |
| `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID` | `campushub`, `campushub-frontend` | realm et client |

Dans le compose, on les règle avec `FRONT_API_URL`, `FRONT_GATEWAY_URL`, `FRONT_KEYCLOAK_URL` et `FRONTEND_PORT`.
