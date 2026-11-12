import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { AppConfig } from '../../core/config/app-config';
import { Chapter, ChapterInput, Course, CourseInput, PaginatedCourses } from './course.models';
import { CourseSession } from './course-session';
@Injectable({ providedIn: 'root' })
export class CourseService {
  private http = inject(HttpClient);
  private session = inject(CourseSession);
  private readonly config = inject(AppConfig);
  private get base() {
    return this.config.apiUrl + '/api/v1/courses';
  }
  private get options() {
    const token = this.session.token();
    return {
      headers: token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders(),
    };
  }
  list(query: Record<string, string | number>) {
    return this.http.get<PaginatedCourses>(this.base, {
      ...this.options,
      params: new HttpParams({ fromObject: query }),
    });
  }
  categories() {
    return this.http.get<string[]>(this.base + '/categories', this.options);
  }
  get(id: number) {
    return this.http.get<Course>(`${this.base}/${id}`, this.options);
  }
  save(id: number | null, body: CourseInput) {
    return id
      ? this.http.put<Course>(`${this.base}/${id}`, body, this.options)
      : this.http.post<Course>(this.base, body, this.options);
  }
  action(id: number, action: 'publish' | 'archive') {
    return this.http.patch<Course>(`${this.base}/${id}/${action}`, {}, this.options);
  }
  remove(id: number) {
    return this.http.delete<void>(`${this.base}/${id}`, this.options);
  }
  image(id: number, file: File) {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<Course>(`${this.base}/${id}/image`, body, this.options);
  }
  removeImage(id: number) {
    return this.http.delete<Course>(`${this.base}/${id}/image`, this.options);
  }
  saveChapter(courseId: number, id: number | null, body: ChapterInput) {
    const url = `${this.base}/${courseId}/chapters`;
    return id
      ? this.http.put<Chapter>(`${url}/${id}`, body, this.options)
      : this.http.post<Chapter>(url, body, this.options);
  }
  removeChapter(courseId: number, id: number) {
    return this.http.delete<void>(`${this.base}/${courseId}/chapters/${id}`, this.options);
  }
  reorder(courseId: number, ids: number[]) {
    return this.http.patch<Chapter[]>(
      `${this.base}/${courseId}/chapters/reorder`,
      { ids },
      this.options,
    );
  }
  pdf(courseId: number, id: number, download: boolean) {
    return this.http.get(`${this.base}/${courseId}/chapters/${id}/pdf`, {
      ...this.options,
      params: { download },
      responseType: 'blob',
    });
  }
  uploadPdf(courseId: number, id: number, file: File) {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<Chapter>(
      `${this.base}/${courseId}/chapters/${id}/pdf`,
      body,
      this.options,
    );
  }
  removePdf(courseId: number, id: number) {
    return this.http.delete<Chapter>(`${this.base}/${courseId}/chapters/${id}/pdf`, this.options);
  }
  imageUrl(value: string | null) {
    if (!value) return '';
    return value.startsWith('/uploads/')
      ? this.config.apiUrl + value
      : /^https?:\/\//.test(value)
        ? value
        : '';
  }
}
