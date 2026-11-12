import { Component, DestroyRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { CourseService } from './course.service';
import { CourseSession } from './course-session';
import { errorMessage } from '../../core/http/error-message';
import { Enrollment, percentOf, percentRead } from '../enrollments/enrollment.model';
import { MyEnrollments } from '../enrollments/my-enrollments';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { Chapter, Course } from './course.models';

@Component({
  selector: 'app-course-workspace',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, MyEnrollments],
  templateUrl: './course-workspace.html',
  styleUrl: './course-workspace.scss',
})
export class CourseWorkspace {
  readonly api = inject(CourseService);
  readonly session = inject(CourseSession);
  private enrollments = inject(EnrollmentsService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private fb = inject(FormBuilder);
  private destroyRef = inject(DestroyRef);
  readonly view = signal('catalogue');
  readonly courses = signal<Course[]>([]);
  readonly course = signal<Course | null>(null);
  readonly categories = signal<string[]>([]);
  readonly busy = signal(false);
  /** Inscription de l'étudiant au cours affiché (null : pas inscrit). */
  readonly enrollment = signal<Enrollment | null>(null);
  /** Le service d'inscriptions ne répond pas : « S'inscrire » est désactivé avec un message. */
  readonly enrollmentUnavailable = signal(false);
  readonly enrolling = signal(false);
  readonly confirmingCancel = signal(false);
  readonly enrollmentError = signal('');
  readonly error = signal('');
  readonly notice = signal('');
  readonly total = signal(0);
  readonly page = signal(1);
  readonly chapterId = signal<number | null>(null);
  readonly editChapterId = signal<number | null>(null);
  readonly imagePreview = signal('');
  private imageFile: File | null = null;
  private editingId: number | null = null;
  private dragId: number | null = null;
  readonly limit = 9;
  readonly filters = this.fb.nonNullable.group({ search: '', categorie: '', statut: '' });
  readonly form = this.fb.nonNullable.group({
    titre: ['', [Validators.required, Validators.maxLength(150)]],
    description: ['', Validators.maxLength(2000)],
    categorie: '',
  });
  readonly chapterForm = this.fb.nonNullable.group({
    titre: ['', [Validators.required, Validators.maxLength(150)]],
    contenu: '',
    visible: false,
    telechargementAutorise: true,
  });
  get title() {
    return (
      {
        catalogue: 'Catalogue des cours',
        mine: this.session.user.role === 'ADMIN' ? 'Gestion des cours' : 'Mes cours',
        detail: 'Explorer un cours',
        edit: this.editingId ? 'Modifier le cours' : 'Créer un cours',
        chapters: 'Gestion des chapitres',
        read: 'Lecture du chapitre',
      } as Record<string, string>
    )[this.view()];
  }
  get chapters() {
    return this.course()?.chapitres ?? [];
  }
  get currentChapter() {
    return this.chapters.find((c) => c.id === this.chapterId());
  }
  get writable() {
    const c = this.course();
    return !!c && this.session.canEdit(c);
  }
  get lastPage() {
    return Math.max(1, Math.ceil(this.total() / this.limit));
  }
  constructor() {
    this.route.url.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      void this.initialize();
    });
    this.destroyRef.onDestroy(() => this.releasePreview());
  }
  private async initialize() {
    this.view.set(this.route.snapshot.data['view']);
    this.page.set(1);
    this.course.set(null);
    this.enrollment.set(null);
    this.enrollmentUnavailable.set(false);
    this.confirmingCancel.set(false);
    this.enrollmentError.set('');
    this.editingId = null;
    this.editChapterId.set(null);
    this.imageFile = null;
    this.releasePreview();
    this.form.reset();
    this.chapterForm.reset();
    this.error.set('');
    this.notice.set('');
    this.chapterId.set(Number(this.route.snapshot.paramMap.get('chapterId')) || null);
    if (!this.session.token()) {
      this.error.set('Connectez-vous ? CampusHub pour accéder aux cours.');
      return;
    }
    if (!this.session.user.role) {
      this.error.set('Accès refusé : aucun rôle CampusHub dans votre session.');
      return;
    }
    await this.perform(async () => {
      this.categories.set(await firstValueFrom(this.api.categories()));
      if (this.view() === 'catalogue' || this.view() === 'mine') {
        await this.fetchList();
        return;
      }
      const id = Number(this.route.snapshot.paramMap.get('id'));
      if (!id) {
        if (!this.session.canTeach)
          throw new Error('Accès réservé aux enseignants et administrateurs.');
        return;
      }
      const course = await firstValueFrom(this.api.get(id));
      this.course.set(course);
      if (this.view() === 'detail') await this.loadEnrollment(course);
      if (['edit', 'chapters'].includes(this.view()) && !this.session.canEdit(course))
        throw new Error('Vous ne pouvez modifier que vos propres cours.');
      if (this.view() === 'edit') {
        this.editingId = id;
        this.form.patchValue({
          titre: course.titre,
          description: course.description ?? '',
          categorie: course.categorie ?? '',
        });
        this.imagePreview.set(this.api.imageUrl(course.imageUrl));
      }
      if (this.view() === 'read' && !this.currentChapter) throw new Error('Chapitre introuvable.');
      if (this.view() === 'read') void this.trackProgress(course);
    });
  }
  get isStudent() {
    return this.session.user.role === 'ETUDIANT';
  }
  /** L'étudiant peut s'inscrire à un cours publié. */
  get canEnroll() {
    return this.isStudent && this.course()?.statut === 'PUBLIE';
  }
  /** Charge l'inscription de l'étudiant à ce cours ; une panne du service n'empêche pas d'afficher le cours. */
  private async loadEnrollment(course: Course) {
    if (!this.isStudent) return;
    try {
      const list = await firstValueFrom(this.enrollments.list({ coursId: course.id }));
      this.enrollment.set(list.find((item) => item.cours_id === `${course.id}`) ?? null);
    } catch {
      this.enrollmentUnavailable.set(true);
    }
  }
  /**
   * Progression à la lecture : atteindre le chapitre n sur N (chapitres visibles) vaut n/N. Elle ne recule jamais,
   * et rien n'est enregistré si l'étudiant n'est pas inscrit ou si le service ne répond pas.
   */
  private async trackProgress(course: Course) {
    if (!this.isStudent) return;
    try {
      const mine = (await firstValueFrom(this.enrollments.list({ coursId: course.id }))).find((item) => item.cours_id === `${course.id}`);
      const index = this.chapters.findIndex((chapter) => chapter.id === this.chapterId());
      if (!mine || index < 0) return;
      const target = percentRead(index + 1, this.chapters.length);
      if (target > percentOf(mine)) {
        await firstValueFrom(this.enrollments.setProgress(mine.id, target));
      }
    } catch {
      /* le suivi de progression est secondaire : la lecture continue */
    }
  }
  async enroll() {
    const course = this.course();
    if (!course || this.enrolling()) return;
    this.enrolling.set(true);
    this.enrollmentError.set('');
    try {
      this.enrollment.set(await firstValueFrom(this.enrollments.enroll(course.id)));
      this.notice.set('Inscription confirmée.');
    } catch (error) {
      const e = error as HttpErrorResponse;
      if (e.status === 400) {
        // « Déjà inscrit » : on recharge pour afficher l'état réel.
        await this.loadEnrollment(course);
      }
      this.enrollmentError.set(errorMessage(error, 'Inscription impossible pour le moment.'));
    } finally {
      this.enrolling.set(false);
    }
  }
  async cancelEnrollment() {
    const current = this.enrollment();
    if (!current || this.enrolling()) return;
    this.enrolling.set(true);
    this.enrollmentError.set('');
    try {
      await firstValueFrom(this.enrollments.cancel(current.id));
      this.enrollment.set(null);
      this.confirmingCancel.set(false);
      this.notice.set('Inscription annulée.');
    } catch (error) {
      this.enrollmentError.set(errorMessage(error, "Impossible d'annuler l'inscription."));
    } finally {
      this.enrolling.set(false);
    }
  }
  async reload() {
    await this.initialize();
  }
  async search() {
    this.page.set(1);
    await this.perform(() => this.fetchList());
  }
  async paginate(delta: number) {
    this.page.update((n) => Math.max(1, Math.min(this.lastPage, n + delta)));
    await this.perform(() => this.fetchList());
  }
  private async fetchList() {
    if (this.view() === 'mine' && !this.session.canTeach) {
      this.courses.set([]);
      this.total.set(0);
      return;
    }
    const query: Record<string, string | number> = { page: this.page(), limit: this.limit };
    Object.entries(this.filters.getRawValue()).forEach(([key, value]) => {
      if (value) query[key] = value;
    });
    if (this.view() === 'mine' && this.session.user.role !== 'ADMIN')
      query['formateurId'] = this.session.user.id;
    const result = await firstValueFrom(this.api.list(query));
    this.courses.set(result.data);
    this.total.set(result.total);
  }
  async perform(task: () => Promise<void>) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await task();
    } catch (error) {
      const e = error as HttpErrorResponse;
      const message = e.error?.message;
      this.error.set(
        e.status === 401
          ? 'Session expirée. Reconnectez-vous ? CampusHub.'
          : e.status === 403
            ? 'Vous n’avez pas le droit d’effectuer cette action.'
            : e.status === 404
              ? 'Cours, chapitre ou fichier introuvable.'
              : e.status === 503 || e.status === 0
                ? 'Service momentanément indisponible. Réessayez dans un instant.'
                : Array.isArray(message)
                  ? message.join(' ? ')
                  : message || e.message || 'Une erreur est survenue.',
      );
    } finally {
      this.busy.set(false);
    }
  }
  async saveCourse() {
    this.form.markAllAsTouched();
    if (
      this.form.invalid ||
      !this.form.getRawValue().titre.trim() ||
      !this.session.canTeach ||
      (this.course() && !this.writable)
    )
      return;
    await this.perform(async () => {
      const values = this.form.getRawValue();
      const course = await firstValueFrom(
        this.api.save(this.editingId, {
          titre: values.titre.trim(),
          description: values.description,
          ...(values.categorie ? { categorie: values.categorie } : {}),
        }),
      );
      this.editingId = course.id;
      this.course.set(course);
      if (this.imageFile) {
        await firstValueFrom(this.api.image(course.id, this.imageFile));
        this.imageFile = null;
      }
      await this.router.navigate(['/courses', course.id, 'chapters']);
    });
  }
  chooseImage(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 1024 * 1024) {
      this.error.set('Choisissez une image JPG, PNG ou WebP de 1 Mo maximum.');
      return;
    }
    this.releasePreview();
    this.imageFile = file;
    this.imagePreview.set(URL.createObjectURL(file));
  }
  private releasePreview() {
    if (this.imagePreview().startsWith('blob:')) URL.revokeObjectURL(this.imagePreview());
    this.imagePreview.set('');
  }
  async removeImage() {
    const c = this.course();
    if (!c || !this.writable) {
      this.imageFile = null;
      this.releasePreview();
      return;
    }
    await this.perform(async () => {
      this.course.set(await firstValueFrom(this.api.removeImage(c.id)));
      this.imageFile = null;
      this.releasePreview();
    });
  }
  async courseAction(c: Course, action: 'publish' | 'archive' | 'delete') {
    if (
      !this.session.canEdit(c) ||
      !window.confirm(
        `${action === 'publish' ? 'Publier' : action === 'archive' ? 'Archiver' : 'Supprimer définitivement'} ? ${c.titre} ? ?`,
      )
    )
      return;
    await this.perform(async () => {
      if (action === 'delete') await firstValueFrom(this.api.remove(c.id));
      else await firstValueFrom(this.api.action(c.id, action));
      await this.fetchList();
      this.notice.set('Le cours a été mis ? jour.');
    });
  }
  editChapter(chapter?: Chapter) {
    this.editChapterId.set(chapter?.id ?? null);
    this.chapterForm.reset({
      titre: chapter?.titre ?? '',
      contenu: chapter?.contenu ?? '',
      visible: chapter?.visible ?? false,
      telechargementAutorise: chapter?.telechargementAutorise ?? true,
    });
  }
  private async refreshCourse() {
    const c = this.course();
    if (c) this.course.set(await firstValueFrom(this.api.get(c.id)));
  }
  async saveChapter() {
    const c = this.course();
    this.chapterForm.markAllAsTouched();
    if (
      !c ||
      !this.writable ||
      this.chapterForm.invalid ||
      !this.chapterForm.getRawValue().titre.trim()
    )
      return;
    await this.perform(async () => {
      const data = this.chapterForm.getRawValue();
      await firstValueFrom(
        this.api.saveChapter(c.id, this.editChapterId(), { ...data, titre: data.titre.trim() }),
      );
      await this.refreshCourse();
      this.editChapter();
      this.notice.set('Chapitre enregistré.');
    });
  }
  async deleteChapter(chapter: Chapter) {
    const c = this.course();
    if (!c || !this.writable || !window.confirm(`Supprimer ? ${chapter.titre} ? ?`)) return;
    await this.perform(async () => {
      await firstValueFrom(this.api.removeChapter(c.id, chapter.id));
      await this.refreshCourse();
      if (this.editChapterId() === chapter.id) this.editChapter();
    });
  }
  startDrag(id: number) {
    this.dragId = id;
  }
  async drop(event: DragEvent, targetId: number) {
    event.preventDefault();
    const sourceId = this.dragId;
    this.dragId = null;
    if (!sourceId || sourceId === targetId) return;
    await this.reorder(
      sourceId,
      this.chapters.findIndex((c) => c.id === targetId),
    );
  }
  async move(chapter: Chapter, offset: number) {
    await this.reorder(chapter.id, this.chapters.findIndex((c) => c.id === chapter.id) + offset);
  }
  private async reorder(sourceId: number, target: number) {
    const course = this.course();
    if (!course || !this.writable || target < 0 || target >= this.chapters.length) return;
    const ids = this.chapters.map((c) => c.id);
    const [id] = ids.splice(ids.indexOf(sourceId), 1);
    ids.splice(target, 0, id);
    await this.perform(async () => {
      await firstValueFrom(this.api.reorder(course.id, ids));
      await this.refreshCourse();
    });
  }
  async uploadPdf(chapter: Chapter, event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    const c = this.course();
    if (!file || !c || !this.writable) return;
    if (file.type !== 'application/pdf' || file.size > 20 * 1024 * 1024) {
      this.error.set('Choisissez un PDF de 20 Mo maximum.');
      return;
    }
    await this.perform(async () => {
      await firstValueFrom(this.api.uploadPdf(c.id, chapter.id, file));
      await this.refreshCourse();
    });
  }
  async removePdf(chapter: Chapter) {
    const c = this.course();
    if (!c || !this.writable || !window.confirm('Retirer ce PDF ?')) return;
    await this.perform(async () => {
      await firstValueFrom(this.api.removePdf(c.id, chapter.id));
      await this.refreshCourse();
    });
  }
  async openPdf(chapter: Chapter, download: boolean) {
    const c = this.course();
    if (!c) return;
    await this.perform(async () => {
      const file = await firstValueFrom(this.api.pdf(c.id, chapter.id, download));
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      if (download) link.download = chapter.pdfNom ?? 'chapitre.pdf';
      else {
        link.target = '_blank';
        link.rel = 'noopener';
      }
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    });
  }
  label(status: string) {
    return (
      ({ BROUILLON: 'Brouillon', PUBLIE: 'Publié', ARCHIVE: 'Archivé' } as Record<string, string>)[
        status
      ] || status
    );
  }
}
