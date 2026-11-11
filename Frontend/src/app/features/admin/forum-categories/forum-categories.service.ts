import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AppConfig } from '../../../core/config/app-config';
import { ForumCategory, ForumCategoryInput } from './forum-category';

@Injectable({ providedIn: 'root' })
export class ForumCategoriesService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfig);

  private get base(): string {
    return `${this.config.apiUrl}/api/v1/forum/categories`;
  }

  list(): Observable<ForumCategory[]> {
    return this.http.get<ForumCategory[]>(this.base);
  }

  create(input: ForumCategoryInput): Observable<ForumCategory> {
    return this.http.post<ForumCategory>(this.base, input);
  }

  update(id: string, input: ForumCategoryInput): Observable<ForumCategory> {
    return this.http.put<ForumCategory>(`${this.base}/${id}`, input);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
