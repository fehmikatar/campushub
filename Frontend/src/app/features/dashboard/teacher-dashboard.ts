import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { Icons } from '../../shared/icon/icons';
import { StatCard } from '../../shared/stat-card/stat-card';
import { Course, STATUS_LABELS, STATUS_TONES } from '../courses/course';
import { CoursesService } from '../courses/courses.service';
import { Enrollment } from '../enrollments/enrollment.model';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { UnreadNotifications } from './unread-notifications';

const RECENT_COURSES = 5;

/**
 * Écran 32 : tableau de bord enseignant. Données réelles : mes cours (par statut), les inscrits à mes cours et mes
 * notifications. Pas de suivi des questions du forum pour l'instant : cet indicateur viendra avec son API.
 */
@Component({
  selector: 'app-teacher-dashboard',
  imports: [RouterLink, DatePipe, StatCard, UnreadNotifications],
  templateUrl: './teacher-dashboard.html',
  styleUrl: './dashboard.scss',
})
export class TeacherDashboard {
  private readonly coursesApi = inject(CoursesService);
  private readonly enrollmentsApi = inject(EnrollmentsService);

  protected readonly icons = Icons;
  protected readonly labels = STATUS_LABELS;
  protected readonly tones = STATUS_TONES;
  protected readonly user = inject(AuthService).user;

  protected readonly courses = signal<Course[] | null>(null);
  protected readonly failed = signal(false);
  /** Inscriptions de tous les cours (le service ne filtre pas l'enseignant) ; on ne garde que celles de ses cours. */
  protected readonly enrollments = signal<Enrollment[] | null>(null);
  protected readonly enrollmentsFailed = signal(false);

  protected readonly counts = computed(() => {
    const list = this.courses();
    if (list === null) {
      return null;
    }
    const count = (status: Course['statut']) => list.filter((course) => course.statut === status).length;
    return { total: list.length, published: count('PUBLIE'), drafts: count('BROUILLON'), archived: count('ARCHIVE') };
  });

  private readonly mine = computed(() => {
    const ids = new Set((this.courses() ?? []).map((course) => `${course.id}`));
    return (this.enrollments() ?? []).filter((item) => ids.has(item.cours_id));
  });
  /** Nombre d'étudiants distincts inscrits à au moins un de mes cours (null tant que tout n'est pas chargé). */
  protected readonly students = computed(() =>
    this.courses() === null || this.enrollments() === null ? null : new Set(this.mine().map((item) => item.etudiant_id)).size,
  );
  private readonly perCourse = computed(() => {
    const counts = new Map<string, number>();
    for (const item of this.mine()) {
      counts.set(item.cours_id, (counts.get(item.cours_id) ?? 0) + 1);
    }
    return counts;
  });

  protected enrolledIn(course: Course): number {
    return this.perCourse().get(`${course.id}`) ?? 0;
  }

  protected readonly recent = computed(() =>
    [...(this.courses() ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, RECENT_COURSES),
  );

  constructor() {
    const id = this.user()?.id;
    this.coursesApi.list({ formateurId: id, limit: 100 }).subscribe({
      next: (page) => this.courses.set(page.data),
      error: () => this.failed.set(true),
    });
    this.enrollmentsApi.list().subscribe({
      next: (list) => this.enrollments.set(list),
      error: () => this.enrollmentsFailed.set(true),
    });
  }
}
