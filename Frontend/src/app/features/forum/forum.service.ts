import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AppConfig } from '../../core/config/app-config';
import { Paged, Post, Topic, TopicFilters, TopicFlag, TopicInput } from './forum.model';

@Injectable({ providedIn: 'root' })
export class ForumService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfig);

  private get base(): string {
    return `${this.config.apiUrl}/api/v1/forum`;
  }

  listTopics(courseId: string, filters: TopicFilters = {}): Observable<Paged<Topic>> {
    let params = new HttpParams().set('page', filters.page ?? 1).set('limit', filters.limit ?? 10);
    if (filters.categoryId) {
      params = params.set('categoryId', filters.categoryId);
    }
    if (filters.q?.trim()) {
      params = params.set('q', filters.q.trim());
    }
    if (filters.resolved !== undefined) {
      params = params.set('resolved', filters.resolved);
    }
    return this.http.get<Paged<Topic>>(`${this.base}/courses/${encodeURIComponent(courseId)}/topics`, { params });
  }

  createTopic(courseId: string, input: TopicInput): Observable<Topic> {
    return this.http.post<Topic>(`${this.base}/courses/${encodeURIComponent(courseId)}/topics`, input);
  }

  topic(id: string): Observable<Topic> {
    return this.http.get<Topic>(`${this.base}/topics/${id}`);
  }

  updateTopic(id: string, input: TopicInput): Observable<Topic> {
    return this.http.put<Topic>(`${this.base}/topics/${id}`, input);
  }

  deleteTopic(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/topics/${id}`);
  }

  /** Épingler, verrouiller (modérateurs) ou marquer résolu (auteur ou modérateur). */
  setFlag(id: string, flag: TopicFlag, value: boolean): Observable<unknown> {
    return this.http.patch(`${this.base}/topics/${id}/${flag}`, { value });
  }

  posts(topicId: string, page = 1): Observable<Paged<Post>> {
    const params = new HttpParams().set('page', page).set('limit', 20);
    return this.http.get<Paged<Post>>(`${this.base}/topics/${topicId}/posts`, { params });
  }

  createPost(topicId: string, content: string, parentPostId?: string | null): Observable<Post> {
    return this.http.post<Post>(`${this.base}/topics/${topicId}/posts`, {
      content,
      ...(parentPostId ? { parentPostId } : {}),
    });
  }

  updatePost(id: string, content: string): Observable<Post> {
    return this.http.put<Post>(`${this.base}/posts/${id}`, { content });
  }

  deletePost(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/posts/${id}`);
  }

  /** Marque (ou retire) la meilleure réponse : auteur du sujet ou modérateur. */
  accept(postId: string, value: boolean): Observable<{ postId: string; isAcceptedAnswer: boolean; topicResolved: boolean }> {
    return this.http.patch<{ postId: string; isAcceptedAnswer: boolean; topicResolved: boolean }>(
      `${this.base}/posts/${postId}/accept`,
      { value },
    );
  }

  like(postId: string): Observable<{ postId: string; likesCount: number; likedByMe: boolean }> {
    return this.http.post<{ postId: string; likesCount: number; likedByMe: boolean }>(`${this.base}/posts/${postId}/like`, {});
  }

  unlike(postId: string): Observable<{ postId: string; likesCount: number; likedByMe: boolean }> {
    return this.http.delete<{ postId: string; likesCount: number; likedByMe: boolean }>(`${this.base}/posts/${postId}/like`);
  }
}
