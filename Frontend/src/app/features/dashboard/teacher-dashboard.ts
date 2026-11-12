import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { Icons } from '../../shared/icon/icons';
import { StatCard } from '../../shared/stat-card/stat-card';
import { Course, STATUS_LABELS, STATUS_TONES } from '../courses/course';
import { CoursesService } from '../courses/courses.service';
import { UnreadNotifications } from './unread-notifications';

const RECENT_COURSES = 5;

/**
 * Écran 32 : tableau de bord enseignant. Données réelles : mes cours (par statut) et mes notifications.
 * Pas d'inscriptions ni de suivi des questions du forum pour l'instant : ces indicateurs viendront avec leurs API.
 */
@Component({
  selector: 'app-teacher-dashboard',
  imports: [RouterLink, DatePipe, StatCard, UnreadNotifications],
  templateUrl: './teacher-dashboard.html',
  styleUrl: './dashboard.scss',
})
export class TeacherDashboard {
  private readonly coursesApi = inject(CoursesService);

  protected readonly icons = Icons;
  protected readonly labels = STATUS_LABELS;
  protected readonly tones = STATUS_TONES;
  protected readonly user = inject(AuthService).user;

  protected readonly courses = signal<Course[] | null>(null);
  protected readonly failed = signal(false);

  protected readonly counts = computed(() => {
    const list = this.courses();
    if (list === null) {
      return null;
    }
    const count = (status: Course['statut']) => list.filter((course) => course.statut === status).length;
    return { total: list.length, published: count('PUBLIE'), drafts: count('BROUILLON'), archived: count('ARCHIVE') };
  });

  protected readonly recent = computed(() =>
    [...(this.courses() ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, RECENT_COURSES),
  );

  constructor() {
    const id = this.user()?.id;
    this.coursesApi.list({ formateurId: id, limit: 100 }).subscribe({
      next: (page) => this.courses.set(page.data),
      error: () => this.failed.set(true),
    });
  }
}
