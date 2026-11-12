import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ReclamationsService } from './reclamations.service';
import { TRANSITIONS, academicYears, currentAcademicYear, isFinal } from './reclamation.model';

const BASE = 'http://localhost:8080/api/v1/reclamation/reclamations';

describe('ReclamationsService', () => {
  let service: ReclamationsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ReclamationsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('liste en ignorant les filtres vides', () => {
    service.list({ search: '  ', status: 'new', page: 2 }).subscribe();
    const request = http.expectOne((r) => r.url === `${BASE}/`);
    expect(request.request.method).toBe('GET');
    expect(request.request.params.has('search')).toBe(false);
    expect(request.request.params.get('status')).toBe('new');
    expect(request.request.params.get('page')).toBe('2');
    request.flush({ count: 0, next: null, previous: null, results: [] });
  });

  it('change le statut avec une réponse', () => {
    service.changeStatus('abc', { status: 'resolved', admin_response: 'Corrigé' }).subscribe();
    const request = http.expectOne(`${BASE}/abc/change-status/`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ status: 'resolved', admin_response: 'Corrigé' });
    request.flush({});
  });

  it('compte les réclamations par statut avec une requête par statut', () => {
    let result: unknown;
    service.statusCounts().subscribe((counts) => (result = counts));
    const counts: Record<string, number> = { new: 3, in_progress: 2, resolved: 1, rejected: 0 };
    for (const request of http.match((r) => r.url === `${BASE}/`)) {
      request.flush({ count: counts[request.request.params.get('status') ?? ''], next: null, previous: null, results: [] });
    }
    expect(result).toEqual({ total: 6, new: 3, in_progress: 2, resolved: 1, rejected: 0 });
  });

  it('ne modifie un statut que selon les transitions autorisées', () => {
    expect(TRANSITIONS['new']).toEqual(['in_progress', 'rejected']);
    expect(isFinal('resolved')).toBe(true);
    expect(isFinal('in_progress')).toBe(false);
  });

  it("calcule l'année universitaire (septembre à août)", () => {
    expect(currentAcademicYear(new Date(2026, 10, 12))).toBe('2026-2027');
    expect(currentAcademicYear(new Date(2027, 2, 1))).toBe('2026-2027');
    expect(academicYears().length).toBeGreaterThan(0);
  });
});
