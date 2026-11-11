import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, switchMap } from 'rxjs';
import { Role } from '../../../core/auth/role';
import { AppConfig } from '../../../core/config/app-config';

export interface KeycloakUser {
  id: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled: boolean;
  createdTimestamp?: number;
  /** `requestedRole` : rôle souhaité à l'inscription (aucun droit tant qu'un admin ne l'a pas validé). */
  attributes?: Record<string, string[]>;
}

/** Utilisateur affiché : le rôle CampusHub le plus élevé est déduit des membres de chaque rôle. */
export interface ManagedUser extends KeycloakUser {
  role: Role;
  requestedRole: Role | null;
}

interface RoleRepresentation {
  id: string;
  name: string;
}

export const PAGE_SIZE = 20;

/**
 * Gestion des comptes via l'API d'administration de Keycloak (pas de service User pour l'instant).
 * Le token de l'administrateur doit porter les rôles `realm-management` view-users, manage-users, view-realm.
 */
@Injectable({ providedIn: 'root' })
export class KeycloakUsersService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfig);

  private get base(): string {
    return `${this.config.keycloakUrl}/admin/realms/${this.config.realm}`;
  }

  list(search: string, page: number): Observable<{ users: ManagedUser[]; total: number }> {
    let params = new HttpParams().set('first', (page - 1) * PAGE_SIZE).set('max', PAGE_SIZE).set('briefRepresentation', false);
    let countParams = new HttpParams();
    if (search.trim()) {
      params = params.set('search', search.trim());
      countParams = countParams.set('search', search.trim());
    }
    return forkJoin({
      users: this.http.get<KeycloakUser[]>(`${this.base}/users`, { params }),
      total: this.http.get<number>(`${this.base}/users/count`, { params: countParams }),
      teachers: this.membersOf('ENSEIGNANT'),
      admins: this.membersOf('ADMIN'),
    }).pipe(
      map(({ users, total, teachers, admins }) => ({
        total,
        users: users.map((user) => this.toManaged(user, teachers, admins)),
      })),
    );
  }

  count(): Observable<number> {
    return this.http.get<number>(`${this.base}/users/count`);
  }

  countMembers(role: Role): Observable<number> {
    return this.membersOf(role).pipe(map((ids) => ids.size));
  }

  /** Valide un compte comme enseignant (il garde ETUDIANT ; le front retient le rôle le plus élevé). */
  grantTeacher(userId: string): Observable<void> {
    return this.role('ENSEIGNANT').pipe(
      switchMap((role) => this.http.post<void>(`${this.base}/users/${userId}/role-mappings/realm`, [role])),
    );
  }

  revokeTeacher(userId: string): Observable<void> {
    return this.role('ENSEIGNANT').pipe(
      switchMap((role) => this.http.request<void>('DELETE', `${this.base}/users/${userId}/role-mappings/realm`, { body: [role] })),
    );
  }

  private role(name: Role): Observable<RoleRepresentation> {
    return this.http.get<RoleRepresentation>(`${this.base}/roles/${name}`);
  }

  private membersOf(role: Role): Observable<Set<string>> {
    return this.http
      .get<KeycloakUser[]>(`${this.base}/roles/${role}/users`, { params: new HttpParams().set('max', 1000) })
      .pipe(map((users) => new Set(users.map((user) => user.id))));
  }

  private toManaged(user: KeycloakUser, teachers: Set<string>, admins: Set<string>): ManagedUser {
    const requested = user.attributes?.['requestedRole']?.[0];
    return {
      ...user,
      role: admins.has(user.id) ? 'ADMIN' : teachers.has(user.id) ? 'ENSEIGNANT' : 'ETUDIANT',
      requestedRole: requested === 'ENSEIGNANT' || requested === 'ETUDIANT' ? requested : null,
    };
  }
}
