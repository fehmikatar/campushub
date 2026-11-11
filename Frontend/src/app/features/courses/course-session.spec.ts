import { AuthService } from '../../core/auth/auth.service';
import { TestBed } from '@angular/core/testing';
import { COURSE_ACCESS_TOKEN, CourseSession } from './course-session';
import { Course } from './course.models';
describe('Course permissions from the existing session', () => {
  function session(roles: string[]) {
    const token =
      'header.' +
      btoa(JSON.stringify({ sub: 'teacher-1', realm_access: { roles } })) +
      '.signature';
    TestBed.configureTestingModule({
      providers: [{ provide: COURSE_ACCESS_TOKEN, useValue: () => token }],
    });
    return TestBed.inject(CourseSession);
  }
  it('restricts a teacher to their own courses', () => {
    const user = session(['offline_access', 'ENSEIGNANT']);
    expect(user.canEdit({ formateurId: 'teacher-1' } as Course)).toBe(true);
    expect(user.canEdit({ formateurId: 'teacher-2' } as Course)).toBe(false);
  });
  it('prioritizes ADMIN over other roles', () => {
    const user = session(['ETUDIANT', 'ENSEIGNANT', 'ADMIN']);
    expect(user.user.role).toBe('ADMIN');
    expect(user.canEdit({ formateurId: 'other' } as Course)).toBe(true);
  });
  it('does not give students course editing controls', () => {
    const user = session(['ETUDIANT']);
    expect(user.canTeach).toBe(false);
    expect(user.canEdit({ formateurId: 'teacher-1' } as Course)).toBe(false);
  });
  it('ignores unrelated realm roles', () => {
    const user = session(['offline_access']);
    expect(user.user.role).toBeNull();
  });
  it('uses the main login token and follows its refresh without a second storage', () => {
    let accessToken = 'initial-token';
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: { accessToken: () => accessToken } }] });
    const user = TestBed.inject(CourseSession);
    expect(user.token()).toBe('initial-token');
    accessToken = 'renewed-token';
    expect(user.token()).toBe('renewed-token');
  });
});
