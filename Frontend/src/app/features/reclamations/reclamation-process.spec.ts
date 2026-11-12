import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { ReclamationProcess } from './reclamation-process';

const BASE = 'http://localhost:8080/api/v1/reclamation/reclamations';

const reclamation = (over: object = {}) => ({
  id: 'r1',
  reference: 'REC-2026-0001',
  subject: 'Note manquante',
  description: 'Ma note du module de réseaux est absente du relevé.',
  category: 'grade_error',
  status: 'in_progress',
  priority: 'normal',
  academic_year: '2026-2027',
  module: '',
  author_username: 'etudiant1',
  admin_response: '',
  history: [],
  created_at: '2026-11-01T10:00:00Z',
  updated_at: '2026-11-02T10:00:00Z',
  closed_at: null,
  ...over,
});

describe('ReclamationProcess', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: new Map([['id', 'r1']]) } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const open = (over: object = {}) => {
    const fixture = TestBed.createComponent(ReclamationProcess);
    http.expectOne(`${BASE}/r1/`).flush(reclamation(over));
    fixture.detectChanges();
    return fixture;
  };

  it('propose seulement les transitions valides depuis « En cours »', () => {
    const fixture = open();
    const options = [...fixture.nativeElement.querySelectorAll('select[name="status"] option')].map((o) => (o as HTMLOptionElement).value);
    expect(options).toEqual(['', 'resolved', 'rejected']);
  });

  it('exige une réponse pour une décision finale', () => {
    const component = open().componentInstance as unknown as { status: string; response: string; canSubmit(): boolean };
    component.status = 'resolved';
    expect(component.canSubmit()).toBe(false);
    component.response = 'Votre note a été corrigée.';
    expect(component.canSubmit()).toBe(true);
  });

  it('ne permet plus de traiter une réclamation clôturée', () => {
    const fixture = open({ status: 'resolved' });
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('clôturée');
  });
});
