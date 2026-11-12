import { TestBed } from '@angular/core/testing';
import { CanActivateFn, Router, provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { QUIZ_ROUTES } from './quiz.routes';
import { MENUS } from '../../shared/layout/menu';
import { FormControl } from '@angular/forms';
import { oneCorrect } from './quiz-editor';
describe('Quiz access and corrections', () => {
  it('places Quiz directly above Notifications for all three roles', () => {
    for (const menu of Object.values(MENUS)) {
      const i = menu.findIndex((m) => m.path === '/quiz');
      expect(i).toBeGreaterThan(-1);
      expect(menu[i + 1].path).toBe('/notifications');
    }
  });
  it('denies students the real creation route guard', () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { user: () => ({ role: 'ETUDIANT' }) } },
      ],
    });
    const guard = QUIZ_ROUTES.find((r) => r.path === 'new')!.canActivate![1] as CanActivateFn;
    const decision = TestBed.runInInjectionContext(() => guard({} as never, {} as never));
    expect(TestBed.inject(Router).serializeUrl(decision as never)).toBe('/forbidden');
  });
  it('requires exactly one correct answer', () => {
    expect(oneCorrect(new FormControl([{ estCorrecte: false }, { estCorrecte: false }]))).toEqual({
      oneCorrect: true,
    });
    expect(oneCorrect(new FormControl([{ estCorrecte: true }, { estCorrecte: true }]))).toEqual({
      oneCorrect: true,
    });
    expect(oneCorrect(new FormControl([{ estCorrecte: true }, { estCorrecte: false }]))).toBeNull();
  });
});
