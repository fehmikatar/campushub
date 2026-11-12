/** Formes du service d'inscriptions d'Oussama (Django, via la Gateway : `/api/v1/enrollments`). */

export interface Progression {
  id: number;
  /** Identifiant de l'inscription. */
  inscription: number;
  /** De 0 à 100. */
  pourcentage: number;
}

export interface Enrollment {
  id: number;
  /** `sub` Keycloak de l'étudiant (UUID). */
  etudiant_id: string;
  /** Identifiant du cours (texte côté inscriptions, nombre côté Course Service). */
  cours_id: string;
  /** Date au format AAAA-MM-JJ. */
  date_inscription: string;
  progression: Progression | null;
}

export interface EnrollmentFilters {
  coursId?: string | number;
  /** Réservé à l'enseignant et à l'administrateur. */
  etudiantId?: string;
}

/** Pourcentage de progression d'une inscription (0 si aucune progression n'est enregistrée). */
export const percentOf = (enrollment: Pick<Enrollment, 'progression'>): number =>
  Math.min(100, Math.max(0, Math.round(enrollment.progression?.pourcentage ?? 0)));

/** Pourcentage de chapitres lus, arrondi, borné entre 0 et 100 (0 si le cours n'a aucun chapitre). */
export const percentRead = (read: number, total: number): number =>
  total <= 0 ? 0 : Math.min(100, Math.max(0, Math.round((read / total) * 100)));
