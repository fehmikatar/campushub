import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, finalize, map, shareReplay, tap, throwError } from 'rxjs';
import { AppConfig } from '../config/app-config';
import { decodeJwt } from './jwt';
import { Role, highestRole } from './role';

export interface CurrentUser {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  /** null = token valide mais aucun rôle CampusHub (page « Accès refusé »). */
  role: Role | null;
}

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
}

const STORAGE_KEY = 'campushub.tokens';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfig);

  private readonly tokens = signal<Tokens | null>(this.readStorage());
  private refreshing: Observable<string> | null = null;

  readonly user = computed<CurrentUser | null>(() => {
    const tokens = this.tokens();
    const payload = tokens ? decodeJwt(tokens.accessToken) : null;
    if (!payload?.sub) {
      return null;
    }
    return {
      id: payload.sub,
      prenom: payload.given_name ?? '',
      nom: payload.family_name ?? '',
      email: payload.email ?? '',
      role: highestRole(payload.realm_access?.roles),
    };
  });

  readonly isAuthenticated = computed(() => this.user() !== null);

  accessToken(): string | null {
    return this.tokens()?.accessToken ?? null;
  }

  /** Un refresh token est disponible : la session peut être renouvelée même si l'access token a expiré. */
  hasSession(): boolean {
    return this.tokens() !== null;
  }

  isAccessTokenExpired(skewSeconds = 10): boolean {
    const token = this.accessToken();
    const exp = token ? decodeJwt(token)?.exp : undefined;
    return exp === undefined || exp * 1000 <= Date.now() + skewSeconds * 1000;
  }

  login(username: string, password: string): Observable<CurrentUser | null> {
    return this.requestTokens({ grant_type: 'password', username, password }).pipe(
      tap((tokens) => this.setTokens(tokens)),
      map(() => this.user()),
    );
  }

  /** Renouvelle l'access token ; les appels simultanés partagent une seule requête. */
  refresh(): Observable<string> {
    const current = this.tokens();
    if (!current) {
      return throwError(() => new Error('Aucune session'));
    }
    this.refreshing ??= this.requestTokens({
      grant_type: 'refresh_token',
      refresh_token: current.refreshToken,
    }).pipe(
      tap((tokens) => this.setTokens(tokens)),
      map((tokens) => tokens.accessToken),
      finalize(() => (this.refreshing = null)),
      shareReplay(1),
    );
    return this.refreshing;
  }

  logout(): void {
    this.setTokens(null);
  }

  private requestTokens(fields: Record<string, string>): Observable<Tokens> {
    const body = new HttpParams({ fromObject: { client_id: this.config.clientId, ...fields } });
    const url = `${this.config.keycloakUrl}/realms/${this.config.realm}/protocol/openid-connect/token`;
    return this.http
      .post<TokenResponse>(url, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      .pipe(
        map((response) => ({
          accessToken: response.access_token,
          refreshToken: response.refresh_token,
        })),
      );
  }

  private setTokens(tokens: Tokens | null): void {
    this.tokens.set(tokens);
    try {
      if (tokens) {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
      } else {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // stockage indisponible : la session reste valable tant que la page n'est pas rechargée
    }
  }

  private readStorage(): Tokens | null {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as Partial<Tokens>) : null;
      return parsed?.accessToken && parsed.refreshToken
        ? { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken }
        : null;
    } catch {
      return null;
    }
  }
}
