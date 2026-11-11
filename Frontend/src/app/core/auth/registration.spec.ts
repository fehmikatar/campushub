import { AppConfig } from '../config/app-config';
import { pkceChallenge, registrationUrl } from './registration';

describe('inscription', () => {
  it('génère un défi PKCE S256 en base64url, différent à chaque appel', async () => {
    const first = await pkceChallenge();
    const second = await pkceChallenge();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
  });

  it("construit l'adresse de la page d'inscription de Keycloak", () => {
    const url = new URL(registrationUrl(new AppConfig(), 'http://localhost:4200/login?registered=1', 'challenge-1'));

    expect(url.origin + url.pathname).toBe(
      'http://localhost:8180/realms/campushub/protocol/openid-connect/registrations',
    );
    expect(url.searchParams.get('client_id')).toBe('campushub-frontend');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:4200/login?registered=1');
    expect(url.searchParams.get('code_challenge')).toBe('challenge-1');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBeTruthy();
  });
});
