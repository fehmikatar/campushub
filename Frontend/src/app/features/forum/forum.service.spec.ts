import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ForumService } from './forum.service';

const BASE = 'http://localhost:8080/api/v1/forum';

describe('ForumService', () => {
  let service: ForumService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ForumService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('liste les sujets du cours avec filtres et pagination', () => {
    service.listTopics('2', { categoryId: 'c1', q: ' signaux ', resolved: false, page: 3, limit: 5 }).subscribe();
    const request = http.expectOne((r) => r.url === `${BASE}/courses/2/topics`);
    const { params } = request.request;
    expect([params.get('categoryId'), params.get('q'), params.get('resolved'), params.get('page'), params.get('limit')]).toEqual([
      'c1',
      'signaux',
      'false',
      '3',
      '5',
    ]);
    request.flush({ items: [], page: 3, limit: 5, total: 0, totalPages: 0 });
  });

  it("n'envoie pas les filtres vides", () => {
    service.listTopics('2').subscribe();
    const request = http.expectOne((r) => r.url === `${BASE}/courses/2/topics`);
    expect(request.request.params.keys().sort()).toEqual(['limit', 'page']);
    request.flush({ items: [], page: 1, limit: 10, total: 0, totalPages: 0 });
  });

  it('crée un sujet, lit, modifie et supprime', () => {
    service.createTopic('2', { title: 'Titre valide', content: 'x', tags: ['a'] }).subscribe();
    const created = http.expectOne(`${BASE}/courses/2/topics`);
    expect(created.request.method).toBe('POST');
    expect(created.request.body).toEqual({ title: 'Titre valide', content: 'x', tags: ['a'] });

    service.topic('t1').subscribe();
    expect(http.expectOne(`${BASE}/topics/t1`).request.method).toBe('GET');
    service.updateTopic('t1', { title: 'Autre titre', content: 'y' }).subscribe();
    expect(http.expectOne(`${BASE}/topics/t1`).request.method).toBe('PUT');
    service.deleteTopic('t1').subscribe();
    expect(http.expectOne(`${BASE}/topics/t1`).request.method).toBe('DELETE');
  });

  it('épingle, verrouille et résout avec { value }', () => {
    for (const flag of ['pin', 'lock', 'resolve'] as const) {
      service.setFlag('t1', flag, true).subscribe();
      const request = http.expectOne(`${BASE}/topics/t1/${flag}`);
      expect(request.request.method).toBe('PATCH');
      expect(request.request.body).toEqual({ value: true });
    }
  });

  it('crée une réponse avec ou sans message parent', () => {
    service.createPost('t1', 'Bonjour').subscribe();
    expect(http.expectOne(`${BASE}/topics/t1/posts`).request.body).toEqual({ content: 'Bonjour' });
    service.createPost('t1', 'Bonjour', 'p9').subscribe();
    expect(http.expectOne(`${BASE}/topics/t1/posts`).request.body).toEqual({ content: 'Bonjour', parentPostId: 'p9' });
  });

  it("aime, retire son « j'aime » et valide une réponse", () => {
    service.like('p1').subscribe();
    expect(http.expectOne(`${BASE}/posts/p1/like`).request.method).toBe('POST');
    service.unlike('p1').subscribe();
    expect(http.expectOne(`${BASE}/posts/p1/like`).request.method).toBe('DELETE');
    service.accept('p1', true).subscribe();
    const accept = http.expectOne(`${BASE}/posts/p1/accept`);
    expect(accept.request.method).toBe('PATCH');
    expect(accept.request.body).toEqual({ value: true });
  });

  it('lit et modifie les réponses par pages de 20', () => {
    service.posts('t1', 2).subscribe();
    const request = http.expectOne((r) => r.url === `${BASE}/topics/t1/posts`);
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('limit')).toBe('20');
    service.updatePost('p1', 'x').subscribe();
    expect(http.expectOne(`${BASE}/posts/p1`).request.method).toBe('PUT');
    service.deletePost('p1').subscribe();
    expect(http.expectOne(`${BASE}/posts/p1`).request.method).toBe('DELETE');
  });
});
