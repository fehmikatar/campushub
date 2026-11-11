import { Component, computed, input, output } from '@angular/core';
import { Icon } from '../../shared/icon/icon';
import { Icons } from '../../shared/icon/icons';
import { timeAgo } from '../../shared/time-ago';
import { AppNotification } from './notification.model';
import { metaFor } from './notification-meta';

/** Une notification : liste complète (avec suppression) ou menu de la cloche (`compact`). */
@Component({
  selector: 'app-notification-item',
  imports: [Icon],
  template: `
    <div class="item" [class.unread]="unread()" [class.compact]="compact()">
      <button type="button" class="main" (click)="selected.emit(notification())">
        <span class="dot" [class.on]="unread()" aria-hidden="true"></span>
        <span class="badge" [class]="'badge ' + meta().tone"><app-icon [name]="meta().icon" [size]="18" /></span>
        <span class="text">
          <strong>{{ notification().title }}</strong>
          <span class="message">{{ notification().message }}</span>
          <small class="time"><app-icon [name]="icons.clock" [size]="12" /> {{ ago() }}</small>
        </span>
        @if (unread()) {
          <span class="sr-only">non lue</span>
        }
      </button>
      @if (!compact()) {
        <button type="button" class="remove" aria-label="Supprimer la notification" (click)="removed.emit(notification())">
          <app-icon [name]="icons.trash" [size]="16" />
        </button>
      }
    </div>
  `,
  styleUrl: './notification-item.scss',
})
export class NotificationItem {
  readonly notification = input.required<AppNotification>();
  readonly compact = input(false);
  readonly selected = output<AppNotification>();
  readonly removed = output<AppNotification>();

  protected readonly icons = Icons;
  protected readonly meta = computed(() => metaFor(this.notification().type));
  protected readonly unread = computed(() => this.notification().read_at === null);
  protected readonly ago = computed(() => timeAgo(this.notification().created_at));
}
