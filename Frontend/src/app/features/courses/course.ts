export type CourseStatus = 'BROUILLON' | 'PUBLIE' | 'ARCHIVE';

/** Cours en liste (course-service). `nbChapitres` n'existe qu'en liste ; `formateurId` est le `sub` du formateur. */
export interface Course {
  id: number;
  titre: string;
  description: string;
  categorie: string;
  statut: CourseStatus;
  imageUrl: string | null;
  formateurId: string;
  nbChapitres: number;
  createdAt: string;
  updatedAt: string;
}

export interface CoursePage {
  data: Course[];
  total: number;
  page: number;
  limit: number;
}

export interface CourseFilters {
  statut?: CourseStatus;
  categorie?: string;
  page?: number;
  limit?: number;
}

export const STATUS_LABELS: Record<CourseStatus, string> = {
  BROUILLON: 'Brouillon',
  PUBLIE: 'Publié',
  ARCHIVE: 'Archivé',
};

/** Classe de la pastille (voir `.pill` dans styles.scss). */
export const STATUS_TONES: Record<CourseStatus, string> = {
  BROUILLON: 'warning',
  PUBLIE: 'success',
  ARCHIVE: '',
};
