export type CourseStatus = 'BROUILLON' | 'PUBLIE' | 'ARCHIVE';
export type CampusRole = 'ETUDIANT' | 'ENSEIGNANT' | 'ADMIN';
export interface Chapter {
  id: number;
  coursId: number;
  titre: string;
  contenu: string | null;
  ordre: number;
  visible: boolean;
  telechargementAutorise: boolean;
  pdfNom: string | null;
  pdfTaille: number | null;
}
export interface Course {
  id: number;
  titre: string;
  description: string | null;
  categorie: string | null;
  statut: CourseStatus;
  imageUrl: string | null;
  formateurId: string;
  nbChapitres?: number;
  chapitres?: Chapter[];
}
export interface PaginatedCourses {
  data: Course[];
  total: number;
  page: number;
  limit: number;
}
export interface CourseInput {
  titre: string;
  description?: string;
  categorie?: string;
}
export interface ChapterInput {
  titre: string;
  contenu?: string;
  visible: boolean;
  telechargementAutorise: boolean;
}
