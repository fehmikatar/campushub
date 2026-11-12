import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AssistantService } from './assistant.service';

const BASE = 'http://localhost:8080/api/v1/reclamation';

describe('AssistantService', () => {
  let service: AssistantService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AssistantService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('pose une question dans une nouvelle conversation', () => {
    service.ask('Quel est le seuil ?', null).subscribe();
    const request = http.expectOne(`${BASE}/academic-assistant/ask/`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ question: 'Quel est le seuil ?' });
    request.flush({});
  });

  it('poursuit une conversation existante', () => {
    service.ask('Et pour le rattrapage ?', 7, '2026-2027').subscribe();
    const request = http.expectOne(`${BASE}/academic-assistant/ask/`);
    expect(request.request.body).toEqual({ question: 'Et pour le rattrapage ?', conversation_id: 7, academic_year: '2026-2027' });
    request.flush({});
  });

  it('renomme et supprime une conversation', () => {
    service.rename(3, 'Absences').subscribe();
    const rename = http.expectOne(`${BASE}/conversations/3/`);
    expect(rename.request.method).toBe('PUT');
    expect(rename.request.body).toEqual({ title: 'Absences' });
    rename.flush({});
    service.deleteConversation(3).subscribe();
    const remove = http.expectOne(`${BASE}/conversations/3/`);
    expect(remove.request.method).toBe('DELETE');
    remove.flush(null);
  });

  it('envoie un PDF en multipart dans le champ « file »', () => {
    const file = new File(['%PDF'], 'guide.pdf', { type: 'application/pdf' });
    service.uploadDocument(file).subscribe();
    const request = http.expectOne(`${BASE}/documents/`);
    expect(request.request.method).toBe('POST');
    expect((request.request.body as FormData).get('file')).toBeInstanceOf(File);
    request.flush({});
  });

  it('filtre les règles sans paramètres vides', () => {
    service.rules({ q: ' absence ', category: '' }).subscribe();
    const request = http.expectOne((r) => r.url === `${BASE}/academic-rules/`);
    expect(request.request.params.get('q')).toBe('absence');
    expect(request.request.params.has('category')).toBe(false);
    request.flush({ count: 0, results: [], official_source: '' });
  });
});
