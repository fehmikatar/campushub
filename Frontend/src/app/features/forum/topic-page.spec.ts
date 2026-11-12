import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { AuthService, CurrentUser } from '../../core/auth/auth.service';
import { TopicPage } from './topic-page';

const API = 'http://localhost:8080/api/v1/forum';
const topic = (over: object = {}) => ({
  _id: 't1', title: 'Comment utiliser les signaux ?', content: 'Je ne comprends **signal()**.', courseId: '2', categoryId: null,
  tags: ['angular'], authorId: 's1', authorRole: 'ETUDIANT', isPinned: false, isLocked: false, isResolved: false,
  repliesCount: 1, viewsCount: 4, lastActivityAt: new Date().toISOString(), createdAt: new Date().toISOString(), ...over,
});
const post = (id: string, over: object = {}) => ({
  _id: id, topicId: 't1', parentPostId: null, content: `Réponse ${id}`, authorId: 'p1', authorRole: 'ENSEIGNANT',
  isAcceptedAnswer: false, likesCount: 0, likedByMe: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...over,
});
const paged = (items: object[]) => ({ items, page: 1, limit: 20, total: items.length, totalPages: 1 });
const user = (id: string, role: CurrentUser['role']): CurrentUser => ({ id, prenom: 'X', nom: 'Y', email: '', role });

describe('TopicPage', () => {
  let http: HttpTestingController;

  const configure = (me: CurrentUser) => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { user: signal(me) } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 't1' }) } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  };

  const open = (me: CurrentUser, topicData = topic(), posts = [post('p1')]) => {
    configure(me);
    const fixture = TestBed.createComponent(TopicPage);
    http.expectOne(`${API}/topics/t1`).flush(topicData);
    http.expectOne((r) => r.url === `${API}/topics/t1/posts`).flush(paged(posts));
    fixture.detectChanges();
    return fixture;
  };
  const el = (fixture: ReturnType<typeof open>) => fixture.nativeElement as HTMLElement;
  const click = (fixture: ReturnType<typeof open>, selector: string, index = 0) => {
    el(fixture).querySelectorAll<HTMLButtonElement>(selector)[index].click();
    fixture.detectChanges();
  };

  afterEach(() => http.verify());

  it('affiche le sujet en Markdown sûr, ses réponses et les badges', () => {
    const fixture = open(user('s2', 'ETUDIANT'), topic({ isResolved: true, isPinned: true }), [post('p1', { isAcceptedAnswer: true })]);
    const html = el(fixture);

    expect(html.querySelector('h1')?.textContent).toContain('signaux');
    expect(html.querySelector('.body strong')?.textContent).toBe('signal()');
    expect(html.textContent).toContain('Résolu');
    expect(html.textContent).toContain('Épinglé');
    expect(html.textContent).toContain('Meilleure réponse');
    expect(html.textContent).toContain('Réponse p1');
  });

  it("un étudiant étranger au sujet n'a ni menu de modération ni bouton de validation", () => {
    const fixture = open(user('s2', 'ETUDIANT'));
    expect(el(fixture).querySelector('.moderation')).toBeNull();
    expect(el(fixture).textContent).not.toContain('Marquer comme meilleure réponse');
  });

  it("verrouille le sujet depuis le menu d'un enseignant, et la zone de réponse reste ouverte", () => {
    const fixture = open(user('t1', 'ENSEIGNANT'));
    click(fixture, '.moderation > button');
    const items = Array.from(el(fixture).querySelectorAll<HTMLButtonElement>('.menu button'));
    items.find((b) => b.textContent?.includes('Verrouiller'))!.click();

    const request = http.expectOne(`${API}/topics/t1/lock`);
    expect(request.request.body).toEqual({ value: true });
    request.flush({ id: 't1', isLocked: true });
    fixture.detectChanges();

    expect(el(fixture).textContent).toContain('Verrouillé');
    expect(el(fixture).textContent).toContain('seuls les enseignants');
  });

  it('cache la zone de réponse à un étudiant sur un sujet verrouillé', () => {
    const fixture = open(user('s2', 'ETUDIANT'), topic({ isLocked: true }));
    expect(el(fixture).querySelector('.reply')).toBeNull();
    expect(el(fixture).textContent).toContain('plus de nouvelles réponses');
  });

  it("aime une réponse puis retire son « j'aime »", () => {
    const fixture = open(user('s2', 'ETUDIANT'));
    click(fixture, '.action');
    http.expectOne(`${API}/posts/p1/like`).flush({ postId: 'p1', likesCount: 1, likedByMe: true });
    fixture.detectChanges();
    expect(el(fixture).querySelector('.action.on')?.textContent).toContain('1');

    click(fixture, '.action');
    expect(http.expectOne(`${API}/posts/p1/like`).request.method).toBe('DELETE');
  });

  it("l'auteur du sujet valide la meilleure réponse", () => {
    const fixture = open(user('s1', 'ETUDIANT'));
    const accept = Array.from(el(fixture).querySelectorAll<HTMLButtonElement>('.action')).find((b) => b.textContent?.includes('meilleure réponse'))!;
    accept.click();

    const request = http.expectOne(`${API}/posts/p1/accept`);
    expect(request.request.body).toEqual({ value: true });
    request.flush({ postId: 'p1', isAcceptedAnswer: true, topicResolved: true });
    http.expectOne(`${API}/topics/t1`).flush(topic({ isResolved: true }));
    http.expectOne((r) => r.url === `${API}/topics/t1/posts`).flush(paged([post('p1', { isAcceptedAnswer: true })]));
  });

  it('publie une réponse en réponse à un message', () => {
    const fixture = open(user('s2', 'ETUDIANT'));
    const reply = Array.from(el(fixture).querySelectorAll<HTMLButtonElement>('.action')).find((b) => b.textContent?.includes('Répondre'))!;
    reply.click();
    fixture.detectChanges();
    expect(el(fixture).querySelector('.quote')?.textContent).toContain('En réponse à un message de Enseignant');

    fixture.componentInstance['replyContent'].set('Merci !');
    click(fixture, '.reply .btn-primary');

    const request = http.expectOne(`${API}/topics/t1/posts`);
    expect(request.request.body).toEqual({ content: 'Merci !', parentPostId: 'p1' });
    request.flush(post('p2'));
    http.expectOne(`${API}/topics/t1`).flush(topic({ repliesCount: 2 }));
    http.expectOne((r) => r.url === `${API}/topics/t1/posts`).flush(paged([post('p1'), post('p2')]));
  });

  it('refuse une réponse vide sans appeler le serveur', () => {
    const fixture = open(user('s2', 'ETUDIANT'));
    click(fixture, '.reply .btn-primary');
    http.expectNone(`${API}/topics/t1/posts`);
    expect(el(fixture).querySelector('.reply .alert')?.textContent).toContain('obligatoire');
  });

  it('supprime le sujet après confirmation (auteur) et retourne au forum', () => {
    const fixture = open(user('s1', 'ETUDIANT'));
    click(fixture, '.moderation > button');
    Array.from(el(fixture).querySelectorAll<HTMLButtonElement>('.menu button')).find((b) => b.textContent?.includes('Supprimer'))!.click();
    fixture.detectChanges();
    expect(el(fixture).textContent).toContain('Supprimer ce sujet ?');

    click(fixture, 'app-confirm-dialog .danger');
    const request = http.expectOne(`${API}/topics/t1`);
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('affiche « Sujet introuvable » sur un 404', () => {
    configure(user('s1', 'ETUDIANT'));
    const fixture = TestBed.createComponent(TopicPage);
    http.expectOne(`${API}/topics/t1`).flush({ message: 'Sujet introuvable' }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Sujet introuvable');
  });
});
