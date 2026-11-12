import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { percentOf, percentRead } from './enrollment.model';
import { EnrollmentsService } from './enrollments.service';

const BASE = 'http://localhost:8080/api/v1/enrollments';

describe('EnrollmentsService', () => {
  let service: EnrollmentsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(EnrollmentsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('liste sans paramètre pour un étudiant', () => {
    service.list().subscribe();
    const request = http.expectOne((r) => r.url === `${BASE}/`);
    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys()).toEqual([]);
    request.flush([]);
  });

  it("liste les inscrits d'un cours", () => {
    service.list({ coursId: 12 }).subscribe();
    const request = http.expectOne((r) => r.url === `${BASE}/`);
    expect(request.request.params.get('coursId')).toBe('12');
    request.flush([]);
  });

  it("s'inscrit avec l'identifiant du cours en texte", () => {
    service.enroll(7).subscribe();
    const request = http.expectOne(`${BASE}/`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ cours_id: '7' });
    request.flush({});
  });

  it('annule une inscription', () => {
    service.cancel(3).subscribe();
    const request = http.expectOne(`${BASE}/3/`);
    expect(request.request.method).toBe('DELETE');
    request.flush(null);
  });

  it('lit et met à jour la progression', () => {
    service.progress(3).subscribe();
    http.expectOne(`${BASE}/3/progress/`).flush({ id: 1, inscription: 3, pourcentage: 40 });
    service.setProgress(3, 60).subscribe();
    const request = http.expectOne(`${BASE}/3/progress/`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ pourcentage: 60 });
    request.flush({});
  });
});

describe('pourcentages', () => {
  it("lit la progression d'une inscription, bornée entre 0 et 100", () => {
    expect(percentOf({ progression: null })).toBe(0);
    expect(percentOf({ progression: { id: 1, inscription: 1, pourcentage: 33.4 } })).toBe(33);
    expect(percentOf({ progression: { id: 1, inscription: 1, pourcentage: 140 } })).toBe(100);
  });

  it('calcule le pourcentage de chapitres lus', () => {
    expect(percentRead(0, 0)).toBe(0);
    expect(percentRead(1, 3)).toBe(33);
    expect(percentRead(3, 3)).toBe(100);
    expect(percentRead(5, 3)).toBe(100);
  });
});
