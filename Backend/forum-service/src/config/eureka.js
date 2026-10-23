const { Eureka } = require('eureka-js-client');

function registerWithEureka({ port }) {
  const eurekaHost = process.env.EUREKA_HOST || 'localhost';
  const eurekaPort = Number(process.env.EUREKA_PORT) || 8761;
  const instanceHost = process.env.EUREKA_INSTANCE_HOST || 'localhost';

  const client = new Eureka({
    instance: {
      app: 'forum-service',
      instanceId: `forum-service:${instanceHost}:${port}`,
      hostName: instanceHost,
      ipAddr: '127.0.0.1',
      port: { $: Number(port), '@enabled': true },
      vipAddress: 'forum-service',
      statusPageUrl: `http://${instanceHost}:${port}/health`,
      healthCheckUrl: `http://${instanceHost}:${port}/health`,
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

  client.start((error) => {
    if (error) console.error('Enregistrement Eureka impossible :', error.message || error);
    else console.log(`forum-service enregistré dans Eureka (${eurekaHost}:${eurekaPort})`);
  });

  const stop = () => client.stop(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  return client;
}

module.exports = registerWithEureka;