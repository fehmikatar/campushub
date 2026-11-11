import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AppNotification } from '../../features/notifications/notification.model';
import { metaFor } from '../../features/notifications/notification-meta';
import { NotificationItem } from '../../features/notifications/notification-item';
import { NotificationsService } from '../../features/notifications/notifications.service';
import { Icon } from '../icon/icon';
import { Icons } from '../icon/icons';

/** Écran 23 : cloche de l'en-tête (badge `9+` au-delà de 9) et menu des 5 dernières notifications. */
@Component({
  selector: 'app-notification-bell',
  imports: [Icon, NotificationItem, RouterLink],
  template: `
    <button type="button" class="bell" aria-label="Notifications" [attr.aria-expanded]="open()" (click)="toggle()">
      <app-icon [name]="icons.bell" [size]="20" />
      @if (api.unreadCount() > 0) {
        <span class="badge">{{ api.unreadCount() > 9 ? '9+' : api.unreadCount() }}</span>
      }
    </button>

    @if (open()) {
      <div class="popover">
        @if (loading()) {
          <p class="empty">Chargement...</p>
        } @else if (latest().length === 0) {
          <p class="empty">Aucune notification récente</p>
        } @else {
          @for (notification of latest(); track notification.id) {
            <app-notification-item [notification]="notification" [compact]="true" (selected)="select($event)" />
          }
        }
        <a class="all" routerLink="/notifications" (click)="open.set(false)">Voir toutes les notifications →</a>
      </div>
    }
  `,
  styleUrl: './notification-bell.scss',
})
export class NotificationBell {
  protected readonly api = inject(NotificationsService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly icons = Icons;
  protected readonly open = signal(false);
  protected readonly loading = signal(false);
  protected readonly latest = signal<AppNotification[]>([]);

  protected toggle(): void {
    const next = !this.open();
    this.open.set(next);
    if (next) {
      this.loading.set(true);
      this.api.list({ perPage: 5 }).subscribe({
        next: (page) => {
          this.latest.set(page.data);
          this.loading.set(false);
        },
        error: () => {
          this.latest.set([]);
          this.loading.set(false);
        },
      });
    }
  }

  protected select(notification: AppNotification): void {
    this.open.set(false);
    if (notification.read_at === null) {
      this.api.markRead(notification.id).subscribe({
        next: () => this.api.refreshUnreadCount(),
        error: () => undefined,
      });
    }
    void this.router.navigate(metaFor(notification.type).link ?? ['/notifications']);
  }

  @HostListener('document:click', ['$event'])
  protected closeOnOutsideClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  protected closeOnEscape(): void {
    this.open.set(false);
  }
}
