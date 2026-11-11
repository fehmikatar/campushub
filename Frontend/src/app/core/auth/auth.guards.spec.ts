import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { Observable, firstValueFrom, isObservable } from 'rxjs';
import { fakeJwt } from '../../../testing/fake-jwt';
import { authGuard, roleGuard } from './auth.guards';
import { AuthService } from './auth.service';

const TOKEN_URL = 'http://localhost:8180/realms/campushub/protocol/openid-connect/token';
const route = {} as ActivatedRouteSnapshot;
const state = { url: '/mes-cours' } as RouterStateSnapshot;

describe('gardes de routes', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  let router: Router;

  const run = (guard: typeof authGuard) =>
    TestBed.runInInjectionContext(() => guard(route, state)) as boolean | UrlTree | Observable<boolean | UrlTree>;

  const login = (claims: Record<string, unknown> = {}, expiresIn = 1800) => {
    auth.login('x', 'y').subscribe();
    http.expectOne(TOKEN_URL).flush({ access_token: fakeJwt(claims, expiresIn), refresh_token: 'refresh-1' });
  };

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  it('renvoie vers la connexion (avec l\'adresse demandée) si personne n\'est connecté', () => {
    const result = run(authGuard) as UrlTree;
    expect(router.serializeUrl(result)).toBe('/login?returnUrl=%2Fmes-cours');
  });

  it('laisse passer un utilisateur connecté avec un rôle CampusHub', () => {
    login();
    expect(run(authGuard)).toBe(true);
  });

  it('envoie vers « Accès refusé » un utilisateur sans rôle CampusHub', () => {
    login({ realm_access: { roles: ['offline_access'] } });
    expect(router.serializeUrl(run(authGuard) as UrlTree)).toBe('/forbidden');
  });

  it('renouvelle un token expiré puis laisse passer', async () => {
    login({}, -60);
    const result = run(authGuard);
    expect(isObservable(result)).toBe(true);

    const promise = firstValueFrom(result as Observable<boolean | UrlTree>);
    http.expectOne(TOKEN_URL).flush({ access_token: fakeJwt(), refresh_token: 'refresh-2' });
    expect(await promise).toBe(true);
  });

  it('envoie vers « Session expirée » si le renouvellement échoue', async () => {
    login({}, -60);
    const promise = firstValueFrom(run(authGuard) as Observable<boolean | UrlTree>);
    http.expectOne(TOKEN_URL).flush({}, { status: 400, statusText: 'Bad Request' });
    expect(router.serializeUrl((await promise) as UrlTree)).toBe('/session-expired');
  });

  it('roleGuard refuse un rôle insuffisant et accepte un rôle autorisé', () => {
    login();
    expect(router.serializeUrl(run(roleGuard('ADMIN', 'ENSEIGNANT')) as UrlTree)).toBe('/forbidden');
    expect(run(roleGuard('ETUDIANT'))).toBe(true);
  });
});
