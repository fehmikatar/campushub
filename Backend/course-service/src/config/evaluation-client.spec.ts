import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { vi, describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { EvaluationClient } from './evaluation-client.js';
import { setEurekaClient, getEurekaClient, EurekaClient } from './eureka.js';

describe('EvaluationClient', () => {
  let client: EvaluationClient;
  let module: TestingModule;
  let mockConfig: Partial<ConfigService>;

  const originalFetch = global.fetch;

  beforeAll(() => {
    global.fetch = vi.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    (global.fetch as vi.Mock).mockReset();
    // Reset shared Eureka client before each test
    setEurekaClient(null);

    mockConfig = {
      get: vi.fn((key: string) => {
        const values: Record<string, string | undefined> = {
          EUREKA_HOST: 'localhost',
          EUREKA_PORT: '8761',
          EUREKA_INSTANCE_HOST: 'localhost',
          PORT: '8082',
          EUREKA_ENABLED: 'true',
          EVALUATION_SERVICE_URL: undefined,
        };
        return values[key];
      }),
    };

    module = await Test.createTestingModule({
      providers: [
        EvaluationClient,
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    client = module.get<EvaluationClient>(EvaluationClient);
    // Mock getBaseUrl to return a test URL so we don't need Eureka
    vi.spyOn(client as any, 'getBaseUrl').mockResolvedValue('http://localhost:8084');
  });

  afterEach(async () => {
    await module.close();
    // Reset shared Eureka client after each test
    setEurekaClient(null);
  });

  describe('getQuizCount', () => {
    const authHeader = 'Bearer test-token';
    const courseId = 42;

    it('returns quiz count on 200 with quizzes', async () => {
      (global.fetch as vi.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 1 }, { id: 2 }, { id: 3 }],
      });

      const result = await client.getQuizCount(42, 'Bearer token');

      expect(result).toBe(3);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/quizzes/course/42'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer token',
            'Content-Type': 'application/json',
          }),
          signal: expect.any(AbortSignal),
        })
      );
    });

    it('returns 0 on 200 with empty quiz list', async () => {
      (global.fetch as vi.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const result = await client.getQuizCount(42, 'Bearer token');

      expect(result).toBe(0);
    });

    it('returns null on 404 (per spec: 404 -> null, not 0)', async () => {
      (global.fetch as vi.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await client.getQuizCount(42, 'Bearer token');

      expect(result).toBeNull();
    });

    it('returns null on 500', async () => {
      (global.fetch as vi.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await client.getQuizCount(42, 'Bearer token');

      expect(result).toBeNull();
    });

    it('returns null on timeout', async () => {
      (global.fetch as vi.Mock).mockRejectedValueOnce(new Error('TimeoutError'));

      const result = await client.getQuizCount(42, 'Bearer token');

      expect(result).toBeNull();
    });

    it('returns null on network error (service unreachable)', async () => {
      (global.fetch as vi.Mock).mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const result = await client.getQuizCount(42, 'Bearer token');

      expect(result).toBeNull();
    });

    it('transmits Authorization header', async () => {
      (global.fetch as vi.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const testToken = 'Bearer eyJhbGciOiJIUzI1NiJ9.test';
      await client.getQuizCount(42, testToken);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: testToken,
          }),
        })
      );
    });

    it('uses AbortSignal.timeout(3000)', async () => {
      (global.fetch as vi.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      await client.getQuizCount(42, 'Bearer token');

      const call = (global.fetch as vi.Mock).mock.calls[0];
      const options = call[1];
      expect(options.signal).toBeInstanceOf(AbortSignal);
    });
  });

  describe('getBaseUrl', () => {
    it('uses EVALUATION_SERVICE_URL env var when set', async () => {
      const customConfig = {
        ...mockConfig,
        get: vi.fn((key: string) => {
          if (key === 'EVALUATION_SERVICE_URL') return 'http://custom-eval:8084';
          return mockConfig.get!(key);
        }),
      };

      const customModule = await Test.createTestingModule({
        providers: [
          EvaluationClient,
          { provide: ConfigService, useValue: customConfig },
        ],
      }).compile();

      const customClient = customModule.get<EvaluationClient>(EvaluationClient);
      const baseUrl = await (customClient as any).getBaseUrl();
      expect(baseUrl).toBe('http://custom-eval:8084');

      await customModule.close();
    });

    it('returns null when no EVALUATION_SERVICE_URL and no Eureka', async () => {
      const noEurekaConfig = {
        ...mockConfig,
        get: vi.fn((key: string) => {
          if (key === 'EUREKA_HOST') return undefined;
          return mockConfig.get!(key);
        }),
      };

      const noEurekaModule = await Test.createTestingModule({
        providers: [
          EvaluationClient,
          { provide: ConfigService, useValue: noEurekaConfig },
        ],
      }).compile();

      const noEurekaClient = noEurekaModule.get<EvaluationClient>(EvaluationClient);
      const baseUrl = await (noEurekaClient as any).getBaseUrl();
      expect(baseUrl).toBeNull();

      await noEurekaModule.close();
    });

    it('uses fake Eureka client getInstancesByAppId to discover evaluation-service', async () => {
      // Create a fake Eureka client
      const fakeEurekaClient = {
        getInstancesByAppId: vi.fn().mockReturnValue([
          {
            hostName: 'eval-host',
            ipAddr: '10.0.0.1',
            port: { $: 8084 },
          },
        ]),
      };

      // Set the fake Eureka client
      setEurekaClient(fakeEurekaClient as any);

      // Create a fresh client with the fake Eureka client
      const testModule = await Test.createTestingModule({
        providers: [
          EvaluationClient,
          { provide: ConfigService, useValue: mockConfig },
        ],
      }).compile();

      const testClient = testModule.get<EvaluationClient>(EvaluationClient);
      const baseUrl = await (testClient as any).getBaseUrl();

      // Verify the fake Eureka client was used
      expect(fakeEurekaClient.getInstancesByAppId).toHaveBeenCalledWith('EVALUATION-SERVICE');
      expect(baseUrl).toBe('http://eval-host:8084');

      await testModule.close();
    });
  });
});