import { roleGuard } from '../../core/auth/auth.guards';
import { Routes } from '@angular/router';
import { CourseWorkspace } from './course-workspace';
export const COURSE_ROUTES: Routes = [
  { path: '', component: CourseWorkspace, data: { view: 'catalogue' } },
  { path: 'mine', component: CourseWorkspace, data: { view: 'mine' } },
  { path: 'new', canActivate: [roleGuard('ENSEIGNANT', 'ADMIN')], component: CourseWorkspace, data: { view: 'edit' } },
  { path: ':id/edit', canActivate: [roleGuard('ENSEIGNANT', 'ADMIN')], component: CourseWorkspace, data: { view: 'edit' } },
  { path: ':id/chapters', canActivate: [roleGuard('ENSEIGNANT', 'ADMIN')], component: CourseWorkspace, data: { view: 'chapters' } },
  { path: ':id/chapters/:chapterId', component: CourseWorkspace, data: { view: 'read' } },
  { path: ':id', component: CourseWorkspace, data: { view: 'detail' } },
];
