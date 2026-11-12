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

  it('lit les catégories', () => {
    service.categories().subscribe();
    const request = http.expectOne(`${BASE}/categories`);
    expect(request.request.method).toBe('GET');
    request.flush([]);
  });

  it('liste les sujets d\'un cours avec tous les filtres', () => {
    service.topics(7, { categoryId: 'c1', q: 'angular', resolved: true, page: 2, limit: 5 }).subscribe();
    const request = http.expectOne((r) => r.url === `${BASE}/courses/7/topics`);
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('categoryId')).toBe('c1');
    expect(request.request.params.get('q')).toBe('angular');
    expect(request.request.params.get('resolved')).toBe('true');
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('limit')).toBe('5');
    request.flush({ items: [], page: 2, limit: 5, total: 0, totalPages: 0 });
  });

  it('n\'envoie que page et limit par défaut', () => {
    service.topics(7).subscribe();
    const request = http.expectOne((r) => r.url === `${BASE}/courses/7/topics`);
    expect(request.request.params.keys().sort()).toEqual(['limit', 'page']);
    request.flush({ items: [], page: 1, limit: 20, total: 0, totalPages: 0 });
  });

  it('lit, crée, modifie et supprime un sujet', () => {
    service.topic('t1').subscribe();
    http.expectOne(`${BASE}/topics/t1`).flush({});

    const input = { title: 'Titre', content: 'Texte', tags: ['a'], categoryId: 'c1' };
    service.createTopic(7, input).subscribe();
    const create = http.expectOne(`${BASE}/courses/7/topics`);
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual(input);
    create.flush({});

    service.updateTopic('t1', { title: 'Nouveau' }).subscribe();
    const update = http.expectOne(`${BASE}/topics/t1`);
    expect(update.request.method).toBe('PUT');
    expect(update.request.body).toEqual({ title: 'Nouveau' });
    update.flush({});

    service.removeTopic('t1').subscribe();
    const remove = http.expectOne(`${BASE}/topics/t1`);
    expect(remove.request.method).toBe('DELETE');
    remove.flush(null);
  });

  it('modère avec { value }', () => {
    for (const [flag, value] of [['pin', true], ['lock', false], ['resolve', true]] as const) {
      service.moderate('t1', flag, value).subscribe();
      const request = http.expectOne(`${BASE}/topics/t1/${flag}`);
      expect(request.request.method).toBe('PATCH');
      expect(request.request.body).toEqual({ value });
      request.flush({});
    }
  });

  it('liste les messages paginés et accepte aussi une simple liste', () => {
    let result: unknown;
    service.posts('t1', 2, 10).subscribe((page) => (result = page));
    const request = http.expectOne((r) => r.url === `${BASE}/topics/t1/posts`);
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('limit')).toBe('10');
    request.flush({ items: [], page: 2, limit: 10, total: 11, totalPages: 2 });
    expect(result).toEqual({ items: [], page: 2, limit: 10, total: 11, totalPages: 2 });

    service.posts('t1').subscribe((page) => (result = page));
    http.expectOne((r) => r.url === `${BASE}/topics/t1/posts`).flush([{ _id: 'p1' }]);
    expect(result).toEqual({ items: [{ _id: 'p1' }], page: 1, limit: 1, total: 1, totalPages: 1 });
  });

  it('crée un message avec ou sans parentPostId', () => {
    service.createPost('t1', 'Bonjour').subscribe();
    const first = http.expectOne(`${BASE}/topics/t1/posts`);
    expect(first.request.method).toBe('POST');
    expect(first.request.body).toEqual({ content: 'Bonjour' });
    first.flush({});

    service.createPost('t1', 'Réponse', 'p1').subscribe();
    const second = http.expectOne(`${BASE}/topics/t1/posts`);
    expect(second.request.body).toEqual({ content: 'Réponse', parentPostId: 'p1' });
    second.flush({});
  });

  it('modifie, supprime et accepte un message', () => {
    service.updatePost('p1', 'Texte').subscribe();
    const update = http.expectOne(`${BASE}/posts/p1`);
    expect(update.request.method).toBe('PUT');
    expect(update.request.body).toEqual({ content: 'Texte' });
    update.flush({});

    service.removePost('p1').subscribe();
    const remove = http.expectOne(`${BASE}/posts/p1`);
    expect(remove.request.method).toBe('DELETE');
    remove.flush(null);

    service.accept('p1', true).subscribe();
    const accept = http.expectOne(`${BASE}/posts/p1/accept`);
    expect(accept.request.method).toBe('PATCH');
    expect(accept.request.body).toEqual({ value: true });
    accept.flush({});
  });

  it('aime et retire son J\'aime', () => {
    service.like('p1').subscribe();
    const like = http.expectOne(`${BASE}/posts/p1/like`);
    expect(like.request.method).toBe('POST');
    like.flush({});

    service.unlike('p1').subscribe();
    const unlike = http.expectOne(`${BASE}/posts/p1/like`);
    expect(unlike.request.method).toBe('DELETE');
    unlike.flush(null);
  });
});
