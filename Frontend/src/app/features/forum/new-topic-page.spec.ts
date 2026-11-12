import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { NewTopicPage } from './new-topic-page';

const API = 'http://localhost:8080/api/v1/forum';

describe('NewTopicPage', () => {
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;

  const setup = (cours: string | null) => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(cours ? { cours } : {}) } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(NewTopicPage);
    http.expectOne(`${API}/categories`).flush([{ _id: 'k1', name: 'Questions', slug: 'q', description: '', order: 1 }]);
    fixture.detectChanges();
    return fixture;
  };
  const type = (fixture: ReturnType<typeof setup>, selector: string, value: string) => {
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
  const submit = (fixture: ReturnType<typeof setup>) => {
    (fixture.nativeElement as HTMLElement).querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  };

  afterEach(() => http.verify());

  it('demande de choisir un cours quand aucun n’est indiqué', () => {
    const fixture = setup(null);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Aucun cours choisi');
    expect((fixture.nativeElement as HTMLElement).querySelector('form')).toBeNull();
  });

  it("n'envoie rien tant que le titre ou le message sont invalides", () => {
    const fixture = setup('2');
    type(fixture, 'input[formcontrolname=title]', 'abc');
    submit(fixture);

    http.expectNone(`${API}/courses/2/topics`);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('entre 5 et 150');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Le message est obligatoire');
  });

  it('refuse plus de 5 étiquettes', () => {
    const fixture = setup('2');
    type(fixture, 'input[formcontrolname=title]', 'Un titre valide');
    type(fixture, 'input[formcontrolname=tags]', 'a,b,c,d,e,f');
    fixture.componentInstance['content'].set('Un message');
    submit(fixture);

    http.expectNone(`${API}/courses/2/topics`);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('5 étiquettes au maximum');
  });

  it('publie le sujet puis ouvre sa page', () => {
    const fixture = setup('2');
    type(fixture, 'input[formcontrolname=title]', '  Comment utiliser les signaux ?  ');
    type(fixture, 'input[formcontrolname=tags]', 'angular, signaux');
    fixture.componentInstance['content'].set('Je ne comprends pas.');
    submit(fixture);

    const request = http.expectOne(`${API}/courses/2/topics`);
    expect(request.request.body).toEqual({
      title: 'Comment utiliser les signaux ?',
      content: 'Je ne comprends pas.',
      tags: ['angular', 'signaux'],
    });
    request.flush({ _id: 'new1' });
    expect(navigate).toHaveBeenCalledWith(['/forum/sujets', 'new1']);
  });

  it("affiche l'erreur du serveur", () => {
    const fixture = setup('2');
    type(fixture, 'input[formcontrolname=title]', 'Un titre valide');
    fixture.componentInstance['content'].set('Un message');
    submit(fixture);

    http.expectOne(`${API}/courses/2/topics`).flush({ message: 'Cours introuvable' }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('.alert')?.textContent).toContain('Cours introuvable');
  });
});
