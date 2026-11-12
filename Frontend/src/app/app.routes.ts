import { Routes } from '@angular/router';
import { authGuard, guestGuard, roleGuard } from './core/auth/auth.guards';

const courseWorkspace = () =>
  import('./features/courses/course-workspace').then((m) => m.CourseWorkspace);

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login').then((m) => m.Login),
  },
  {
    path: 'forbidden',
    loadComponent: () => import('./features/auth/status-page').then((m) => m.Forbidden),
  },
  {
    path: 'session-expired',
    loadComponent: () => import('./features/auth/status-page').then((m) => m.SessionExpired),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./shared/layout/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'accueil' },
      // Écrans des lots suivants : pages provisoires avec le bon contrôle d'accès.
      {
        path: 'accueil',
        loadComponent: () => import('./features/home/home-page').then((m) => m.HomePage),
      },
      {
        path: 'mes-cours',
        canActivate: [roleGuard('ETUDIANT', 'ENSEIGNANT')],
        loadComponent: courseWorkspace,
        data: { view: 'mine' },
      },
      {
        path: 'catalogue',
        canActivate: [roleGuard('ETUDIANT')],
        loadComponent: courseWorkspace,
        data: { view: 'catalogue' },
      },
      {
        path: 'courses',
        canActivate: [authGuard],
        loadChildren: () => import('./features/courses/course.routes').then((m) => m.COURSE_ROUTES),
      },
      { path: 'forum', loadComponent: () => import('./features/forum/forum-page').then((m) => m.ForumPage) },
      // « nouveau » avant « :id » pour ne pas être pris pour un identifiant de sujet.
      { path: 'forum/sujets/nouveau', loadComponent: () => import('./features/forum/new-topic-page').then((m) => m.NewTopicPage) },
      { path: 'forum/sujets/:id', loadComponent: () => import('./features/forum/topic-page').then((m) => m.TopicPage) },
      {
        path: 'quiz',
        canActivate: [authGuard],
        loadChildren: () => import('./features/evaluations/quiz.routes').then((m) => m.QUIZ_ROUTES),
      },
      {
        path: 'evaluations',
        canActivate: [authGuard],
        loadComponent: () => import('./features/evaluations/quiz-list').then((m) => m.QuizList),
        data: { history: true },
      },
      {
        path: 'notifications',
        loadComponent: () =>
          import('./features/notifications/notifications-page').then((m) => m.NotificationsPage),
      },
      {
        path: 'notifications/preferences',
        loadComponent: () =>
          import('./features/notifications/preferences-page').then((m) => m.PreferencesPage),
      },
      {
        path: 'profil',
        loadComponent: () => import('./features/profile/profile-page').then((m) => m.ProfilePage),
      },
      {
        path: 'utilisateurs',
        canActivate: [roleGuard('ADMIN')],
        loadComponent: () => import('./features/admin/users/users-page').then((m) => m.UsersPage),
      },
      {
        path: 'cours',
        canActivate: [roleGuard('ADMIN')],
        loadComponent: () =>
          import('./features/admin/courses/admin-courses-page').then((m) => m.AdminCoursesPage),
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
