import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NotificationsService } from './notifications.service';

const BASE = 'http://localhost:8080/api/v1/notifications';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(NotificationsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('liste avec pagination et filtre « non lues »', () => {
    service.list({ unread: true, page: 2, perPage: 5 }).subscribe();
    const request = http.expectOne((r) => r.url === BASE);
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('unread')).toBe('1');
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('per_page')).toBe('5');
    request.flush({ data: [], current_page: 2, last_page: 2, per_page: 5, total: 6 });
  });

  it('ne filtre pas sur « non lues » par défaut', () => {
    service.list().subscribe();
    const request = http.expectOne((r) => r.url === BASE);
    expect(request.request.params.has('unread')).toBe(false);
    expect(request.request.params.get('per_page')).toBe('20');
    request.flush({ data: [], current_page: 1, last_page: 1, per_page: 20, total: 0 });
  });

  it('met à jour le badge, et le conserve si le service est indisponible', () => {
    service.refreshUnreadCount();
    http.expectOne(`${BASE}/unread-count`).flush({ count: 4 });
    expect(service.unreadCount()).toBe(4);

    service.refreshUnreadCount();
    http.expectOne(`${BASE}/unread-count`).flush({}, { status: 503, statusText: 'Service Unavailable' });
    expect(service.unreadCount()).toBe(4);
  });

  it('marque lu, tout lu, supprime', () => {
    service.markRead(7).subscribe();
    expect(http.expectOne(`${BASE}/7/read`).request.method).toBe('PATCH');

    service.markAllRead().subscribe();
    expect(http.expectOne(`${BASE}/read-all`).request.method).toBe('PATCH');

    service.remove(7).subscribe();
    expect(http.expectOne(`${BASE}/7`).request.method).toBe('DELETE');
  });

  it('lit et enregistre les préférences', () => {
    service.preferences().subscribe();
    http.expectOne(`${BASE}/preferences`).flush({ email: null, email_enabled: true, muted_types: [] });

    const preferences = { email: 'a@b.tn', email_enabled: false, muted_types: ['forum.like'] };
    service.updatePreferences(preferences).subscribe();
    const request = http.expectOne(`${BASE}/preferences`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual(preferences);
    request.flush(preferences);
  });
});
