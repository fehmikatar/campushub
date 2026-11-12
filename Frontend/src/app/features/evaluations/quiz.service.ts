import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AppConfig } from '../../core/config/app-config';
import { Quiz, QuizAttempt, QuizInput, QuizResult, QuizSubmission } from './quiz.models';
@Injectable({ providedIn: 'root' })
export class QuizService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfig);
  private get base() {
    return this.config.apiUrl + '/api/v1/evaluation';
  }
  list(courseId: number) {
    return this.http.get<Quiz[]>(`${this.base}/quizzes/course/${courseId}`);
  }
  get(id: number) {
    return this.http.get<Quiz>(`${this.base}/quizzes/${id}`);
  }
  create(body: QuizInput) {
    return this.http.post<Quiz>(`${this.base}/quizzes`, body);
  }
  update(id: number, body: QuizInput) {
    return this.http.put<void>(`${this.base}/quizzes/${id}`, body);
  }
  remove(id: number) {
    return this.http.delete<void>(`${this.base}/quizzes/${id}`);
  }
  start(id: number) {
    return this.http.post<QuizAttempt>(`${this.base}/quizzes/${id}/start`, {});
  }
  submit(id: number, body: QuizSubmission) {
    return this.http.post<QuizResult>(`${this.base}/quizzes/${id}/submit`, body);
  }
  mine() {
    return this.http.get<QuizResult[]>(`${this.base}/resultats/me`);
  }
  results(id: number) {
    return this.http.get<QuizResult[]>(`${this.base}/resultats/quiz/${id}`);
  }
  result(id: number) {
    return this.http.get<QuizResult>(`${this.base}/resultats/${id}`);
  }
}
