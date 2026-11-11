import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ROLE_LABELS } from '../../core/auth/role';
import { NotificationsService } from '../../features/notifications/notifications.service';
import { Icon } from '../icon/icon';
import { Icons } from '../icon/icons';
import { MENUS } from './menu';
import { NotificationBell } from './notification-bell';

/** Intervalle de mise à jour du badge de la cloche. */
const UNREAD_POLL_MS = 60_000;

/** Page applicative : sidebar (menu selon le rôle) + en-tête + contenu. */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, NotificationBell],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationsService);

  constructor() {
    this.notifications.refreshUnreadCount();
    const timer = setInterval(() => this.notifications.refreshUnreadCount(), UNREAD_POLL_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected readonly icons = Icons;
  protected readonly menuOpen = signal(false);

  protected readonly user = this.auth.user;
  protected readonly menu = computed(() => {
    const role = this.user()?.role;
    return role ? MENUS[role] : [];
  });
  protected readonly roleLabel = computed(() => {
    const role = this.user()?.role;
    return role ? ROLE_LABELS[role] : '';
  });
  protected readonly initials = computed(() => {
    const user = this.user();
    const letters = `${user?.prenom.charAt(0) ?? ''}${user?.nom.charAt(0) ?? ''}`;
    return (letters || user?.email.charAt(0) || '?').toUpperCase();
  });

  protected logout(): void {
    this.notifications.unreadCount.set(0);
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
