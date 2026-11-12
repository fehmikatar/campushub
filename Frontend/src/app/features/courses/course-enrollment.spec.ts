import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, throwError } from 'rxjs';
import { Enrollment } from '../enrollments/enrollment.model';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { CourseWorkspace } from './course-workspace';
import { CourseService } from './course.service';
import { COURSE_ACCESS_TOKEN } from './course-session';
import { Course } from './course.models';

const enrollment = (over: Partial<Enrollment> = {}): Enrollment => ({
  id: 9,
  etudiant_id: 'student-1',
  cours_id: '1',
  date_inscription: '2026-11-12',
  progression: { id: 1, inscription: 9, pourcentage: 0 },
  ...over,
});

describe("Inscription depuis le détail d'un cours", () => {
  async function screen(role: string, enrollments: Partial<EnrollmentsService>, statut = 'PUBLIE') {
    const course = { id: 1, titre: 'Angular', description: 'Cours', categorie: 'Design', statut, formateurId: 'teacher-1', imageUrl: null, chapitres: [] } as Course;
    const api = { categories: () => of([]), get: () => of(course), list: vi.fn(() => of({ data: [course], total: 1 })), imageUrl: () => '' };
    const token = 'header.' + btoa(JSON.stringify({ sub: 'student-1', realm_access: { roles: [role] } })) + '.signature';
    await TestBed.configureTestingModule({
      imports: [CourseWorkspace],
      providers: [
        provideRouter([{ path: 'courses/:id', component: CourseWorkspace, data: { view: 'detail' } }]),
        { provide: CourseService, useValue: api },
        { provide: EnrollmentsService, useValue: enrollments },
        { provide: COURSE_ACCESS_TOKEN, useValue: () => token },
      ],
    }).compileComponents();
    const harness = await RouterTestingHarness.create('/courses/1');
    await harness.fixture.whenStable();
    harness.detectChanges();
    return { harness, text: () => (harness.routeNativeElement as HTMLElement).textContent ?? '', root: harness.routeNativeElement as HTMLElement };
  }

  const button = (root: HTMLElement, label: string) =>
    [...root.querySelectorAll('button')].find((b) => b.textContent?.includes(label)) as HTMLButtonElement | undefined;

  it("propose « S'inscrire » à un étudiant non inscrit, puis confirme l'inscription", async () => {
    const enroll = vi.fn(() => of(enrollment()));
    const { harness, root, text } = await screen('ETUDIANT', { list: vi.fn(() => of([])), enroll });

    button(root, 'S’inscrire')!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(enroll).toHaveBeenCalledWith(1);
    expect(text()).toContain('Inscription confirmée');
    expect(button(root, 'Se désinscrire')).toBeTruthy();
  });

  it("affiche l'état « inscrit » et demande confirmation avant d'annuler", async () => {
    const cancel = vi.fn(() => of(undefined));
    const { harness, root, text } = await screen('ETUDIANT', { list: vi.fn(() => of([enrollment()])), cancel });

    expect(text()).toContain('Vous êtes inscrit à ce cours depuis le 12/11/2026');
    button(root, 'Se désinscrire')!.click();
    harness.detectChanges();
    expect(cancel).not.toHaveBeenCalled();

    button(root, 'Confirmer l’annulation')!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(cancel).toHaveBeenCalledWith(9);
    expect(button(root, 'S’inscrire')).toBeTruthy();
  });

  it('affiche le message du service quand l’inscription échoue', async () => {
    const enroll = vi.fn(() => throwError(() => new HttpErrorResponse({ status: 400, error: { detail: 'Déjà inscrit à ce cours.' } })));
    const list = vi.fn().mockReturnValueOnce(of([])).mockReturnValue(of([enrollment()]));
    const { harness, root, text } = await screen('ETUDIANT', { list, enroll });

    button(root, 'S’inscrire')!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(text()).toContain('Déjà inscrit à ce cours.');
    expect(button(root, 'Se désinscrire')).toBeTruthy();
  });

  it('désactive le bouton si le service est indisponible', async () => {
    const { root, text } = await screen('ETUDIANT', { list: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 503 }))) });
    expect(button(root, 'S’inscrire')!.disabled).toBe(true);
    expect(text()).toContain('momentanément indisponible');
  });

  it('ne propose pas l’inscription à un enseignant', async () => {
    const list = vi.fn();
    const { root, text } = await screen('ENSEIGNANT', { list });
    expect(list).not.toHaveBeenCalled();
    expect(button(root, 'S’inscrire')).toBeUndefined();
    expect(text()).toContain('Seuls les étudiants peuvent');
  });
});

describe('Progression à la lecture des chapitres', () => {
  async function read(enrollments: Partial<EnrollmentsService>, role = 'ETUDIANT') {
    const chapters = [1, 2, 3].map((id) => ({ id, coursId: 1, titre: `Chapitre ${id}`, contenu: 'Texte', ordre: id, visible: true, telechargementAutorise: false, pdfNom: null, pdfTaille: null }));
    const course = { id: 1, titre: 'Angular', description: '', categorie: 'Design', statut: 'PUBLIE', formateurId: 'teacher-1', imageUrl: null, chapitres: chapters } as Course;
    const api = { categories: () => of([]), get: () => of(course), imageUrl: () => '' };
    const token = 'header.' + btoa(JSON.stringify({ sub: 'student-1', realm_access: { roles: [role] } })) + '.signature';
    await TestBed.configureTestingModule({
      imports: [CourseWorkspace],
      providers: [
        provideRouter([{ path: 'courses/:id/chapters/:chapterId', component: CourseWorkspace, data: { view: 'read' } }]),
        { provide: CourseService, useValue: api },
        { provide: EnrollmentsService, useValue: enrollments },
        { provide: COURSE_ACCESS_TOKEN, useValue: () => token },
      ],
    }).compileComponents();
    const harness = await RouterTestingHarness.create('/courses/1/chapters/2');
    await harness.fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
  }

  it('enregistre la progression en atteignant le chapitre 2 sur 3', async () => {
    const setProgress = vi.fn(() => of({ id: 1, inscription: 9, pourcentage: 67 }));
    await read({ list: vi.fn(() => of([enrollment()])), setProgress });
    expect(setProgress).toHaveBeenCalledWith(9, 67);
  });

  it('ne fait jamais reculer la progression', async () => {
    const setProgress = vi.fn();
    await read({ list: vi.fn(() => of([enrollment({ progression: { id: 1, inscription: 9, pourcentage: 100 } })])), setProgress });
    expect(setProgress).not.toHaveBeenCalled();
  });

  it("n'enregistre rien sans inscription ni pour un enseignant", async () => {
    const setProgress = vi.fn();
    await read({ list: vi.fn(() => of([])), setProgress });
    await TestBed.resetTestingModule();
    await read({ list: vi.fn(), setProgress }, 'ENSEIGNANT');
    expect(setProgress).not.toHaveBeenCalled();
  });
});
