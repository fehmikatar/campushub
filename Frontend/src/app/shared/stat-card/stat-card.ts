import { NgTemplateOutlet } from '@angular/common';
import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon, IconData } from '../icon/icon';

/** Carte d'indicateur : icône, libellé, valeur (« — » si indisponible), précision, lien facultatif. */
@Component({
  selector: 'app-stat-card',
  imports: [Icon, RouterLink, NgTemplateOutlet],
  template: `
    @if (link(); as target) {
      <a class="card stat" [routerLink]="target"><ng-container *ngTemplateOutlet="body" /></a>
    } @else {
      <div class="card stat"><ng-container *ngTemplateOutlet="body" /></div>
    }
    <ng-template #body>
      <span class="stat-icon"><app-icon [name]="icon()" [size]="22" /></span>
      <span class="stat-body">
        <small class="muted">{{ label() }}</small>
        <strong class="value">{{ value() ?? '—' }}</strong>
        @if (detail()) {
          <small class="muted">{{ detail() }}</small>
        }
      </span>
    </ng-template>
  `,
  styles: `
    :host { display: block; }
    .stat { display: flex; align-items: center; gap: 14px; height: 100%; padding: 18px; color: var(--text); text-decoration: none; }
    a.stat { transition: box-shadow 0.15s; }
    a.stat:hover { box-shadow: 0 4px 16px rgb(15 23 42 / 0.12); }
    .stat-icon { display: grid; place-items: center; flex: none; width: 48px; height: 48px; border-radius: 12px; background: var(--indigo-soft); color: var(--indigo); }
    .stat-body { display: grid; gap: 2px; min-width: 0; }
    .value { font-size: 28px; font-weight: 600; line-height: 1.1; }
    .muted { color: var(--text-muted); }
  `,
})
export class StatCard {
  readonly label = input.required<string>();
  readonly value = input<string | number | null>(null);
  readonly detail = input('');
  readonly icon = input.required<IconData>();
  readonly link = input<string | null>(null);
}
