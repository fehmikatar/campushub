import EurekaPkg from 'eureka-js-client';

const Eureka = (EurekaPkg as any).Eureka ?? EurekaPkg;

export interface EurekaClient {
  getInstancesByAppId(appId: string): any[];
  start(callback: (error: unknown) => void): void;
  stop(callback: () => void): void;
}

// Shared client singleton (style Forum)
let sharedEurekaClient: EurekaClient | null = null;

export function setEurekaClient(client: EurekaClient | null): void {
  sharedEurekaClient = client;
}

export function getEurekaClient(): EurekaClient | null {
  return sharedEurekaClient;
}

export function registerWithEureka(port: number | string): EurekaClient {
  const eurekaHost = process.env.EUREKA_HOST || 'localhost';
  const eurekaPort = Number(process.env.EUREKA_PORT) || 8761;
  const instanceHost = process.env.EUREKA_INSTANCE_HOST || 'localhost';

  const client = new Eureka({
    instance: {
      app: 'course-service',
      instanceId: `course-service:${instanceHost}:${port}`,
      hostName: instanceHost,
      ipAddr: '127.0.0.1',
      port: { $: Number(port), '@enabled': true },
      vipAddress: 'course-service',
      statusPageUrl: `http://${instanceHost}:${port}/api`,
      healthCheckUrl: `http://${instanceHost}:${port}/courses`,
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
    },
  });

  client.start((error: unknown) => {
    if (error) console.error('Enregistrement Eureka impossible :', (error as Error).message || error);
    else console.log(`course-service enregistre dans Eureka (${eurekaHost}:${eurekaPort})`);
  });

  const stop = () => client.stop(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  return client;
}