<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;

/**
 * Client minimal de l'API REST d'Eureka (équivalent de config/eureka.js du forum-service).
 */
class EurekaClient
{
    public const APP = 'NOTIFICATION-SERVICE';

    public function instanceId(): string
    {
        return "notification-service:{$this->config('instance_host')}:{$this->config('service_port')}";
    }

    public function register(): bool
    {
        $host = $this->config('instance_host');
        $port = (int) $this->config('service_port');

        try {
            return Http::timeout(5)->post("{$this->baseUrl()}/".self::APP, ['instance' => [
                'instanceId' => $this->instanceId(),
                'hostName' => $host,
                'app' => self::APP,
                'ipAddr' => '127.0.0.1',
                'vipAddress' => 'notification-service',
                'status' => 'UP',
                'port' => ['$' => $port, '@enabled' => 'true'],
                'statusPageUrl' => "http://$host:$port/up",
                'healthCheckUrl' => "http://$host:$port/up",
                'dataCenterInfo' => [
                    '@class' => 'com.netflix.appinfo.InstanceInfo$DefaultDataCenterInfo',
                    'name' => 'MyOwn',
                ],
            ]])->successful();
        } catch (\Throwable) {
            return false;
        }
    }

    /** Signal de vie ; renvoie le code HTTP (404 = Eureka ne nous connaît plus). */
    public function heartbeat(): int
    {
        return Http::timeout(5)->put("{$this->baseUrl()}/".self::APP.'/'.$this->instanceId())->status();
    }

    /**
     * Adresse (http://hôte:port) d'une instance UP du service demandé, ou null si Eureka ne la connaît pas.
     *
     * @throws \Illuminate\Http\Client\ConnectionException si Eureka est injoignable
     */
    public function instanceUrl(string $app): ?string
    {
        $response = Http::timeout(3)->acceptJson()->get("{$this->baseUrl()}/".strtoupper($app));
        if (! $response->successful()) {
            return null;
        }

        $instances = $response->json('application.instance') ?? [];
        if (isset($instances['hostName'])) {
            $instances = [$instances]; // une seule instance : Eureka renvoie un objet et non une liste
        }

        foreach ($instances as $instance) {
            $port = $instance['port']['$'] ?? null;
            if (($instance['status'] ?? null) === 'UP' && ! empty($instance['hostName']) && $port) {
                return "http://{$instance['hostName']}:$port";
            }
        }

        return null;
    }

    public function address(): string
    {
        return "{$this->config('host')}:{$this->config('port')}";
    }

    private function baseUrl(): string
    {
        return "http://{$this->address()}/eureka/apps";
    }

    private function config(string $key): mixed
    {
        return config("services.eureka.$key");
    }
}
