import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { fakeJwt } from '../../../testing/fake-jwt';
import { AuthService } from './auth.service';

const TOKEN_URL = 'http://localhost:8180/realms/campushub/protocol/openid-connect/token';

describe('AuthService', () => {
  let auth: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('se connecte auprès de Keycloak et lit l\'utilisateur dans le token', () => {
    let role: string | null | undefined;
    auth.login('etudiant1', 'Test1234!').subscribe((user) => (role = user?.role));

    const request = http.expectOne(TOKEN_URL);
    expect(request.request.body).toContain('grant_type=password');
    expect(request.request.body).toContain('client_id=campushub-frontend');
    request.flush({ access_token: fakeJwt(), refresh_token: 'refresh-1' });

    expect(role).toBe('ETUDIANT');
    expect(auth.user()?.prenom).toBe('Élise');
    expect(auth.isAuthenticated()).toBe(true);
    expect(sessionStorage.getItem('campushub.tokens')).toContain('refresh-1');
  });

  it('un token sans rôle CampusHub donne un rôle null', () => {
    auth.login('x', 'y').subscribe();
    http.expectOne(TOKEN_URL).flush({
      access_token: fakeJwt({ realm_access: { roles: ['offline_access'] } }),
      refresh_token: 'r',
    });
    expect(auth.user()?.role).toBeNull();
  });

  it('renouvelle le token avec le refresh token, en une seule requête pour plusieurs appels', () => {
    auth.login('x', 'y').subscribe();
    http.expectOne(TOKEN_URL).flush({ access_token: fakeJwt(), refresh_token: 'refresh-1' });

    const newToken = fakeJwt({ given_name: 'Nouveau' });
    const received: string[] = [];
    auth.refresh().subscribe((token) => received.push(token));
    auth.refresh().subscribe((token) => received.push(token));

    const request = http.expectOne(TOKEN_URL);
    expect(request.request.body).toContain('grant_type=refresh_token');
    expect(request.request.body).toContain('refresh_token=refresh-1');
    request.flush({ access_token: newToken, refresh_token: 'refresh-2' });

    expect(received).toEqual([newToken, newToken]);
    expect(auth.user()?.prenom).toBe('Nouveau');
  });

  it('se déconnecte en vidant les tokens', () => {
    auth.login('x', 'y').subscribe();
    http.expectOne(TOKEN_URL).flush({ access_token: fakeJwt(), refresh_token: 'r' });

    auth.logout();

    expect(auth.isAuthenticated()).toBe(false);
    expect(sessionStorage.getItem('campushub.tokens')).toBeNull();
  });

  it('détecte un access token expiré', () => {
    auth.login('x', 'y').subscribe();
    http.expectOne(TOKEN_URL).flush({ access_token: fakeJwt({}, -60), refresh_token: 'r' });

    expect(auth.isAccessTokenExpired()).toBe(true);
    expect(auth.hasSession()).toBe(true);
  });
});
