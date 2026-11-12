import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { NotificationsPage } from './notifications-page';

const BASE = 'http://localhost:8080/api/v1/notifications';

const notification = (id: number, over: object = {}) => ({
  id,
  type: 'forum.reply',
  title: `Titre ${id}`,
  message: `Message ${id}`,
  data: null,
  read_at: null,
  created_at: new Date().toISOString(),
  ...over,
});
const page = (data: object[], over: object = {}) => ({ data, current_page: 1, last_page: 1, per_page: 20, total: data.length, ...over });

describe('NotificationsPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const open = (result: object) => {
    const fixture = TestBed.createComponent(NotificationsPage);
    http.expectOne((r) => r.url === BASE).flush(result);
    fixture.detectChanges();
    return fixture;
  };

  it('affiche les notifications et marque comme lue au clic, avec navigation', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = open(page([notification(1), notification(2, { read_at: '2026-11-11T10:00:00Z' })]));
    const html = fixture.nativeElement as HTMLElement;

    expect(html.textContent).toContain('Titre 1');
    expect(html.querySelectorAll('.item.unread').length).toBe(1);

    (html.querySelector('.main') as HTMLButtonElement).click();
    http.expectOne(`${BASE}/1/read`).flush(notification(1, { read_at: '2026-11-11T11:00:00Z' }));
    http.expectOne(`${BASE}/unread-count`).flush({ count: 0 });
    fixture.detectChanges();

    expect(html.querySelectorAll('.item.unread').length).toBe(0);
    expect(navigate).toHaveBeenCalledWith(['/forum'], { queryParams: undefined });
  });

  it('affiche l\'état vide', () => {
    const fixture = open(page([]));
    expect(fixture.nativeElement.textContent).toContain('Aucune notification pour le moment');
  });

  it('filtre sur les non lues', () => {
    const fixture = open(page([notification(1)]));
    const tabs = fixture.nativeElement.querySelectorAll('.tabs button') as NodeListOf<HTMLButtonElement>;

    tabs[1].click();

    const request = http.expectOne((r) => r.url === BASE);
    expect(request.request.params.get('unread')).toBe('1');
    request.flush(page([]));
  });

  it('supprime une notification puis recharge la liste', () => {
    const fixture = open(page([notification(1)]));

    (fixture.nativeElement.querySelector('.remove') as HTMLButtonElement).click();
    http.expectOne(`${BASE}/1`).flush(null, { status: 204, statusText: 'No Content' });
    http.expectOne((r) => r.url === BASE).flush(page([]));
    http.expectOne(`${BASE}/unread-count`).flush({ count: 0 });
  });

  it('pagine', () => {
    const fixture = open(page([notification(1)], { last_page: 2, total: 21 }));
    const buttons = fixture.nativeElement.querySelectorAll('.pager button') as NodeListOf<HTMLButtonElement>;

    expect(buttons[0].disabled).toBe(true);
    buttons[1].click();

    const request = http.expectOne((r) => r.url === BASE);
    expect(request.request.params.get('page')).toBe('2');
    request.flush(page([notification(21)], { current_page: 2, last_page: 2, total: 21 }));
  });
});
