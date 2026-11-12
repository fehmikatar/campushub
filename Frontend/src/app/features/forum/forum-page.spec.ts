import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ForumPage } from './forum-page';

const API = 'http://localhost:8080/api/v1';
const course = (id: number, titre: string) => ({ id, titre });
const category = (id: string, name: string) => ({ _id: id, name, slug: name, description: '', order: 1 });
const topic = (id: string, over: object = {}) => ({
  _id: id, title: `Sujet ${id}`, content: 'c', courseId: '2', categoryId: null, tags: [], authorId: 'a', authorRole: 'ETUDIANT',
  isPinned: false, isLocked: false, isResolved: false, repliesCount: 0, viewsCount: 0,
  lastActivityAt: new Date().toISOString(), createdAt: new Date().toISOString(), ...over,
});
const paged = (items: object[], over: object = {}) => ({ items, page: 1, limit: 10, total: items.length, totalPages: 1, ...over });

describe('ForumPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Ouvre la page : catégories, cours puis sujets du premier cours. */
  const open = (courses: object[], topics: object) => {
    const fixture = TestBed.createComponent(ForumPage);
    http.expectOne(`${API}/forum/categories`).flush([category('k1', 'Questions'), category('k2', 'Projets')]);
    http.expectOne((r) => r.url === `${API}/courses`).flush({ data: courses, total: courses.length, page: 1, limit: 100 });
    if (courses.length > 0) {
      http.expectOne((r) => r.url.startsWith(`${API}/forum/courses/`)).flush(topics);
    }
    fixture.detectChanges();
    return fixture;
  };
  const el = (fixture: ReturnType<typeof open>) => fixture.nativeElement as HTMLElement;

  it('affiche les sujets du premier cours, avec leurs badges', () => {
    const fixture = open(
      [course(2, 'Angular'), course(3, 'Design')],
      paged([topic('t1', { isPinned: true, isResolved: true, categoryId: 'k1' }), topic('t2', { isLocked: true })]),
    );
    const text = el(fixture).textContent ?? '';

    expect(text).toContain('Sujet t1');
    expect(text).toContain('Épinglé');
    expect(text).toContain('Résolu');
    expect(text).toContain('Verrouillé');
    expect(text).toContain('Questions');
  });

  it("affiche l'état vide sans cours", () => {
    expect(el(open([], paged([]))).textContent).toContain('Aucun cours disponible');
  });

  it("propose de créer le premier sujet quand le cours n'en a pas", () => {
    expect(el(open([course(2, 'Angular')], paged([]))).textContent).toContain('Soyez le premier');
  });

  it('« Sans réponse » ne garde que les sujets sans réponse', () => {
    const fixture = open([course(2, 'Angular')], paged([topic('t1', { repliesCount: 3 }), topic('t2', { repliesCount: 0 })]));
    const tabs = el(fixture).querySelectorAll<HTMLButtonElement>('.tabs button');

    tabs[2].click();
    fixture.detectChanges();

    const titles = Array.from(el(fixture).querySelectorAll('.title')).map((a) => a.textContent);
    expect(titles).toEqual(['Sujet t2']);
  });

  it('« Populaires » trie par réponses et vues, les épinglés en premier', () => {
    const fixture = open(
      [course(2, 'Angular')],
      paged([topic('t1', { repliesCount: 1 }), topic('t2', { repliesCount: 9 }), topic('t3', { isPinned: true })]),
    );

    el(fixture).querySelectorAll<HTMLButtonElement>('.tabs button')[1].click();
    fixture.detectChanges();

    expect(Array.from(el(fixture).querySelectorAll('.title')).map((a) => a.textContent)).toEqual(['Sujet t3', 'Sujet t2', 'Sujet t1']);
  });

  it('filtre par catégorie', () => {
    const fixture = open([course(2, 'Angular')], paged([topic('t1')]));
    el(fixture).querySelectorAll<HTMLButtonElement>('.chips button')[2].click();

    const request = http.expectOne((r) => r.url.startsWith(`${API}/forum/courses/2/topics`));
    expect(request.request.params.get('categoryId')).toBe('k2');
    request.flush(paged([]));
  });

  it('pagine', () => {
    const fixture = open([course(2, 'Angular')], paged([topic('t1')], { totalPages: 3, total: 25 }));
    const buttons = el(fixture).querySelectorAll<HTMLButtonElement>('.pager button');

    expect(buttons[0].disabled).toBe(true);
    buttons[1].click();

    const request = http.expectOne((r) => r.url.startsWith(`${API}/forum/courses/2/topics`));
    expect(request.request.params.get('page')).toBe('2');
    request.flush(paged([], { page: 2, totalPages: 3, total: 25 }));
  });
});
