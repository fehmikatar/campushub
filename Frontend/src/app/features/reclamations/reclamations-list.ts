import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Icon } from '../../shared/icon/icon';
import { Icons } from '../../shared/icon/icons';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  Category,
  ORDERING_LABELS,
  Ordering,
  PRIORITIES,
  PRIORITY_LABELS,
  PageOf,
  Priority,
  Reclamation,
  STATUSES,
  STATUS_LABELS,
  Status,
  academicYears,
} from './reclamation.model';
import { ReclamationTable } from './reclamation-table';
import { ReclamationsService } from './reclamations.service';

const PAGE_SIZE = 20;

/** Écran 2 : « Mes réclamations » (recherche, filtres, tri, pagination). */
@Component({
  selector: 'app-reclamations-list',
  imports: [FormsModule, RouterLink, Icon, ReclamationTable],
  template: `
    <div class="page">
      <p class="crumbs"><a routerLink="/reclamations">Réclamations</a> / Mes réclamations</p>
      <header class="page-head">
        <div>
          <h1>Mes réclamations</h1>
          <p>Retrouvez et suivez toutes vos demandes auprès de l'administration.</p>
        </div>
        <a class="btn btn-primary" routerLink="/reclamations/nouvelle">
          <app-icon [name]="icons.plus" [size]="16" /> Nouvelle réclamation
        </a>
      </header>

      <div class="summary">
        <div class="card"><strong>{{ counts()?.total ?? '—' }}</strong><span>Total</span></div>
        @for (status of statuses; track status) {
          <div class="card"><strong>{{ counts()?.[status] ?? '—' }}</strong><span>{{ statusLabels[status] }}s</span></div>
        }
      </div>

      <form class="toolbar" (ngSubmit)="apply()">
        <div class="grow">
          <input class="search-input" type="search" name="search" [(ngModel)]="search" placeholder="Rechercher par référence ou objet..." aria-label="Rechercher" />
        </div>
        <label class="control">Statut
          <select name="status" [(ngModel)]="status" (ngModelChange)="apply()">
            <option value="">Tous</option>
            @for (item of statuses; track item) { <option [value]="item">{{ statusLabels[item] }}</option> }
          </select>
        </label>
        <label class="control">Catégorie
          <select name="category" [(ngModel)]="category" (ngModelChange)="apply()">
            <option value="">Toutes</option>
            @for (item of categories; track item) { <option [value]="item">{{ categoryLabels[item] }}</option> }
          </select>
        </label>
        <label class="control">Année universitaire
          <select name="year" [(ngModel)]="year" (ngModelChange)="apply()">
            <option value="">Toutes</option>
            @for (item of years; track item) { <option [value]="item">{{ item }}</option> }
          </select>
        </label>
        <label class="control">Priorité
          <select name="priority" [(ngModel)]="priority" (ngModelChange)="apply()">
            <option value="">Toutes</option>
            @for (item of priorities; track item) { <option [value]="item">{{ priorityLabels[item] }}</option> }
          </select>
        </label>
        <label class="control">Trier par
          <select name="ordering" [(ngModel)]="ordering" (ngModelChange)="apply()">
            @for (item of orderings; track item) { <option [value]="item">{{ orderingLabels[item] }}</option> }
          </select>
        </label>
        <button type="submit" class="btn btn-secondary">Rechercher</button>
      </form>

      @if (failed()) {
        <div class="alert" role="alert">
          Impossible de charger vos réclamations.
          <button type="button" class="link-btn" (click)="load()">Réessayer</button>
        </div>
      } @else if (result() === null) {
        <div class="card card-pad loading"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>
      } @else if (result()!.results.length === 0) {
        <div class="card empty-state">
          <span class="badge-icon"><app-icon [name]="icons.inbox" [size]="36" /></span>
          <h2>{{ filtered() ? 'Aucun résultat' : 'Aucune réclamation pour le moment' }}</h2>
          <p class="muted">
            {{ filtered() ? 'Aucune réclamation ne correspond à ces critères.' : "Vous n'avez pas encore soumis de réclamation." }}
          </p>
          @if (filtered()) {
            <button type="button" class="btn btn-secondary" (click)="reset()">Réinitialiser les filtres</button>
          } @else {
            <a class="btn btn-primary" routerLink="/reclamations/nouvelle">Créer une réclamation</a>
          }
        </div>
      } @else {
        <app-reclamation-table [items]="result()!.results" />
        @if (totalPages() > 1) {
          <nav class="pager" aria-label="Pagination">
            <button type="button" class="btn btn-secondary" [disabled]="page() <= 1" (click)="goTo(page() - 1)">
              <app-icon [name]="icons.chevronLeft" [size]="16" /> Précédent
            </button>
            <span class="muted">Page {{ page() }} sur {{ totalPages() }} ({{ result()!.count }} réclamations)</span>
            <button type="button" class="btn btn-secondary" [disabled]="page() >= totalPages()" (click)="goTo(page() + 1)">
              Suivant <app-icon [name]="icons.chevronRight" [size]="16" />
            </button>
          </nav>
        }
      }
    </div>
  `,
  styles: `
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-bottom: 16px; }
    .summary .card { display: grid; gap: 2px; padding: 12px 16px; }
    .summary strong { font-size: 22px; line-height: 1.2; }
    .summary span, .muted { color: var(--text-muted); font-size: 12px; }
    .loading { display: grid; gap: 14px; }
    .muted { font-size: 14px; margin: 0; }
  `,
})
export class ReclamationsList {
  private readonly api = inject(ReclamationsService);

  protected readonly icons = Icons;
  protected readonly statuses = STATUSES;
  protected readonly categories = CATEGORIES;
  protected readonly priorities = PRIORITIES;
  protected readonly orderings = Object.keys(ORDERING_LABELS) as Ordering[];
  protected readonly years = academicYears();
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly categoryLabels = CATEGORY_LABELS;
  protected readonly priorityLabels = PRIORITY_LABELS;
  protected readonly orderingLabels = ORDERING_LABELS;

  protected readonly counts = signal<Record<Status | 'total', number> | null>(null);
  protected readonly result = signal<PageOf<Reclamation> | null>(null);
  protected readonly failed = signal(false);
  protected readonly page = signal(1);
  protected readonly totalPages = computed(() => Math.max(1, Math.ceil((this.result()?.count ?? 0) / PAGE_SIZE)));

  protected search = '';
  protected status: Status | '' = '';
  protected category: Category | '' = '';
  protected year = '';
  protected priority: Priority | '' = '';
  protected ordering: Ordering = '-created_at';

  constructor() {
    this.api.statusCounts().subscribe({ next: (counts) => this.counts.set(counts), error: () => undefined });
    this.load();
  }

  protected filtered(): boolean {
    return [this.search.trim(), this.status, this.category, this.year, this.priority].some((value) => value !== '');
  }

  protected apply(): void {
    this.page.set(1);
    this.load();
  }

  protected reset(): void {
    this.search = '';
    this.status = '';
    this.category = '';
    this.year = '';
    this.priority = '';
    this.apply();
  }

  protected goTo(page: number): void {
    this.page.set(page);
    this.load();
  }

  protected load(): void {
    this.failed.set(false);
    this.api
      .list({
        search: this.search,
        status: this.status || undefined,
        category: this.category || undefined,
        academic_year: this.year,
        priority: this.priority || undefined,
        ordering: this.ordering,
        page: this.page(),
      })
      .subscribe({
        next: (result) => this.result.set(result),
        error: () => {
          this.failed.set(true);
          this.result.set(null);
        },
      });
  }
}
