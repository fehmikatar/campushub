import { Routes } from '@angular/router';
import { authGuard, roleGuard } from '../../core/auth/auth.guards';
export const QUIZ_ROUTES: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./quiz-list').then((m) => m.QuizList),
  },
  {
    path: 'new',
    canActivate: [authGuard, roleGuard('ENSEIGNANT', 'ADMIN')],
    loadComponent: () => import('./quiz-editor').then((m) => m.QuizEditor),
  },
  {
    path: ':id/edit',
    canActivate: [authGuard, roleGuard('ENSEIGNANT', 'ADMIN')],
    loadComponent: () => import('./quiz-editor').then((m) => m.QuizEditor),
  },
  {
    path: ':id/play',
    canActivate: [authGuard, roleGuard('ETUDIANT')],
    canDeactivate: [(component: { canLeave: () => boolean }) => component.canLeave()],
    loadComponent: () => import('./quiz-player').then((m) => m.QuizPlayer),
  },
  {
    path: ':id/results',
    canActivate: [authGuard, roleGuard('ENSEIGNANT', 'ADMIN')],
    loadComponent: () => import('./quiz-results').then((m) => m.QuizResults),
  },
  {
    path: 'result/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./quiz-results').then((m) => m.QuizResults),
  },
];
