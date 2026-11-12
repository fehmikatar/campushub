import { Observable, catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { Course } from '../courses/course.models';
import { CourseService } from '../courses/course.service';
import { Enrollment, percentOf } from './enrollment.model';
import { EnrollmentsService } from './enrollments.service';

export interface EnrolledCourse {
  enrollment: Enrollment;
  /** null : cours supprimé, archivé ou illisible (404) : l'inscription reste affichée. */
  course: Course | null;
  percent: number;
}

/**
 * Inscriptions de l'étudiant avec le cours de chacune. Une requête par cours ; un cours illisible n'empêche pas
 * d'afficher les autres. L'erreur de la liste d'inscriptions, elle, est propagée.
 */
export function loadEnrolledCourses(enrollments: EnrollmentsService, courses: CourseService): Observable<EnrolledCourse[]> {
  return enrollments.list().pipe(
    switchMap((list) =>
      list.length === 0
        ? of<EnrolledCourse[]>([])
        : forkJoin(list.map((enrollment) => courses.get(Number(enrollment.cours_id)).pipe(catchError(() => of(null))))).pipe(
            map((found) => list.map((enrollment, index) => ({ enrollment, course: found[index], percent: percentOf(enrollment) }))),
          ),
    ),
  );
}
