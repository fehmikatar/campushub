import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Icon } from '../../shared/icon/icon';
import { Icons } from '../../shared/icon/icons';
import { Course } from '../courses/course';
import { CoursesService } from '../courses/courses.service';
import { Category } from './forum.models';
import { ForumService } from './forum.service';

/** Écran 10 : accueil du forum. Les sujets sont par cours : on choisit d'abord un cours, puis une catégorie. */
@Component({
  selector: 'app-forum-home',
  imports: [Icon, RouterLink],
  templateUrl: './forum-home.html',
  styleUrl: './forum-home.scss',
})
export class ForumHome {
  private readonly courseApi = inject(CoursesService);
  private readonly forum = inject(ForumService);
  private readonly router = inject(Router);

  protected readonly icons = Icons;
  protected readonly courses = signal<Course[]>([]);
  protected readonly categories = signal<Category[]>([]);
  protected readonly selected = signal<Course | null>(null);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly query = signal('');

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.courseApi.list({ limit: 50 }).subscribe({
      next: (page) => {
        this.courses.set(page.data);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
    this.forum.categories().subscribe({
      next: (categories) => this.categories.set([...categories].sort((a, b) => a.order - b.order)),
      error: () => undefined,
    });
  }

  protected select(course: Course): void {
    this.selected.set(course);
  }

  protected openCourse(categoryId?: string): void {
    const course = this.selected();
    if (!course) {
      return;
    }
    const queryParams: Record<string, string> = {};
    if (categoryId) {
      queryParams['categoryId'] = categoryId;
    }
    if (this.query().trim()) {
      queryParams['q'] = this.query().trim();
    }
    void this.router.navigate(['/forum/cours', course.id], { queryParams });
  }

  protected onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }
}
