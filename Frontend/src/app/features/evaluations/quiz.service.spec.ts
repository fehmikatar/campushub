import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { QuizService } from './quiz.service';
import { AppConfig } from '../../core/config/app-config';
import { QuizInput } from './quiz.models';
describe('QuizService Gateway contract', () => {
  let api: QuizService;
  let http: HttpTestingController;
  const base = 'http://localhost:8080/api/v1/evaluation';
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(QuizService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('lists quizzes by course through Gateway', () => {
    api.list(12).subscribe();
    const r = http.expectOne(base + '/quizzes/course/12');
    expect(r.request.method).toBe('GET');
    r.flush([]);
  });
  it('uses runtime configuration', () => {
    TestBed.inject(AppConfig).apiUrl = 'http://localhost:8090';
    api.get(1).subscribe();
    http.expectOne('http://localhost:8090/api/v1/evaluation/quizzes/1').flush({});
  });
  it('creates camelCase questions with correction flags', () => {
    const body: QuizInput = {
      titre: 'Test',
      courseId: 12,
      maxTentatives: 2,
      dureeMinutes: null,
      questions: [
        {
          texte: 'Question',
          reponses: [
            { texte: 'Oui', estCorrecte: true },
            { texte: 'Non', estCorrecte: false },
          ],
        },
      ],
    };
    api.create(body).subscribe();
    const r = http.expectOne(base + '/quizzes');
    expect(r.request.method).toBe('POST');
    expect(r.request.body).toEqual(body);
    r.flush({ id: 1 });
  });
  it('accepts an empty 204 response when updating', () => {
    api.update(2, {} as QuizInput).subscribe((value) => expect(value).toBeNull());
    const r = http.expectOne(base + '/quizzes/2');
    expect(r.request.method).toBe('PUT');
    r.flush(null, { status: 204, statusText: 'No Content' });
  });
  it('starts an attempt without sending an invented user id', () => {
    api.start(3).subscribe();
    const r = http.expectOne(base + '/quizzes/3/start');
    expect(r.request.method).toBe('POST');
    expect(r.request.body).toEqual({});
    r.flush({});
  });
  it('submits answer ids without leaking correction data', () => {
    const body = { reponses: [{ questionId: 5, reponseId: 9 }] };
    api.submit(3, body).subscribe();
    const r = http.expectOne(base + '/quizzes/3/submit');
    expect(r.request.body).toEqual(body);
    r.flush({});
  });
  it('loads student history and creator results with their exact routes', () => {
    api.mine().subscribe();
    api.results(3).subscribe();
    http.expectOne(base + '/resultats/me').flush([]);
    http.expectOne(base + '/resultats/quiz/3').flush([]);
  });
});
