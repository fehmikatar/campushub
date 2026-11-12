import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AppConfig } from '../../core/config/app-config';
import { Enrollment, EnrollmentFilters, Progression } from './enrollment.model';

/**
 * Inscriptions aux cours. Un étudiant ne voit que les siennes (le service filtre sur son token) ; l'enseignant et
 * l'administrateur peuvent lister par cours (`coursId`) ou par étudiant (`etudiantId`). La liste n'est pas paginée.
 */
@Injectable({ providedIn: 'root' })
export class EnrollmentsService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfig);

  private get base(): string {
    return `${this.config.apiUrl}/api/v1/enrollments`;
  }

  list(filters: EnrollmentFilters = {}): Observable<Enrollment[]> {
    let params = new HttpParams();
    if (filters.coursId !== undefined && `${filters.coursId}` !== '') {
      params = params.set('coursId', `${filters.coursId}`);
    }
    if (filters.etudiantId) {
      params = params.set('etudiantId', filters.etudiantId);
    }
    return this.http.get<Enrollment[]>(`${this.base}/`, { params });
  }

  /** S'inscrire à un cours (étudiant). L'identifiant de l'étudiant vient du token. */
  enroll(coursId: string | number): Observable<Enrollment> {
    return this.http.post<Enrollment>(`${this.base}/`, { cours_id: `${coursId}` });
  }

  /** Annuler une inscription (étudiant concerné ou administrateur). */
  cancel(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}/`);
  }

  progress(id: number): Observable<Progression> {
    return this.http.get<Progression>(`${this.base}/${id}/progress/`);
  }

  /** Met à jour la progression (étudiant) ; `pourcentage` entre 0 et 100. */
  setProgress(id: number, pourcentage: number): Observable<Progression> {
    return this.http.put<Progression>(`${this.base}/${id}/progress/`, { pourcentage });
  }
}
