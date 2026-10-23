<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;

/**
 * Enregistre le service dans Eureka puis envoie un signal de vie toutes les 30 s.
 * À lancer à côté de `php artisan serve` : php artisan eureka:register
 */
class EurekaRegister extends Command
{
    protected $signature = 'eureka:register {--once : S\'enregistrer une seule fois puis quitter}';

    protected $description = 'Enregistre le notification-service dans Eureka (heartbeat toutes les 30 s)';

    private const APP = 'NOTIFICATION-SERVICE';

    public function handle(): int
    {
        $cfg = config('services.eureka');
        $base = "http://{$cfg['host']}:{$cfg['port']}/eureka/apps";
        $instanceId = "notification-service:{$cfg['instance_host']}:{$cfg['service_port']}";

        if (! $this->register($base, $instanceId, $cfg)) {
            $this->error("Eureka injoignable sur {$cfg['host']}:{$cfg['port']}");

            return self::FAILURE;
        }
        $this->info("notification-service enregistré dans Eureka ($instanceId)");

        if ($this->option('once')) {
            return self::SUCCESS;
        }

        while (true) {
            sleep(30);
            try {
                $res = Http::timeout(5)->put("$base/".self::APP."/$instanceId");
                if ($res->status() === 404) {
                    // Eureka a redémarré ou nous a oubliés : on se réenregistre.
                    $this->register($base, $instanceId, $cfg);
                    $this->warn('Réenregistré dans Eureka');
                }
            } catch (\Throwable $e) {
                $this->warn('Heartbeat Eureka échoué : '.$e->getMessage());
            }
        }
    }

    /** @param array<string,mixed> $cfg */
    private function register(string $base, string $instanceId, array $cfg): bool
    {
        $host = $cfg['instance_host'];
        $port = (int) $cfg['service_port'];

        try {
            return Http::timeout(5)->post("$base/".self::APP, ['instance' => [
                'instanceId' => $instanceId,
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
}
