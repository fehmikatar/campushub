import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AppNotification } from '../notifications/notification.model';
import { metaFor } from '../notifications/notification-meta';
import { NotificationItem } from '../notifications/notification-item';
import { NotificationsService } from '../notifications/notifications.service';

/** Bloc « Dernières notifications non lues » des tableaux de bord. */
@Component({
  selector: 'app-unread-notifications',
  imports: [NotificationItem, RouterLink],
  template: `
    <section class="card block">
      <header>
        <h2>Notifications non lues</h2>
        <a routerLink="/notifications">Tout voir →</a>
      </header>
      @if (failed()) {
        <p class="muted pad">Impossible de charger les notifications.</p>
      } @else if (items() === null) {
        <p class="muted pad">Chargement...</p>
      } @else if (items()!.length === 0) {
        <p class="muted pad">Aucune notification non lue.</p>
      } @else {
        @for (notification of items(); track notification.id) {
          <app-notification-item [notification]="notification" [compact]="true" (selected)="open($event)" />
        }
      }
    </section>
  `,
  styles: `
    .block { overflow: hidden; }
    header { display: flex; align-items: center; justify-content: space-between; padding: 16px 18px 8px; }
    h2 { margin: 0; font-size: 16px; }
    header a { font-size: 13px; text-decoration: none; }
    .pad { margin: 0; padding: 8px 18px 18px; }
    .muted { color: var(--text-muted); }
  `,
})
export class UnreadNotifications {
  private readonly api = inject(NotificationsService);
  private readonly router = inject(Router);

  protected readonly items = signal<AppNotification[] | null>(null);
  protected readonly failed = signal(false);

  constructor() {
    this.api.list({ unread: true, perPage: 3 }).subscribe({
      next: (page) => this.items.set(page.data),
      error: () => this.failed.set(true),
    });
  }

  protected open(notification: AppNotification): void {
    this.api.markRead(notification.id).subscribe({ next: () => this.api.refreshUnreadCount(), error: () => undefined });
    void this.router.navigate(metaFor(notification.type).link ?? ['/notifications']);
  }
}
