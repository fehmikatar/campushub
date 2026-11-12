import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { AppConfig } from '../../core/config/app-config';
import { Category, ModerationFlag, Page, Post, Topic, TopicFilters, TopicInput } from './forum.models';

@Injectable({ providedIn: 'root' })
export class ForumService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfig);

  private get base(): string {
    return `${this.config.apiUrl}/api/v1/forum`;
  }

  categories(): Observable<Category[]> {
    return this.http.get<Category[]>(`${this.base}/categories`);
  }

  topics(courseId: number, filters: TopicFilters = {}): Observable<Page<Topic>> {
    let params = new HttpParams().set('page', filters.page ?? 1).set('limit', filters.limit ?? 20);
    if (filters.categoryId) {
      params = params.set('categoryId', filters.categoryId);
    }
    if (filters.q) {
      params = params.set('q', filters.q);
    }
    if (filters.resolved !== undefined) {
      params = params.set('resolved', filters.resolved);
    }
    return this.http.get<Page<Topic>>(`${this.base}/courses/${courseId}/topics`, { params });
  }

  topic(id: string): Observable<Topic> {
    return this.http.get<Topic>(`${this.base}/topics/${id}`);
  }

  createTopic(courseId: number, input: TopicInput): Observable<Topic> {
    return this.http.post<Topic>(`${this.base}/courses/${courseId}/topics`, input);
  }

  updateTopic(id: string, input: Partial<TopicInput>): Observable<Topic> {
    return this.http.put<Topic>(`${this.base}/topics/${id}`, input);
  }

  removeTopic(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/topics/${id}`);
  }

  /** Épingler, verrouiller ou marquer comme résolu (modération). */
  moderate(id: string, flag: ModerationFlag, value: boolean): Observable<Topic> {
    return this.http.patch<Topic>(`${this.base}/topics/${id}/${flag}`, { value });
  }

  posts(topicId: string, page = 1, limit = 50): Observable<Page<Post>> {
    const params = new HttpParams().set('page', page).set('limit', limit);
    return this.http.get<Page<Post> | Post[]>(`${this.base}/topics/${topicId}/posts`, { params }).pipe(
      // Tolère aussi une réponse en simple liste.
      map((response) =>
        Array.isArray(response)
          ? { items: response, page: 1, limit: response.length, total: response.length, totalPages: 1 }
          : response,
      ),
    );
  }

  createPost(topicId: string, content: string, parentPostId?: string): Observable<Post> {
    const body: { content: string; parentPostId?: string } = { content };
    if (parentPostId) {
      body.parentPostId = parentPostId;
    }
    return this.http.post<Post>(`${this.base}/topics/${topicId}/posts`, body);
  }

  updatePost(id: string, content: string): Observable<Post> {
    return this.http.put<Post>(`${this.base}/posts/${id}`, { content });
  }

  removePost(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/posts/${id}`);
  }

  accept(id: string, value: boolean): Observable<Post> {
    return this.http.patch<Post>(`${this.base}/posts/${id}/accept`, { value });
  }

  like(id: string): Observable<unknown> {
    return this.http.post<unknown>(`${this.base}/posts/${id}/like`, {});
  }

  unlike(id: string): Observable<unknown> {
    return this.http.delete<unknown>(`${this.base}/posts/${id}/like`);
  }
}
