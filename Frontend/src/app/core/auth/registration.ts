import { AppConfig } from '../config/app-config';

const base64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

/**
 * Défi PKCE (S256) exigé par Keycloak pour ce client. Le code renvoyé après l'inscription n'est pas échangé :
 * la personne se connecte ensuite avec le formulaire, le vérificateur n'a donc pas besoin d'être conservé.
 */
export async function pkceChallenge(): Promise<string> {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

/** Adresse de la page d'inscription de Keycloak (les comptes sont créés et gérés par Keycloak). */
export function registrationUrl(config: AppConfig, returnTo: string, challenge: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    scope: 'openid',
    redirect_uri: returnTo,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: crypto.randomUUID(),
  });
  return `${config.keycloakUrl}/realms/${config.realm}/protocol/openid-connect/registrations?${params}`;
}
