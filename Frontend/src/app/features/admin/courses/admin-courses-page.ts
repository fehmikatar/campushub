import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { errorMessage } from '../../../core/http/error-message';
import { ToastService } from '../../../core/toast/toast.service';
import { ConfirmDialog } from '../../../shared/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/icon/icon';
import { Icons } from '../../../shared/icon/icons';
import {
  Course,
  CoursePage,
  CourseStatus,
  STATUS_LABELS,
  STATUS_TONES,
} from '../../courses/course';
import { CoursesService } from '../../courses/courses.service';

const PAGE_SIZE = 10;

/** Administrateur : tous les cours, avec publication, archivage et suppression. */
@Component({
  selector: 'app-admin-courses-page',
  imports: [FormsModule, DatePipe, Icon, ConfirmDialog, RouterLink],
  templateUrl: './admin-courses-page.html',
  styleUrl: './admin-courses-page.scss',
})
export class AdminCoursesPage {
  private readonly api = inject(CoursesService);
  private readonly toast = inject(ToastService);

  protected readonly icons = Icons;
  protected readonly labels = STATUS_LABELS;
  protected readonly tones = STATUS_TONES;
  protected readonly statuses: CourseStatus[] = ['BROUILLON', 'PUBLIE', 'ARCHIVE'];

  protected readonly result = signal<CoursePage | null>(null);
  protected readonly categories = signal<string[]>([]);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly toDelete = signal<Course | null>(null);
  protected readonly busy = signal(false);

  protected statut: CourseStatus | '' = '';
  protected categorie = '';
  private page = 1;

  constructor() {
    this.api
      .categories()
      .subscribe({ next: (list) => this.categories.set(list), error: () => undefined });
    this.load();
  }

  protected get totalPages(): number {
    const total = this.result()?.total ?? 0;
    return Math.max(1, Math.ceil(total / PAGE_SIZE));
  }

  protected currentPage(): number {
    return this.page;
  }

  protected filter(): void {
    this.page = 1;
    this.load();
  }

  protected goTo(page: number): void {
    this.page = page;
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.api
      .list({
        statut: this.statut || undefined,
        categorie: this.categorie || undefined,
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

  protected canPublish(course: Course): boolean {
    return course.statut !== 'PUBLIE' && course.nbChapitres > 0;
  }

  protected publishTitle(course: Course): string {
    if (course.statut === 'PUBLIE') {
      return 'Ce cours est déjà publié';
    }
    if (course.nbChapitres === 0) {
      return 'Ajoutez au moins un chapitre pour publier ce cours';
    }
    return course.statut === 'ARCHIVE' ? 'Republier' : 'Publier';
  }

  protected publish(course: Course): void {
    this.run(this.api.publish(course.id), 'Cours publié.');
  }

  protected archive(course: Course): void {
    this.run(this.api.archive(course.id), 'Cours archivé.');
  }

  protected confirmDelete(): void {
    const course = this.toDelete();
    if (!course) {
      return;
    }
    this.busy.set(true);
    this.api.remove(course.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.toDelete.set(null);
        this.toast.success('Cours supprimé.');
        // La dernière ligne d'une page retire cette page.
        if ((this.result()?.data.length ?? 0) <= 1 && this.page > 1) {
          this.page -= 1;
        }
        this.load();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.toDelete.set(null);
        this.toast.error(errorMessage(error));
      },
    });
  }

  protected shortId(id: string): string {
    return id.slice(0, 8);
  }

  private run(request: ReturnType<CoursesService['publish']>, success: string): void {
    this.busy.set(true);
    request.subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.success(success);
        this.load();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.toast.error(errorMessage(error));
      },
    });
  }
}
