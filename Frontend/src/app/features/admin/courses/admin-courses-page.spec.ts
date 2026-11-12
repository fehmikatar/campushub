import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AdminCoursesPage } from './admin-courses-page';

const BASE = 'http://localhost:8080/api/v1/courses';
const course = (id: number, statut: string, nbChapitres: number) => ({
  id,
  titre: `Cours ${id}`,
  description: '',
  categorie: 'Design',
  statut,
  imageUrl: null,
  formateurId: '3f2b8c1e-5d4a-4c1b-9a0e-2d7f6b1c8e90',
  nbChapitres,
  createdAt: '2026-11-11T10:00:00Z',
  updatedAt: '2026-11-11T10:00:00Z',
});
const page = (data: object[], total = data.length) => ({ data, total, page: 1, limit: 10 });

describe('AdminCoursesPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const open = (result: object) => {
    const fixture = TestBed.createComponent(AdminCoursesPage);
    http.expectOne(`${BASE}/categories`).flush(['Design', 'Langues']);
    http.expectOne((r) => r.url === BASE).flush(result);
    fixture.detectChanges();
    return fixture;
  };
  const el = (fixture: ReturnType<typeof open>) => fixture.nativeElement as HTMLElement;
  const buttons = (row: Element) =>
    Array.from(row.querySelectorAll<HTMLButtonElement>('.icon-btn'));

  it('affiche les cours avec leur statut', () => {
    const fixture = open(page([course(1, 'BROUILLON', 2), course(2, 'PUBLIE', 1)]));
    const rows = el(fixture).querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Brouillon');
    expect(rows[1].textContent).toContain('Publié');
  });

  it('réserve les actions selon le statut et le nombre de chapitres', () => {
    const fixture = open(
      page([
        course(1, 'BROUILLON', 0),
        course(2, 'BROUILLON', 2),
        course(3, 'PUBLIE', 1),
        course(4, 'ARCHIVE', 1),
      ]),
    );
    const [noChapter, draft, published, archived] = Array.from(
      el(fixture).querySelectorAll('tbody tr'),
    ).map(buttons);

    expect(noChapter[0].disabled).toBe(true); // publier sans chapitre
    expect(draft[0].disabled).toBe(false);
    expect(draft[1].disabled).toBe(true); // archiver un brouillon
    expect(published[0].disabled).toBe(true); // republier un cours publié
    expect(published[1].disabled).toBe(false);
    expect(archived[0].disabled).toBe(false); // republier un archivé
  });

  it('publie puis recharge la liste', () => {
    const fixture = open(page([course(2, 'BROUILLON', 2)]));
    buttons(el(fixture).querySelector('tbody tr')!)[0].click();

    const request = http.expectOne(`${BASE}/2/publish`);
    expect(request.request.method).toBe('PATCH');
    request.flush(course(2, 'PUBLIE', 2));
    http.expectOne((r) => r.url === BASE).flush(page([course(2, 'PUBLIE', 2)]));
  });

  it('filtre par statut', () => {
    const fixture = open(page([course(1, 'BROUILLON', 1)]));
    const select = el(fixture).querySelector<HTMLSelectElement>('select')!;
    select.value = 'ARCHIVE';
    select.dispatchEvent(new Event('change'));

    const request = http.expectOne((r) => r.url === BASE);
    expect(request.request.params.get('statut')).toBe('ARCHIVE');
    request.flush(page([]));
  });

  it('supprime après confirmation', () => {
    const fixture = open(page([course(1, 'BROUILLON', 1)]));
    buttons(el(fixture).querySelector('tbody tr')!)[2].click();
    fixture.detectChanges();
    expect(el(fixture).textContent).toContain('Supprimer ce cours ?');

    el(fixture).querySelector<HTMLButtonElement>('app-confirm-dialog .danger')!.click();
    const request = http.expectOne(`${BASE}/1`);
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });
    http.expectOne((r) => r.url === BASE).flush(page([]));
  });

  it("affiche l'état vide", () => {
    expect(el(open(page([]))).textContent).toContain('Aucun cours');
  });
});
