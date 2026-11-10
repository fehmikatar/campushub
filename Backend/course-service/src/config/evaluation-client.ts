import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import EurekaPkg from 'eureka-js-client';

const Eureka = (EurekaPkg as any).Eureka ?? EurekaPkg;

@Injectable()
export class EvaluationClient implements OnModuleInit {
  private readonly logger = new Logger(EvaluationClient.name);
  private readonly timeout = 3000; // 3s
  private eurekaClient: any = null;
  private evaluationServiceUrl: string | null = null;

  constructor(private config: ConfigService) {}

  async onModuleInit() {
    this.initEurekaClient();
  }

  private initEurekaClient() {
    const eurekaHost = this.config.get('EUREKA_HOST') || 'localhost';
    const eurekaPort = Number(this.config.get('EUREKA_PORT')) || 8761;

    this.eurekaClient = new Eureka({
      instance: {
        app: 'course-service',
        instanceId: `course-service:${this.config.get('EUREKA_INSTANCE_HOST') || 'localhost'}:${this.config.get('PORT') || 8082}`,
        hostName: this.config.get('EUREKA_INSTANCE_HOST') || 'localhost',
        ipAddr: '127.0.0.1',
        port: { $: Number(this.config.get('PORT') || 8082), '@enabled': true },
        vipAddress: 'course-service',
        dataCenterInfo: {
          '@class': 'com.netflix.appinfo.InstanceInfo$DefaultDataCenterInfo',
          name: 'MyOwn',
        },
      },
      eureka: {
        host: eurekaHost,
        port: eurekaPort,
        servicePath: '/eureka/apps/',
        maxRetries: 5,
        requestRetryDelay: 2000,
        fetchRegistry: true,
      },
    });

    this.eurekaClient.start((error: unknown) => {
      if (error) {
        this.logger.warn(`Eureka client start failed: ${(error as Error).message}`);
      } else {
        this.logger.log(`Eureka client started for evaluation-service discovery (${eurekaHost}:${eurekaPort})`);
      }
    });
  }

  async getQuizCount(courseId: number, authHeader: string): Promise<number | null> {
    const baseUrl = await this.getBaseUrl();
    if (!baseUrl) {
      this.logger.warn('Evaluation service URL not available (no EVALUATION_SERVICE_URL, no Eureka instance)');
      return null;
    }

    const url = `${baseUrl}/api/quizzes/course/${courseId}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        if (response.status === 404) {
          // 404 from evaluation = service up but no quizzes endpoint for this course
          // Per spec: return null (not 0) since endpoint returns 200 with empty list when no quizzes
          this.logger.warn(`Evaluation service 404 for course ${courseId}`);
          return null;
        }
        this.logger.warn(`Evaluation service responded ${response.status} for course ${courseId}`);
        return null;
      }

      const quizzes = await response.json() as Array<{ id: number }>;
      return quizzes?.length ?? 0;
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        this.logger.warn(`Timeout calling evaluation service for course ${courseId}`);
      } else if (error instanceof Error && error.name === 'AbortError') {
        this.logger.warn(`Aborted calling evaluation service for course ${courseId}`);
      } else {
        this.logger.warn(`Error calling evaluation service for course ${courseId}: ${error}`);
      }
      return null;
    }
  }

  private async getBaseUrl(): Promise<string | null> {
    // 1. Variable d'environnement pour Docker (priorité haute)
    const envUrl = this.config.get<string>('EVALUATION_SERVICE_URL');
    if (envUrl?.trim()) return envUrl.replace(/\/$/, '');

    // 2. Eureka discovery
    if (this.eurekaClient) {
      try {
        const instances = this.eurekaClient.getInstancesByAppId('EVALUATION-SERVICE');
        if (instances && instances.length > 0) {
          const instance = instances[0];
          const host = instance.hostName || instance.ipAddr;
          const port = instance.port?.$ || 8084;
          const url = `http://${host}:${port}`;
          this.logger.log(`Found evaluation-service via Eureka: ${url}`);
          return url;
        }
      } catch (error) {
        this.logger.warn(`Eureka lookup failed: ${error}`);
      }
    }

    this.logger.warn('Evaluation service not found in Eureka and no EVALUATION_SERVICE_URL configured');
    return null;
  }

  async onModuleDestroy() {
    if (this.eurekaClient) {
      this.eurekaClient.stop();
    }
  }
}