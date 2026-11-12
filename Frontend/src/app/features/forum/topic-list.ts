import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Icon } from '../../shared/icon/icon';
import { Icons } from '../../shared/icon/icons';
import { timeAgo } from '../../shared/time-ago';
import { CoursesService } from '../courses/courses.service';
import { ForumAuthor } from './forum-author';
import { TAB_LABELS, TopicTab, applyTab } from './forum-tabs';
import { Category, Page, Topic } from './forum.models';
import { ForumService } from './forum.service';

/** Écran 11 : liste des sujets d'un cours. */
@Component({
  selector: 'app-topic-list',
  imports: [Icon, RouterLink, ForumAuthor],
  templateUrl: './topic-list.html',
  styleUrl: './topic-list.scss',
})
export class TopicList {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly forum = inject(ForumService);
  private readonly courseApi = inject(CoursesService);

  protected readonly icons = Icons;
  protected readonly tabs = Object.keys(TAB_LABELS) as TopicTab[];
  protected readonly labels = TAB_LABELS;
  protected readonly courseId = signal(0);
  protected readonly courseTitle = signal('');
  protected readonly categories = signal<Category[]>([]);
  protected readonly categoryId = signal<string | null>(null);
  protected readonly query = signal('');
  protected readonly tab = signal<TopicTab>('recent');
  protected readonly result = signal<Page<Topic> | null>(null);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly topics = computed(() => applyTab(this.result()?.items ?? [], this.tab()));
  protected readonly hasFilters = computed(
    () => this.query() !== '' || this.categoryId() !== null || this.tab() !== 'recent',
  );
  private page = 1;

  constructor() {
    this.forum.categories().subscribe({
      next: (list) => this.categories.set([...list].sort((a, b) => a.order - b.order)),
      error: () => undefined,
    });
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.courseId.set(Number(params.get('courseId')));
      this.loadCourseTitle();
    });
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.categoryId.set(params.get('categoryId'));
      this.query.set(params.get('q') ?? '');
      this.page = 1;
      this.load();
    });
  }

  protected ago(iso: string): string {
    return timeAgo(iso);
  }

  protected setTab(tab: TopicTab): void {
    this.tab.set(tab);
  }

  protected setCategory(id: string | null): void {
    this.navigate({ categoryId: id });
  }

  protected search(event: Event): void {
    const value = (event.target as HTMLInputElement).value.trim();
    this.navigate({ q: value || null });
  }

  protected reset(): void {
    this.tab.set('recent');
    this.navigate({ categoryId: null, q: null });
  }

  protected goTo(page: number): void {
    this.page = page;
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.forum
      .topics(this.courseId(), {
        categoryId: this.categoryId() ?? undefined,
        q: this.query() || undefined,
        page: this.page,
      })
      .subscribe({
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

  private navigate(changes: Record<string, string | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: changes,
      queryParamsHandling: 'merge',
    });
  }

  private loadCourseTitle(): void {
    this.courseApi.list({ limit: 50 }).subscribe({
      next: (page) => this.courseTitle.set(page.data.find((c) => c.id === this.courseId())?.titre ?? ''),
      error: () => undefined,
    });
  }
}
