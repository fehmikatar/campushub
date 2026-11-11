import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PreferencesPage } from './preferences-page';

const URL = 'http://localhost:8080/api/v1/notifications/preferences';

describe('PreferencesPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const open = (preferences: object) => {
    const fixture = TestBed.createComponent(PreferencesPage);
    http.expectOne(URL).flush(preferences);
    fixture.detectChanges();
    return fixture;
  };

  it('désactive un groupe dont un type est coupé et le conserve à l\'enregistrement', () => {
    const fixture = open({ email: 'a@b.tn', email_enabled: true, muted_types: ['grade', 'deadline', 'inconnu'] });
    const page = fixture.componentInstance as unknown as {
      enabled: () => Record<string, boolean>;
      toggle: (key: string) => void;
      save: () => void;
    };

    expect(page.enabled()).toEqual({ forum: true, cours: true, evaluations: false });

    page.toggle('forum');
    page.save();

    const request = http.expectOne(URL);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body.email).toBe('a@b.tn');
    expect(request.request.body.muted_types.sort()).toEqual(
      ['deadline', 'forum.accepted', 'forum.like', 'forum.locked', 'forum.reply', 'forum.resolved', 'grade', 'inconnu'].sort(),
    );
    request.flush({});
  });

  it("n'envoie pas de préférences si l'adresse e-mail est invalide", () => {
    const fixture = open({ email: null, email_enabled: true, muted_types: [] });
    const page = fixture.componentInstance as unknown as { form: { controls: { email: { setValue: (v: string) => void } } }; save: () => void };

    page.form.controls.email.setValue('pas-un-email');
    page.save();

    http.expectNone(URL);
  });

  it('affiche une erreur avec réessai si le chargement échoue', () => {
    const fixture = TestBed.createComponent(PreferencesPage);
    http.expectOne(URL).flush({}, { status: 503, statusText: 'Service Unavailable' });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Impossible de charger vos préférences');
  });
});
