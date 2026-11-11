import { AuthService } from '../../core/auth/auth.service';
import { InjectionToken, inject, Injectable } from '@angular/core';
import { CampusRole, Course } from './course.models';
// Integration point: the host login can provide its own current-token getter.
export const COURSE_ACCESS_TOKEN = new InjectionToken<() => string | null>('COURSE_ACCESS_TOKEN', {
  providedIn: 'root',
  factory: () => {
    const auth = inject(AuthService);
    return () => auth.accessToken();
  },
});
@Injectable({ providedIn: 'root' })
export class CourseSession {
  readonly token = inject(COURSE_ACCESS_TOKEN);
  get user(): { id: string; name: string; role: CampusRole | null } {
    try {
      const part = this.token()!.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const data = JSON.parse(
        new TextDecoder().decode(
          Uint8Array.from(atob(part.padEnd(Math.ceil(part.length / 4) * 4, '=')), (c) =>
            c.charCodeAt(0),
          ),
        ),
      );
      const roles: string[] = data.realm_access?.roles ?? [];
      const role =
        (['ADMIN', 'ENSEIGNANT', 'ETUDIANT'] as CampusRole[]).find((r) => roles.includes(r)) ??
        null;
      return {
        id: data.sub,
        name:
          [data.given_name, data.family_name].filter(Boolean).join(' ') ||
          data.preferred_username ||
          'Mon espace',
        role,
      };
    } catch {
      return { id: '', name: 'Mon espace', role: null };
    }
  }
  get canTeach() {
    return this.user.role === 'ENSEIGNANT' || this.user.role === 'ADMIN';
  }
  canEdit(course: Course) {
    return (
      this.user.role === 'ADMIN' ||
      (this.user.role === 'ENSEIGNANT' && course.formateurId === this.user.id)
    );
  }
}
