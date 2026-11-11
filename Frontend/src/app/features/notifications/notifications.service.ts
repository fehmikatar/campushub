import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { AppConfig } from '../../core/config/app-config';
import { AppNotification, NotificationPreferences, Page } from './notification.model';

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfig);

  /** Nombre de notifications non lues (badge de la cloche). */
  readonly unreadCount = signal(0);

  private get base(): string {
    return `${this.config.apiUrl}/api/v1/notifications`;
  }

  list(options: { unread?: boolean; page?: number; perPage?: number } = {}): Observable<Page<AppNotification>> {
    let params = new HttpParams().set('per_page', options.perPage ?? 20).set('page', options.page ?? 1);
    if (options.unread) {
      params = params.set('unread', 1);
    }
    return this.http.get<Page<AppNotification>>(this.base, { params });
  }

  /** Met à jour le badge ; une erreur (service indisponible) laisse la valeur précédente. */
  refreshUnreadCount(): void {
    this.http.get<{ count: number }>(`${this.base}/unread-count`).subscribe({
      next: (response) => this.unreadCount.set(response.count),
      error: () => undefined,
    });
  }

  markRead(id: number): Observable<AppNotification> {
    return this.http.patch<AppNotification>(`${this.base}/${id}/read`, {});
  }

  markAllRead(): Observable<{ updated: number }> {
    return this.http.patch<{ updated: number }>(`${this.base}/read-all`, {});
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  preferences(): Observable<NotificationPreferences> {
    return this.http.get<NotificationPreferences>(`${this.base}/preferences`);
  }

  updatePreferences(preferences: NotificationPreferences): Observable<NotificationPreferences> {
    return this.http.put<NotificationPreferences>(`${this.base}/preferences`, preferences);
  }
}
