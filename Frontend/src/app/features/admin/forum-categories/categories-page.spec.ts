import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CategoriesPage } from './categories-page';

const URL = 'http://localhost:8080/api/v1/forum/categories';
const category = (id: string, name: string, order: number) => ({ _id: id, name, slug: name, description: 'd', order });

describe('CategoriesPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const open = (list: object[]) => {
    const fixture = TestBed.createComponent(CategoriesPage);
    http.expectOne(URL).flush(list);
    fixture.detectChanges();
    return fixture;
  };
  const html = (fixture: ReturnType<typeof open>) => fixture.nativeElement as HTMLElement;

  it('liste les catégories triées par ordre', () => {
    const fixture = open([category('2', 'Zèbre', 2), category('1', 'Algo', 1)]);
    const names = Array.from(html(fixture).querySelectorAll('tbody strong')).map((e) => e.textContent);
    expect(names).toEqual(['Algo', 'Zèbre']);
  });

  it("affiche l'état vide", () => {
    expect(html(open([])).textContent).toContain('Aucune catégorie');
  });

  it('crée une catégorie, avec le prochain ordre proposé', () => {
    const fixture = open([category('1', 'Algo', 3)]);
    (html(fixture).querySelector('.head button') as HTMLButtonElement).click();
    fixture.detectChanges();

    const inputs = html(fixture).querySelectorAll<HTMLInputElement>('form input');
    inputs[0].value = ' Réseaux ';
    inputs[0].dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (html(fixture).querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));

    const request = http.expectOne(URL);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ name: 'Réseaux', description: '', order: 4 });
    request.flush(category('9', 'Réseaux', 4));
    http.expectOne(URL).flush([]);
  });

  it("n'envoie rien si le nom est trop court", () => {
    const fixture = open([]);
    (html(fixture).querySelector('.head button') as HTMLButtonElement).click();
    fixture.detectChanges();
    const input = html(fixture).querySelector<HTMLInputElement>('form input');
    input!.value = 'A';
    input!.dispatchEvent(new Event('input'));
    (html(fixture).querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    http.expectNone(URL);
    expect(html(fixture).textContent).toContain('Le nom est obligatoire');
  });

  it("affiche l'erreur du serveur dans le formulaire", () => {
    const fixture = open([]);
    (html(fixture).querySelector('.head button') as HTMLButtonElement).click();
    fixture.detectChanges();
    const input = html(fixture).querySelector<HTMLInputElement>('form input');
    input!.value = 'Algo';
    input!.dispatchEvent(new Event('input'));
    (html(fixture).querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));

    http.expectOne(URL).flush({ message: 'Données invalides', errors: [{ message: 'Nom déjà utilisé' }] }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();

    expect(html(fixture).querySelector('.alert')?.textContent).toContain('Nom déjà utilisé');
  });

  it('supprime après confirmation', () => {
    const fixture = open([category('1', 'Algo', 1)]);
    (html(fixture).querySelector('.icon-btn.danger') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(html(fixture).textContent).toContain('Supprimer cette catégorie ?');

    (html(fixture).querySelector('app-confirm-dialog .danger') as HTMLButtonElement).click();
    const request = http.expectOne(`${URL}/1`);
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });
    http.expectOne(URL).flush([]);
  });
});
