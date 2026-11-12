import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { StudentDashboard } from './student-dashboard';

const API = 'http://localhost:8080/api/v1';
const result = (id: number, quizId: number, score: number, datePassage: string) => ({ id, quizId, etudiantId: 'u1', score, datePassage });
const course = (id: number, titre: string) => ({ id, titre, categorie: 'Design', nbChapitres: 3, statut: 'PUBLIE' });
const empty = { data: [], current_page: 1, last_page: 1, per_page: 3, total: 0 };

describe('StudentDashboard', () => {
  let http: HttpTestingController;

  const open = (results: object[] | 'error', courses: { data: object[]; total: number } | 'error', enrolled: object[] | 'error' = []) => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { accessToken: () => 'token', user: signal({ id: 'u1', prenom: 'Yassine', nom: 'B', email: '', role: 'ETUDIANT' }) } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(StudentDashboard);

    const enrollments = http.expectOne((r) => r.url === `${API}/enrollments/`);
    enrolled === 'error' ? enrollments.flush({}, { status: 503, statusText: 'x' }) : enrollments.flush(enrolled);
    const mine = http.expectOne(`${API}/evaluation/resultats/me`);
    results === 'error' ? mine.flush({}, { status: 503, statusText: 'x' }) : mine.flush(results);
    const list = http.expectOne((r) => r.url === `${API}/courses`);
    courses === 'error'
      ? list.flush({}, { status: 503, statusText: 'x' })
      : list.flush({ ...courses, page: 1, limit: 4 });
    http.expectOne((r) => r.url === `${API}/notifications`).flush(empty);
    fixture.detectChanges();
    return fixture;
  };
  const text = (fixture: ReturnType<typeof open>) => (fixture.nativeElement as HTMLElement).textContent ?? '';

  afterEach(() => http.verify());

  it('affiche le message de bienvenue, les chiffres, les cours et les derniers résultats', () => {
    const fixture = open(
      [result(1, 10, 80, '2026-11-10T10:00:00Z'), result(2, 11, 40, '2026-11-11T10:00:00Z')],
      { data: [course(5, 'Angular'), course(6, 'Design')], total: 12 },
    );
    http.expectOne(`${API}/evaluation/quizzes/11`).flush({ titre: 'Quiz TypeScript' });
    http.expectOne(`${API}/evaluation/quizzes/10`).flush({ titre: 'Quiz HTML' });
    fixture.detectChanges();
    const html = text(fixture);

    expect(html).toContain('Bonjour, Yassine');
    expect(html).toContain('60 %'); // moyenne de 80 et 40
    expect(html).toContain('12'); // cours disponibles
    expect(html).toContain('Angular');
    // le plus récent d'abord, avec le titre du quiz
    expect(html.indexOf('Quiz TypeScript')).toBeLessThan(html.indexOf('Quiz HTML'));
    expect(html).toContain('40 %');
  });

  it('retombe sur « Quiz n° X » si le titre du quiz est indisponible', () => {
    const fixture = open([result(1, 10, 80, '2026-11-10T10:00:00Z')], { data: [], total: 0 });
    http.expectOne(`${API}/evaluation/quizzes/10`).flush({}, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    expect(text(fixture)).toContain('Quiz n° 10');
  });

  it('affiche les états vides', () => {
    const fixture = open([], { data: [], total: 0 });
    const html = text(fixture);

    expect(html).toContain('Aucun examen passé');
    expect(html).toContain('Aucun cours publié');
    expect(html).toContain('Aucun quiz passé');
    expect(html).toContain('Aucune notification non lue');
  });

  it('un service indisponible ne bloque pas le reste', () => {
    const fixture = open('error', { data: [course(5, 'Angular')], total: 1 });
    const html = text(fixture);

    expect(html).toContain('Impossible de charger vos résultats');
    expect(html).toContain('Angular');
  });

  it('signale une liste de cours indisponible', () => {
    const fixture = open([], 'error');
    expect(text(fixture)).toContain('Impossible de charger les cours');
  });

  it("propose en priorité les cours inscrits, avec leur progression", () => {
    const enrolled = [
      { id: 1, etudiant_id: 'u1', cours_id: '5', date_inscription: '2026-11-01', progression: { id: 1, inscription: 1, pourcentage: 100 } },
      { id: 2, etudiant_id: 'u1', cours_id: '6', date_inscription: '2026-11-02', progression: { id: 2, inscription: 2, pourcentage: 40 } },
    ];
    const fixture = open([], { data: [course(9, 'Catalogue seul')], total: 1 }, enrolled);
    http.expectOne(`${API}/courses/5`).flush(course(5, 'Cours terminé'));
    http.expectOne(`${API}/courses/6`).flush(course(6, 'Cours en cours'));
    fixture.detectChanges();
    const html = text(fixture);

    expect(html).toContain("Reprendre l'apprentissage");
    expect(html).toContain('progression 40 %');
    // le cours à poursuivre passe avant le cours terminé ; le catalogue n'est plus proposé
    expect(html.indexOf('Cours en cours')).toBeLessThan(html.indexOf('Cours terminé'));
    expect(html).not.toContain('Catalogue seul');
    expect(html).toContain('progression moyenne 70 %');
  });

  it("retombe sur le catalogue si le service d'inscriptions est indisponible", () => {
    const fixture = open([], { data: [course(9, 'Catalogue seul')], total: 1 }, 'error');
    expect(text(fixture)).toContain('Cours à découvrir');
    expect(text(fixture)).toContain('Catalogue seul');
  });
});
