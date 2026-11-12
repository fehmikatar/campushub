import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ROLE_LABELS } from '../../core/auth/role';
import { Icon } from '../../shared/icon/icon';
import { Icons } from '../../shared/icon/icons';
import { timeAgo } from '../../shared/time-ago';
import { ForumCategory } from '../admin/forum-categories/forum-category';
import { ForumCategoriesService } from '../admin/forum-categories/forum-categories.service';
import { Course } from '../courses/course';
import { CoursesService } from '../courses/courses.service';
import { Paged, Topic } from './forum.model';
import { ForumService } from './forum.service';

type Tab = 'recent' | 'popular' | 'unanswered';

const PAGE_SIZE = 10;
const COURSE_KEY = 'campushub.forum.course';

/** Écrans 10 et 11 : forum d'un cours, avec catégories, recherche, tri et pagination. */
@Component({
  selector: 'app-forum-page',
  imports: [FormsModule, RouterLink, Icon],
  templateUrl: './forum-page.html',
  styleUrl: './forum-page.scss',
})
export class ForumPage {
  private readonly forum = inject(ForumService);
  private readonly coursesApi = inject(CoursesService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly icons = Icons;
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly courses = signal<Course[]>([]);
  protected readonly categories = signal<ForumCategory[]>([]);
  protected readonly coursesLoaded = signal(false);
  protected readonly coursesFailed = signal(false);
  protected readonly result = signal<Paged<Topic> | null>(null);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected readonly tab = signal<Tab>('recent');

  protected courseId = '';
  protected categoryId = '';
  protected resolved: '' | 'true' | 'false' = '';
  protected search = '';
  private page = 1;

  private readonly categoryNames = computed(() => new Map(this.categories().map((category) => [category._id, category.name])));

  /** « Populaires » et « Sans réponse » sont des vues calculées sur la page chargée (l'API ne les propose pas). */
  protected readonly shown = computed(() => {
    const items = this.result()?.items ?? [];
    switch (this.tab()) {
      case 'popular':
        return [...items].sort(
          (a, b) => Number(b.isPinned) - Number(a.isPinned) || b.repliesCount + b.viewsCount - (a.repliesCount + a.viewsCount),
        );
      case 'unanswered':
        return items.filter((topic) => topic.repliesCount === 0);
      default:
        return items;
    }
  });

  constructor() {
    const query = this.route.snapshot.queryParamMap;
    this.courseId = query.get('cours') ?? '';
    this.categoryId = query.get('categorie') ?? '';
    this.search = query.get('q') ?? '';
    this.page = Number(query.get('page')) || 1;

    inject(ForumCategoriesService).list().subscribe({
      next: (list) => this.categories.set([...list].sort((a, b) => a.order - b.order)),
      error: () => undefined,
    });
    this.coursesApi.list({ limit: 100 }).subscribe({
      next: ({ data }) => {
        this.courses.set(data);
        this.coursesLoaded.set(true);
        this.pickCourse(data);
      },
      error: () => {
        this.coursesFailed.set(true);
        this.coursesLoaded.set(true);
      },
    });
  }

  protected get totalPages(): number {
    return this.result()?.totalPages ?? 1;
  }

  protected currentPage(): number {
    return this.page;
  }

  protected categoryName(topic: Topic): string | null {
    return topic.categoryId ? (this.categoryNames().get(topic.categoryId) ?? null) : null;
  }

  protected ago(iso: string): string {
    return timeAgo(iso);
  }

  protected setTab(tab: Tab): void {
    this.tab.set(tab);
  }

  protected changeCourse(): void {
    this.page = 1;
    this.remember();
    this.load();
  }

  protected setCategory(id: string): void {
    this.categoryId = id;
    this.page = 1;
    this.load();
  }

  protected submitSearch(): void {
    this.page = 1;
    this.load();
  }

  protected resetFilters(): void {
    this.categoryId = '';
    this.resolved = '';
    this.search = '';
    this.page = 1;
    this.load();
  }

  protected get hasFilters(): boolean {
    return this.categoryId !== '' || this.resolved !== '' || this.search.trim() !== '';
  }

  protected goTo(page: number): void {
    this.page = page;
    this.load();
  }

  protected load(): void {
    if (!this.courseId) {
      return;
    }
    this.syncUrl();
    this.loading.set(true);
    this.failed.set(false);
    this.forum
      .listTopics(this.courseId, {
        categoryId: this.categoryId || undefined,
        q: this.search || undefined,
        resolved: this.resolved === '' ? undefined : this.resolved === 'true',
        page: this.page,
        limit: PAGE_SIZE,
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

  /** Cours de l'adresse, sinon le dernier consulté, sinon le premier de la liste. */
  private pickCourse(courses: Course[]): void {
    const known = (id: string) => courses.some((course) => String(course.id) === id);
    if (!known(this.courseId)) {
      const stored = this.readRemembered();
      this.courseId = stored && known(stored) ? stored : courses[0] ? String(courses[0].id) : '';
    }
    this.remember();
    this.load();
  }

  private syncUrl(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: {
        cours: this.courseId || null,
        categorie: this.categoryId || null,
        q: this.search.trim() || null,
        page: this.page > 1 ? this.page : null,
      },
    });
  }

  private remember(): void {
    try {
      if (this.courseId) {
        localStorage.setItem(COURSE_KEY, this.courseId);
      }
    } catch {
      // stockage indisponible : le cours n'est simplement pas mémorisé
    }
  }

  private readRemembered(): string | null {
    try {
      return localStorage.getItem(COURSE_KEY);
    } catch {
      return null;
    }
  }
}
