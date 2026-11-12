import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { Course } from '../courses/course.models';
import { CourseService } from '../courses/course.service';
import { Enrollment } from './enrollment.model';
import { EnrollmentsService } from './enrollments.service';
import { MyEnrollments } from './my-enrollments';

const enrollment = (id: number, coursId: string, pourcentage: number): Enrollment => ({
  id,
  etudiant_id: 'student-1',
  cours_id: coursId,
  date_inscription: '2026-11-12',
  progression: { id, inscription: id, pourcentage },
});
const course = (id: number, titre: string) => ({ id, titre, categorie: 'Design', statut: 'PUBLIE', formateurId: 't', description: null, imageUrl: null }) as Course;

describe('MyEnrollments', () => {
  async function open(list: Enrollment[] | 'error', get: (id: number) => unknown = (id) => of(course(id, `Cours ${id}`))) {
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: EnrollmentsService, useValue: { list: () => (list === 'error' ? throwError(() => new HttpErrorResponse({ status: 500 })) : of(list)) } },
        { provide: CourseService, useValue: { get } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(MyEnrollments);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return Object.assign(fixture.nativeElement as HTMLElement, { fixture });
  }

  it("affiche l'état vide sans inscription", async () => {
    const html = await open([]);
    expect(html.textContent).toContain('Votre parcours commence ici');
    expect(html.querySelector('a[href="/catalogue"]')).toBeTruthy();
  });

  it('affiche les cours inscrits avec leur progression', async () => {
    const html = await open([enrollment(1, '1', 0), enrollment(2, '2', 40), enrollment(3, '3', 100)]);
    expect(html.querySelectorAll('article').length).toBe(3);
    expect(html.textContent).toContain('Cours 2');
    expect(html.textContent).toContain('40 %');
    expect(html.textContent).toContain('Commencer');
    expect(html.textContent).toContain('Continuer');
    expect(html.textContent).toContain('Revoir');
  });

  it('filtre les cours en cours et terminés', async () => {
    const html = await open([enrollment(1, '1', 10), enrollment(2, '2', 100)]);
    const tabs = html.querySelectorAll('.tabs button') as NodeListOf<HTMLButtonElement>;
    expect(tabs[1].textContent).toContain('En cours (1)');
    expect(tabs[2].textContent).toContain('Terminés (1)');
    tabs[2].click();
    html.fixture.detectChanges();
    expect(html.querySelectorAll('article').length).toBe(1);
    expect(html.textContent).toContain('Cours 2');
  });

  it("garde l'inscription d'un cours devenu illisible", async () => {
    const html = await open([enrollment(1, '9', 20)], () => throwError(() => new HttpErrorResponse({ status: 404 })));
    expect(html.textContent).toContain('Cours indisponible');
  });

  it("propose de réessayer quand le service d'inscriptions échoue", async () => {
    const html = await open('error');
    expect(html.textContent).toContain('Impossible de charger vos inscriptions');
  });
});
