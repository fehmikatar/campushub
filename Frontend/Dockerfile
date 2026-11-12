# syntax=docker/dockerfile:1
# Frontend Angular : build, puis service des fichiers par nginx.

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund --fetch-retries=5 --fetch-retry-mintimeout=20000
COPY . .
RUN npx ng build --configuration production

FROM nginx:1.27-alpine

# Adresses lues par l'application au démarrage (voir docker/40-runtime-config.sh) et par nginx (GATEWAY_URL).
ENV API_URL=/gateway \
    GATEWAY_URL=http://api-gateway:8080 \
    KEYCLOAK_URL=http://localhost:8180 \
    KEYCLOAK_REALM=campushub \
    KEYCLOAK_CLIENT_ID=campushub-frontend

# nginx remplace les variables ${...} de ce gabarit au démarrage (images officielles).
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
# Le sed retire d'éventuels retours chariot Windows (CRLF), qui empêcheraient le script de s'exécuter.
COPY docker/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
RUN sed -i 's/\r$//' /docker-entrypoint.d/40-runtime-config.sh && chmod +x /docker-entrypoint.d/40-runtime-config.sh
COPY --from=build /app/dist/campushub-frontend/browser /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
