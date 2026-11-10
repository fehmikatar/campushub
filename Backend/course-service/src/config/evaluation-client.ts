import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import fetch from 'node-fetch';

@Injectable()
export class EvaluationClient {
  private readonly logger = new Logger(EvaluationClient.name);
  private readonly timeout = 3000; // 3s

  constructor(private config: ConfigService) {}

  async getQuizCount(courseId: number, authHeader: string): Promise<number | null> {
    // 1. EVALUATION_SERVICE_URL (Docker) ou Eureka
    const baseUrl = this.getBaseUrl();
    if (!baseUrl) {
      this.logger.warn('Evaluation service URL non configurée (ni EVALUATION_SERVICE_URL, ni Eureka)');
      return null;
    }

    const url = `${baseUrl}/api/quizzes/course/${courseId}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 404) return 0;
        this.logger.warn(`Evaluation service responded ${response.status} for course ${courseId}`);
        return null;
      }

      const quizzes = await response.json() as Array<{ id: number }>;
      return quizzes?.length ?? 0;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        this.logger.warn(`Timeout calling evaluation service for course ${courseId}`);
      } else {
        this.logger.warn(`Error calling evaluation service for course ${courseId}: ${error}`);
      }
      return null;
    }
  }

  private getBaseUrl(): string | null {
    // 1. Variable d'environnement pour Docker
    const envUrl = this.config.get<string>('EVALUATION_SERVICE_URL');
    if (envUrl?.trim()) return envUrl.replace(/\/$/, '');

    // 2. Eureka - pour l'instant on retourne null car Eureka n'est pas dispo en local
    // TODO: Implémenter la découverte Eureka quand Eureka est disponible
    return null;
  }
}