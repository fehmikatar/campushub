import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ToastService } from '../../core/toast/toast.service';
import { Icon } from '../../shared/icon/icon';
import { Icons } from '../../shared/icon/icons';
import { AppNotification, Page } from './notification.model';
import { metaFor } from './notification-meta';
import { NotificationItem } from './notification-item';
import { NotificationsService } from './notifications.service';

type Tab = 'all' | 'unread';

/** Écran 22 : centre de notifications. */
@Component({
  selector: 'app-notifications-page',
  imports: [NotificationItem, Icon, RouterLink],
  templateUrl: './notifications-page.html',
  styleUrl: './notifications-page.scss',
})
export class NotificationsPage {
  private readonly api = inject(NotificationsService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly icons = Icons;
  protected readonly tab = signal<Tab>('all');
  protected readonly result = signal<Page<AppNotification> | null>(null);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  private page = 1;

  constructor() {
    this.load();
  }

  protected setTab(tab: Tab): void {
    this.tab.set(tab);
    this.page = 1;
    this.load();
  }

  protected goTo(page: number): void {
    this.page = page;
    this.load();
  }

  protected open(notification: AppNotification): void {
    if (notification.read_at === null) {
      this.api.markRead(notification.id).subscribe({
        next: (updated) => {
          this.result.update((page) =>
            page && { ...page, data: page.data.map((n) => (n.id === updated.id ? updated : n)) },
          );
          this.api.refreshUnreadCount();
        },
        error: () => undefined,
      });
    }
    const link = metaFor(notification.type).link;
    if (link) {
      void this.router.navigate(link);
    }
  }

  protected remove(notification: AppNotification): void {
    this.api.remove(notification.id).subscribe({
      next: () => {
        // La dernière notification d'une page retire cette page.
        const remaining = this.result()?.data.length ?? 0;
        if (remaining <= 1 && this.page > 1) {
          this.page -= 1;
        }
        this.load();
        this.api.refreshUnreadCount();
      },
      error: () => this.toast.error('Suppression impossible pour le moment.'),
    });
  }

  protected markAllRead(): void {
    this.api.markAllRead().subscribe({
      next: () => {
        this.toast.success('Toutes les notifications sont marquées comme lues.');
        this.load();
        this.api.refreshUnreadCount();
      },
      error: () => this.toast.error('Action impossible pour le moment.'),
    });
  }

  protected load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.api.list({ unread: this.tab() === 'unread', page: this.page }).subscribe({
      next: (result) => {
        this.result.set(result);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }
}
