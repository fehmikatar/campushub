#!/bin/sh
# Écrit la configuration lue par l'application au démarrage (AppConfig.load charge /config.local.json).
# Les valeurs viennent des variables d'environnement du conteneur (voir le Dockerfile pour les défauts).
set -eu

cat > /usr/share/nginx/html/config.local.json <<JSON
{
  "apiUrl": "${API_URL}",
  "keycloakUrl": "${KEYCLOAK_URL}",
  "realm": "${KEYCLOAK_REALM}",
  "clientId": "${KEYCLOAK_CLIENT_ID}"
}
JSON

echo "40-runtime-config: apiUrl=${API_URL} keycloakUrl=${KEYCLOAK_URL} realm=${KEYCLOAK_REALM}"
