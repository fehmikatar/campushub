import { Component, inject } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { AdminDashboard } from '../admin/dashboard/admin-dashboard';
import { StudentDashboard } from '../dashboard/student-dashboard';
import { TeacherDashboard } from '../dashboard/teacher-dashboard';

/** Accueil : le tableau de bord du rôle de l'utilisateur (écrans 31, 32 et 33). */
@Component({
  selector: 'app-home-page',
  imports: [AdminDashboard, StudentDashboard, TeacherDashboard],
  template: `
    @switch (user()?.role) {
      @case ('ADMIN') {
        <app-admin-dashboard />
      }
      @case ('ENSEIGNANT') {
        <app-teacher-dashboard />
      }
      @default {
        <app-student-dashboard />
      }
    }
  `,
})
export class HomePage {
  protected readonly user = inject(AuthService).user;
}
