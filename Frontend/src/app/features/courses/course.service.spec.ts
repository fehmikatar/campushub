import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CourseService } from './course.service';
import { COURSE_ACCESS_TOKEN } from './course-session';

describe('CourseService Gateway contract', () => {
  let service: CourseService;
  let http: HttpTestingController;
  const base = 'http://localhost:8080/api/v1/courses';
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: COURSE_ACCESS_TOKEN, useValue: () => 'test-token' },
      ],
    });
    service = TestBed.inject(CourseService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('relays the session token and filters through the Gateway', () => {
    service.list({ search: 'Angular', formateurId: 'teacher-id', page: 2, limit: 9 }).subscribe();
    const req = http.expectOne(
      (r) =>
        r.url === base &&
        r.params.get('formateurId') === 'teacher-id' &&
        r.params.get('page') === '2',
    );
    expect(req.request.headers.get('Authorization')).toBe('Bearer test-token');
    expect(req.request.params.get('search')).toBe('Angular');
    req.flush({ data: [], total: 0, page: 2, limit: 9 });
  });
  it('creates a course without sending a formateurId', () => {
    service.save(null, { titre: 'Cours test' }).subscribe();
    const req = http.expectOne(base);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ titre: 'Cours test' });
    req.flush({ id: 1 });
  });
  it('sends the full reorder list in the expected shape', () => {
    service.reorder(1, [3, 1, 2]).subscribe();
    const req = http.expectOne(base + '/1/chapters/reorder');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ ids: [3, 1, 2] });
    req.flush([]);
  });
  it('uploads a PDF using multipart field file without a JSON content type', () => {
    const file = new File(['pdf'], 'cours.pdf', { type: 'application/pdf' });
    service.uploadPdf(1, 2, file).subscribe();
    const req = http.expectOne(base + '/1/chapters/2/pdf');
    expect(req.request.body.get('file')).toBe(file);
    expect(req.request.headers.has('Content-Type')).toBe(false);
    req.flush({});
  });
  it('loads protected PDF files as authenticated blobs', () => {
    service.pdf(1, 2, true).subscribe();
    const req = http.expectOne(base + '/1/chapters/2/pdf?download=true');
    expect(req.request.responseType).toBe('blob');
    expect(req.request.headers.get('Authorization')).toBe('Bearer test-token');
    req.flush(new Blob());
  });
});
