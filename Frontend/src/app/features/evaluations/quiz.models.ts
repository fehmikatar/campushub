export interface QuizAnswer {
  id: number;
  texte: string;
}
export interface QuizQuestion {
  id: number;
  texte: string;
  reponses: QuizAnswer[];
}
export interface Quiz {
  id: number;
  titre: string;
  courseId: number;
  maxTentatives: number;
  dureeMinutes: number | null;
  questions: QuizQuestion[];
}
export interface QuizInput {
  titre: string;
  courseId: number;
  maxTentatives: number;
  dureeMinutes: number | null;
  questions: { texte: string; reponses: { texte: string; estCorrecte: boolean }[] }[];
}
export interface QuizAttempt {
  id: number;
  quizId: number;
  etudiantId: string;
  debutUtc: string;
  limiteUtc: string | null;
}
export interface QuizSubmission {
  reponses: { questionId: number; reponseId: number }[];
}
export interface QuizResult {
  id: number;
  quizId: number;
  etudiantId: string;
  score: number;
  datePassage: string;
}
export interface QuizFieldError {
  field: string;
  message: string;
}
