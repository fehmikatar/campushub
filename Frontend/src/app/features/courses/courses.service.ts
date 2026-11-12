import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AppConfig } from '../../core/config/app-config';
import { Course, CourseFilters, CoursePage } from './course';

@Injectable({ providedIn: 'root' })
export class CoursesService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfig);

  private get base(): string {
    return `${this.config.apiUrl}/api/v1/courses`;
  }

  list(filters: CourseFilters = {}): Observable<CoursePage> {
    let params = new HttpParams().set('page', filters.page ?? 1).set('limit', filters.limit ?? 10);
    if (filters.statut) {
      params = params.set('statut', filters.statut);
    }
    if (filters.formateurId) {
      params = params.set('formateurId', filters.formateurId);
    }
    if (filters.categorie) {
      params = params.set('categorie', filters.categorie);
    }
    return this.http.get<CoursePage>(this.base, { params });
  }

  categories(): Observable<string[]> {
    return this.http.get<string[]>(`${this.base}/categories`);
  }

  publish(id: number): Observable<Course> {
    return this.http.patch<Course>(`${this.base}/${id}/publish`, {});
  }

  archive(id: number): Observable<Course> {
    return this.http.patch<Course>(`${this.base}/${id}/archive`, {});
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
