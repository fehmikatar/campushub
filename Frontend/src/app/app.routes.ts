import { Routes } from '@angular/router';
import { authGuard, guestGuard, roleGuard } from './core/auth/auth.guards';

const placeholder = () => import('./features/placeholder/placeholder').then((m) => m.Placeholder);

export const routes: Routes = [
  { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./features/auth/login').then((m) => m.Login) },
  { path: 'forbidden', loadComponent: () => import('./features/auth/status-page').then((m) => m.Forbidden) },
  { path: 'session-expired', loadComponent: () => import('./features/auth/status-page').then((m) => m.SessionExpired) },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./shared/layout/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'accueil' },
      // Écrans des lots suivants : pages provisoires avec le bon contrôle d'accès.
      { path: 'accueil', loadComponent: () => import('./features/home/home-page').then((m) => m.HomePage) },
      {
        path: 'mes-cours',
        canActivate: [roleGuard('ETUDIANT', 'ENSEIGNANT')],
        loadComponent: placeholder,
        data: { title: 'Mes cours' },
      },
      { path: 'catalogue', canActivate: [roleGuard('ETUDIANT')], loadComponent: placeholder, data: { title: 'Catalogue' } },
      { path: 'forum', loadComponent: placeholder, data: { title: 'Forum' } },
      {
        path: 'evaluations',
        canActivate: [roleGuard('ETUDIANT', 'ENSEIGNANT')],
        loadComponent: placeholder,
        data: { title: 'Évaluations' },
      },
      {
        path: 'notifications',
        loadComponent: () => import('./features/notifications/notifications-page').then((m) => m.NotificationsPage),
      },
      {
        path: 'notifications/preferences',
        loadComponent: () => import('./features/notifications/preferences-page').then((m) => m.PreferencesPage),
      },
      {
        path: 'utilisateurs',
        canActivate: [roleGuard('ADMIN')],
        loadComponent: () => import('./features/admin/users/users-page').then((m) => m.UsersPage),
      },
      {
        path: 'cours',
        canActivate: [roleGuard('ADMIN')],
        loadComponent: () => import('./features/admin/courses/admin-courses-page').then((m) => m.AdminCoursesPage),
      },
      {
        path: 'categories',
        canActivate: [roleGuard('ADMIN')],
        loadComponent: () =>
          import('./features/admin/forum-categories/categories-page').then((m) => m.CategoriesPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
