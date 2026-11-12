import { Routes } from '@angular/router';

export const FORUM_ROUTES: Routes = [
  { path: '', pathMatch: 'full', loadComponent: () => import('./forum-home').then((m) => m.ForumHome) },
  {
    path: 'cours/:courseId',
    pathMatch: 'full',
    loadComponent: () => import('./topic-list').then((m) => m.TopicList),
  },
  {
    path: 'cours/:courseId/nouveau',
    loadComponent: () => import('./new-topic').then((m) => m.NewTopic),
  },
  {
    path: 'sujets/:topicId',
    loadComponent: () => import('./topic-detail').then((m) => m.TopicDetail),
  },
];
