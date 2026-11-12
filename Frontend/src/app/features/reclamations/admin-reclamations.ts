import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Icon } from '../../shared/icon/icon';
import { Icons } from '../../shared/icon/icons';
import { StatCard } from '../../shared/stat-card/stat-card';
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
  Stats,
  Status,
  academicYears,
} from './reclamation.model';
import { ReclamationTable } from './reclamation-table';
import { ReclamationsService } from './reclamations.service';

const PAGE_SIZE = 20;
const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Couleurs des statuts (bleu, orange, vert, rouge). */
const STATUS_COLORS: Record<Status, string> = { new: '#3b82f6', in_progress: '#f59e0b', resolved: '#22c55e', rejected: '#ef4444' };

interface Segment {
  status: Status;
  label: string;
  count: number;
  color: string;
  dash: string;
  offset: number;
}

/** Écrans 5 et 7 : tableau de bord administrateur, statistiques réelles et file de travail. */
@Component({
  selector: 'app-admin-reclamations',
  imports: [FormsModule, Icon, StatCard, ReclamationTable],
  templateUrl: './admin-reclamations.html',
  styleUrl: './admin-reclamations.scss',
})
export class AdminReclamations {
  private readonly api = inject(ReclamationsService);

  protected readonly icons = Icons;
  protected readonly statuses = STATUSES;
  protected readonly categories = CATEGORIES;
  protected readonly priorities = PRIORITIES;
  protected readonly orderings: Ordering[] = ['-priority', '-created_at', 'created_at', '-updated_at'];
  protected readonly years = academicYears();
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly categoryLabels = CATEGORY_LABELS;
  protected readonly priorityLabels = PRIORITY_LABELS;
  protected readonly orderingLabels = ORDERING_LABELS;
  protected readonly colors = STATUS_COLORS;
  protected readonly radius = RADIUS;

  protected readonly stats = signal<Stats | null>(null);
  protected readonly statsFailed = signal(false);
  protected readonly result = signal<PageOf<Reclamation> | null>(null);
  protected readonly failed = signal(false);
  protected readonly page = signal(1);
  protected readonly totalPages = computed(() => Math.max(1, Math.ceil((this.result()?.count ?? 0) / PAGE_SIZE)));

  protected search = '';
  protected status: Status | '' = '';
  protected category: Category | '' = '';
  protected priority: Priority | '' = '';
  protected year = '';
  protected ordering: Ordering = '-priority';

  /** Anneau : un arc par statut (aucun si le total est nul). */
  protected readonly segments = computed<Segment[]>(() => {
    const stats = this.stats();
    if (!stats || stats.total === 0) {
      return [];
    }
    let offset = 0;
    return STATUSES.map((status) => {
      const count = stats.by_status[status] ?? 0;
      const length = (count / stats.total) * CIRCUMFERENCE;
      const segment = { status, label: STATUS_LABELS[status], count, color: STATUS_COLORS[status], dash: `${length} ${CIRCUMFERENCE - length}`, offset: -offset };
      offset += length;
      return segment;
    });
  });

  /** Barres par catégorie, du plus fréquent au moins fréquent. */
  protected readonly bars = computed(() => {
    const stats = this.stats();
    if (!stats) {
      return [];
    }
    const max = Math.max(1, ...CATEGORIES.map((category) => stats.by_category[category] ?? 0));
    return CATEGORIES.map((category) => ({
      category,
      label: CATEGORY_LABELS[category],
      count: stats.by_category[category] ?? 0,
      width: ((stats.by_category[category] ?? 0) / max) * 100,
    })).sort((a, b) => b.count - a.count);
  });

  constructor() {
    this.loadStats();
    this.load();
  }

  protected circumference = CIRCUMFERENCE;

  protected loadStats(): void {
    this.statsFailed.set(false);
    this.api.stats(this.year || undefined).subscribe({
      next: (stats) => this.stats.set(stats),
      error: () => this.statsFailed.set(true),
    });
  }

  protected changeYear(): void {
    this.loadStats();
    this.apply();
  }

  protected filtered(): boolean {
    return [this.search.trim(), this.status, this.category, this.priority].some((value) => value !== '');
  }

  protected apply(): void {
    this.page.set(1);
    this.load();
  }

  protected reset(): void {
    this.search = '';
    this.status = '';
    this.category = '';
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
        priority: this.priority || undefined,
        academic_year: this.year,
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
