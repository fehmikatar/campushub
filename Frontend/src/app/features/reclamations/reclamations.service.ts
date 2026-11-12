import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map } from 'rxjs';
import { AppConfig } from '../../core/config/app-config';
import { PageOf, Reclamation, ReclamationFilters, ReclamationInput, STATUSES, Stats, Status, StatusChange } from './reclamation.model';

/**
 * Service de réclamations d'Aziz. Toutes les adresses passent par la Gateway : `/api/v1/reclamation/...` est
 * réécrit en `/api/...` côté service (voir le README du dossier). L'identité et le rôle viennent du token Keycloak.
 */
@Injectable({ providedIn: 'root' })
export class ReclamationsService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfig);

  private get base(): string {
    return `${this.config.apiUrl}/api/v1/reclamation/reclamations`;
  }

  list(filters: ReclamationFilters = {}): Observable<PageOf<Reclamation>> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && `${value}`.trim() !== '') {
        params = params.set(key, `${value}`.trim());
      }
    }
    return this.http.get<PageOf<Reclamation>>(`${this.base}/`, { params });
  }

  /**
   * Nombre de réclamations par statut (sans le total des autres filtres) : une requête par statut, car l'API ne
   * renvoie que les comptes de la page demandée ; le total est la somme.
   */
  statusCounts(filters: Omit<ReclamationFilters, 'status' | 'page' | 'ordering'> = {}): Observable<Record<Status | 'total', number>> {
    return forkJoin(STATUSES.map((status) => this.list({ ...filters, status }).pipe(map((page) => page.count)))).pipe(
      map((counts) => {
        const result = { total: counts.reduce((sum, count) => sum + count, 0) } as Record<Status | 'total', number>;
        STATUSES.forEach((status, index) => (result[status] = counts[index]));
        return result;
      }),
    );
  }

  get(id: string): Observable<Reclamation> {
    return this.http.get<Reclamation>(`${this.base}/${id}/`);
  }

  create(input: ReclamationInput): Observable<Reclamation> {
    return this.http.post<Reclamation>(`${this.base}/`, input);
  }

  /** Seulement tant que la réclamation est « Nouvelle » : catégorie, objet, description et module. */
  update(id: string, input: Pick<ReclamationInput, 'category' | 'subject' | 'description' | 'module'>): Observable<Reclamation> {
    return this.http.patch<Reclamation>(`${this.base}/${id}/`, input);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}/`);
  }

  /** Administrateur : changement de statut, avec priorité, commentaire de suivi et réponse à l'étudiant. */
  changeStatus(id: string, change: StatusChange): Observable<Reclamation> {
    return this.http.post<Reclamation>(`${this.base}/${id}/change-status/`, change);
  }

  /** Administrateur : comptes par statut, catégorie et priorité. */
  stats(academicYear?: string): Observable<Stats> {
    const params = academicYear ? new HttpParams().set('academic_year', academicYear) : new HttpParams();
    return this.http.get<Stats>(`${this.base}/stats/`, { params });
  }
}
