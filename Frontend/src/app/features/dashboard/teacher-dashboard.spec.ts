import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { TeacherDashboard } from './teacher-dashboard';

const API = 'http://localhost:8080/api/v1';
const course = (id: number, titre: string, statut: string, updatedAt: string) => ({
  id, titre, categorie: 'Design', statut, nbChapitres: 2, createdAt: updatedAt, updatedAt,
});
const empty = { data: [], current_page: 1, last_page: 1, per_page: 3, total: 0 };

describe('TeacherDashboard', () => {
  let http: HttpTestingController;

  const open = (courses: object[] | 'error', enrolled: object[] | 'error' = []) => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { user: signal({ id: 't1', prenom: 'Sonia', nom: 'B', email: '', role: 'ENSEIGNANT' }) } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(TeacherDashboard);

    const list = http.expectOne((r) => r.url === `${API}/courses`);
    expect(list.request.params.get('formateurId')).toBe('t1');
    courses === 'error'
      ? list.flush({}, { status: 503, statusText: 'x' })
      : list.flush({ data: courses, total: courses.length, page: 1, limit: 100 });
    const enrollments = http.expectOne((r) => r.url === `${API}/enrollments/`);
    enrolled === 'error' ? enrollments.flush({}, { status: 503, statusText: 'x' }) : enrollments.flush(enrolled);
    http.expectOne((r) => r.url === `${API}/notifications`).flush(empty);
    fixture.detectChanges();
    return fixture;
  };
  const html = (fixture: ReturnType<typeof open>) => fixture.nativeElement as HTMLElement;

  afterEach(() => http.verify());

  it('compte les cours par statut et liste les plus récemment modifiés', () => {
    const fixture = open([
      course(1, 'Ancien', 'PUBLIE', '2026-01-01T00:00:00Z'),
      course(2, 'Récent', 'BROUILLON', '2026-11-11T00:00:00Z'),
      course(3, 'Archivé', 'ARCHIVE', '2026-06-01T00:00:00Z'),
      course(4, 'Autre', 'PUBLIE', '2026-03-01T00:00:00Z'),
    ]);
    const values = Array.from(html(fixture).querySelectorAll('.value')).map((e) => e.textContent?.trim());
    const titles = Array.from(html(fixture).querySelectorAll('.list strong')).map((e) => e.textContent?.trim());

    expect(values).toEqual(['4', '2', '1', '1', '0']); // gérés, publiés, brouillons, archivés, étudiants inscrits
    expect(titles).toEqual(['Récent', 'Archivé', 'Autre', 'Ancien']);
    expect(html(fixture).textContent).toContain('Bonjour, Sonia');
  });

  it('propose les raccourcis de création', () => {
    const links = Array.from(open([]).nativeElement.querySelectorAll('.shortcuts a')).map((a) => (a as HTMLAnchorElement).getAttribute('href'));
    expect(links).toEqual(['/courses/new', '/quiz/new']);
  });

  it("affiche l'état vide", () => {
    expect(html(open([])).textContent).toContain("pas encore créé de cours");
  });

  it('signale un service de cours indisponible', () => {
    const fixture = open('error');
    expect(html(fixture).textContent).toContain('Impossible de charger vos cours');
    expect(html(fixture).querySelector('.value')?.textContent?.trim()).toBe('—');
  });

  it("compte les étudiants inscrits à mes cours seulement", () => {
    const mine = (id: number, student: string, coursId: string) => ({ id, etudiant_id: student, cours_id: coursId, date_inscription: '2026-11-01', progression: null });
    const fixture = open(
      [course(1, 'Mon cours', 'PUBLIE', '2026-02-01T00:00:00Z')],
      [mine(1, 's1', '1'), mine(2, 's2', '1'), mine(4, 's3', '99')],
    );
    expect(html(fixture).textContent).toContain('2 inscrits');
    // s1 et s2 : l'inscription à un cours d'un autre enseignant (cours 99) n'est pas comptée
    expect(html(fixture).querySelector('app-stat-card:nth-child(5)')?.textContent).toContain('2');
  });

  it("n'affiche pas d'indicateur d'inscrits si le service est indisponible", () => {
    const fixture = open([course(1, 'Mon cours', 'PUBLIE', '2026-02-01T00:00:00Z')], 'error');
    expect(html(fixture).textContent).not.toContain('inscrits ·');
    expect(html(fixture).textContent).toContain('Mon cours');
  });
});
