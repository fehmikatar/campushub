/** Valeurs exactes de l'API du service de réclamations (Django, MongoDB). */
export type Category = 'grade' | 'exam' | 'absence' | 'registration' | 'internship' | 'administrative' | 'other';
export type Status = 'new' | 'in_progress' | 'resolved' | 'rejected';
export type Priority = 'low' | 'normal' | 'high';

export interface HistoryEntry {
  from_status: Status | null;
  to_status: Status;
  by_username: string;
  comment: string;
  at: string;
}

export interface Reclamation {
  id: string;
  /** REC-2026-00001 : attribué par le serveur. */
  reference: string;
  author_username: string;
  category: Category;
  subject: string;
  description: string;
  module: string;
  academic_year: string;
  status: Status;
  priority: Priority;
  admin_response: string;
  history: HistoryEntry[];
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

/** Pagination DRF (20 par page). */
export interface PageOf<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface ReclamationFilters {
  status?: Status;
  category?: Category;
  priority?: Priority;
  academic_year?: string;
  search?: string;
  ordering?: Ordering;
  page?: number;
}

export type Ordering = '-created_at' | 'created_at' | '-updated_at' | '-priority';

/** Champs que l'étudiant peut écrire : auteur, référence, statut, priorité et réponse viennent du serveur. */
export interface ReclamationInput {
  category: Category;
  subject: string;
  description: string;
  module: string;
  academic_year?: string;
}

export interface StatusChange {
  status: Status;
  priority?: Priority;
  comment?: string;
  admin_response?: string;
}

export interface Stats {
  academic_year: string | null;
  total: number;
  by_status: Record<Status, number>;
  by_category: Record<Category, number>;
  by_priority: Record<Priority, number>;
}

// ---- libellés et règles d'affichage (le serveur reste l'autorité) ----

export const CATEGORIES: readonly Category[] = ['grade', 'exam', 'absence', 'registration', 'internship', 'administrative', 'other'];
export const STATUSES: readonly Status[] = ['new', 'in_progress', 'resolved', 'rejected'];
export const PRIORITIES: readonly Priority[] = ['low', 'normal', 'high'];

export const CATEGORY_LABELS: Record<Category, string> = {
  grade: 'Note',
  exam: 'Examen',
  absence: 'Absence',
  registration: 'Inscription',
  internship: 'Stage / PFE',
  administrative: 'Administratif',
  other: 'Autre',
};

export const STATUS_LABELS: Record<Status, string> = {
  new: 'Nouvelle',
  in_progress: 'En cours',
  resolved: 'Résolue',
  rejected: 'Rejetée',
};

/** Classe de la pastille (voir `.pill` dans styles.scss). */
export const STATUS_TONES: Record<Status, string> = {
  new: 'info',
  in_progress: 'warning',
  resolved: 'success',
  rejected: 'danger',
};

export const PRIORITY_LABELS: Record<Priority, string> = { low: 'Faible', normal: 'Normale', high: 'Haute' };
export const PRIORITY_TONES: Record<Priority, string> = { low: '', normal: 'info', high: 'danger' };

export const ORDERING_LABELS: Record<Ordering, string> = {
  '-created_at': 'Plus récentes',
  created_at: 'Plus anciennes',
  '-updated_at': 'Dernière modification',
  '-priority': 'Priorité',
};

/** Transitions autorisées (identiques à celles du service). Résolue et Rejetée sont définitives. */
export const TRANSITIONS: Record<Status, readonly Status[]> = {
  new: ['in_progress', 'rejected'],
  in_progress: ['resolved', 'rejected'],
  resolved: [],
  rejected: [],
};

export const isFinal = (status: Status): boolean => TRANSITIONS[status].length === 0;

export const SUBJECT_MIN = 5;
export const SUBJECT_MAX = 150;
export const DESCRIPTION_MIN = 20;
export const DESCRIPTION_MAX = 5000;
export const MODULE_MAX = 100;
export const COMMENT_MAX = 1000;
export const RESPONSE_MAX = 5000;

/** Année universitaire en cours (septembre à août), au format du service : 2026-2027. */
export function currentAcademicYear(now: Date = new Date()): string {
  const start = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}-${start + 1}`;
}

/** Années proposées dans les filtres : l'année en cours et les deux précédentes. */
export function academicYears(now: Date = new Date()): string[] {
  const current = Number(currentAcademicYear(now).slice(0, 4));
  return [0, 1, 2].map((offset) => `${current - offset}-${current - offset + 1}`);
}
