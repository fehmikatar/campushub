import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { CourseWorkspace } from './course-workspace';
import { CourseService } from './course.service';
import { COURSE_ACCESS_TOKEN } from './course-session';
import { Course } from './course.models';

describe('Course screens by role', () => {
  async function screen(role: string, view: string, owner = 'teacher-1') {
    const course: Course = {
      id: 1,
      titre: 'Angular',
      description: 'Cours',
      categorie: 'Developpement Web',
      statut: 'PUBLIE',
      formateurId: owner,
      imageUrl: null,
      chapitres: [
        {
          id: 2,
          coursId: 1,
          titre: 'Introduction',
          contenu: 'Bonjour',
          ordre: 1,
          visible: true,
          telechargementAutorise: false,
          pdfNom: 'cours.pdf',
          pdfTaille: 20,
        },
      ],
    };
    const api = {
      categories: () => of([]),
      get: () => of(course),
      list: vi.fn(() => of({ data: [course], total: 1 })),
      imageUrl: () => '',
      saveChapter: vi.fn(() => of({})),
      removeChapter: vi.fn(),
      uploadPdf: vi.fn(() => of({})),
    };
    const token =
      'header.' +
      btoa(JSON.stringify({ sub: 'teacher-1', realm_access: { roles: [role] } })) +
      '.signature';
    await TestBed.configureTestingModule({
      imports: [CourseWorkspace],
      providers: [
        provideRouter([
          { path: 'courses/:id/chapters/:chapterId', component: CourseWorkspace, data: { view } },
        ]),
        { provide: CourseService, useValue: api },
        { provide: COURSE_ACCESS_TOKEN, useValue: () => token },
      ],
    }).compileComponents();
    const harness = await RouterTestingHarness.create('/courses/1/chapters/2');
    const fixture = harness.fixture;
    await fixture.whenStable();
    harness.detectChanges();
    return {
      fixture,
      component: harness.routeDebugElement!.componentInstance as CourseWorkspace,
      api,
    };
  }
  it('hides course creation and editing controls from students', async () => {
    const { fixture } = await screen('ETUDIANT', 'catalogue');
    const text = fixture.nativeElement.textContent;
    expect(text).not.toContain('Créer un cours');
    expect(text).not.toContain('Modifier');
    expect(text).toContain('Angular');
  });
  it('hides PDF download when the student is only allowed to view it', async () => {
    const { fixture } = await screen('ETUDIANT', 'read');
    expect(fixture.nativeElement.textContent).toContain('Voir le PDF');
    expect(fixture.nativeElement.textContent).not.toContain('Télécharger');
  });
  it('saves chapter visibility and download permissions for the owner', async () => {
    const { component, api } = await screen('ENSEIGNANT', 'chapters');
    component.editChapter(component.chapters[0]);
    component.chapterForm.patchValue({
      titre: 'Titre modifié',
      visible: false,
      telechargementAutorise: true,
    });
    await component.saveChapter();
    expect(api.saveChapter).toHaveBeenCalledWith(1, 2, {
      titre: 'Titre modifié',
      contenu: 'Bonjour',
      visible: false,
      telechargementAutorise: true,
    });
  });
  it('refuses editing another teacher course even on a direct URL', async () => {
    const { component, fixture } = await screen('ENSEIGNANT', 'edit', 'other-teacher');
    expect(component.error()).toContain('propres cours');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });
  it('disables deletion of the last published chapter', async () => {
    const { fixture } = await screen('ENSEIGNANT', 'chapters');
    const buttons = [...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[];
    expect(buttons.find((b) => b.textContent?.trim() === 'Supprimer')?.disabled).toBe(true);
  });
  it('allows an admin to edit another teacher course', async () => {
    const { component, fixture } = await screen('ADMIN', 'edit', 'other-teacher');
    expect(component.writable).toBe(true);
    expect(component.error()).toBe('');
    expect(fixture.nativeElement.querySelector('form')).toBeTruthy();
  });
  it('lists all courses for admins without filtering by their own id', async () => {
    const { fixture, api } = await screen('ADMIN', 'mine', 'other-teacher');
    expect(api.list).toHaveBeenCalledWith({ page: 1, limit: 9 });
    expect(fixture.nativeElement.textContent).toContain('Gestion des cours');
    expect(fixture.nativeElement.textContent).toContain('Tous les cours du campus');
  });
  it('uploads a PDF at the 20 MiB boundary', async () => {
    const { component, api } = await screen('ENSEIGNANT', 'chapters');
    const file = new File([new Uint8Array(20 * 1024 * 1024)], 'large.pdf', { type: 'application/pdf' });
    await component.uploadPdf(component.chapters[0], { target: { files: [file] } } as unknown as Event);
    expect(api.uploadPdf).toHaveBeenCalledWith(1, 2, file);
    expect(component.error()).toBe('');
  });
  it('rejects a PDF above 20 MiB without uploading', async () => {
    const { component, api } = await screen('ENSEIGNANT', 'chapters');
    const file = new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'too-large.pdf', { type: 'application/pdf' });
    await component.uploadPdf(component.chapters[0], { target: { files: [file] } } as unknown as Event);
    expect(api.uploadPdf).not.toHaveBeenCalled();
    expect(component.error()).toContain('20 Mo');
  });
});
