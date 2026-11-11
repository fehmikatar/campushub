import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { fakeJwt } from '../../../testing/fake-jwt';
import { ToastService } from '../toast/toast.service';
import { AuthService } from './auth.service';
import { authInterceptor } from './auth.interceptor';

const API = 'http://localhost:8080/api/v1/courses';
const TOKEN_URL = 'http://localhost:8180/realms/campushub/protocol/openid-connect/token';

describe('authInterceptor', () => {
  let client: HttpClient;
  let http: HttpTestingController;
  let auth: AuthService;
  let navigate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sessionStorage.clear();
    navigate = vi.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigate } },
      ],
    });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);

    auth.login('x', 'y').subscribe();
    http.expectOne(TOKEN_URL).flush({ access_token: 'old-token', refresh_token: 'refresh-1' });
  });

  afterEach(() => http.verify());

  it('ajoute le token aux appels vers la Gateway mais pas vers Keycloak', () => {
    client.get(API).subscribe();
    expect(http.expectOne(API).request.headers.get('Authorization')).toBe('Bearer old-token');

    client.get('http://localhost:8180/realms/campushub').subscribe();
    expect(http.expectOne('http://localhost:8180/realms/campushub').request.headers.has('Authorization')).toBe(false);
  });

  it('sur 401 renouvelle le token une fois puis rejoue la requête', () => {
    const newToken = fakeJwt();
    let result: unknown;
    client.get(API).subscribe((body) => (result = body));

    http.expectOne(API).flush({}, { status: 401, statusText: 'Unauthorized' });
    http.expectOne(TOKEN_URL).flush({ access_token: newToken, refresh_token: 'refresh-2' });
    const retry = http.expectOne(API);
    expect(retry.request.headers.get('Authorization')).toBe(`Bearer ${newToken}`);
    retry.flush({ ok: true });

    expect(result).toEqual({ ok: true });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('sur 401 sans renouvellement possible, ouvre « Session expirée » et vide la session', () => {
    client.get(API).subscribe({ error: () => undefined });

    http.expectOne(API).flush({}, { status: 401, statusText: 'Unauthorized' });
    http.expectOne(TOKEN_URL).flush({ error: 'invalid_grant' }, { status: 400, statusText: 'Bad Request' });

    expect(navigate).toHaveBeenCalledWith(['/session-expired']);
    expect(auth.hasSession()).toBe(false);
  });

  it('sur 403 ouvre « Accès refusé »', () => {
    client.get(API).subscribe({ error: () => undefined });
    http.expectOne(API).flush({}, { status: 403, statusText: 'Forbidden' });
    expect(navigate).toHaveBeenCalledWith(['/forbidden']);
  });

  it('sur 503 affiche un message de service indisponible', () => {
    client.get(API).subscribe({ error: () => undefined });
    http.expectOne(API).flush({}, { status: 503, statusText: 'Service Unavailable' });
    expect(TestBed.inject(ToastService).toasts()[0].message).toBe('Service momentanément indisponible');
  });
});
