<?php

namespace App\Console\Commands;

use App\Services\EurekaClient;
use Illuminate\Console\Command;

/**
 * Enregistre le service dans Eureka puis envoie un signal de vie toutes les 30 s.
 * À lancer à côté de `php artisan serve` : php artisan eureka:register
 */
class EurekaRegister extends Command
{
    protected $signature = 'eureka:register {--once : S\'enregistrer une seule fois puis quitter}';

    protected $description = 'Enregistre le notification-service dans Eureka (heartbeat toutes les 30 s)';

    public function handle(EurekaClient $eureka): int
    {
        if (! $eureka->register()) {
            $this->error("Eureka injoignable sur {$eureka->address()}");

            return self::FAILURE;
        }
        $this->info("notification-service enregistré dans Eureka ({$eureka->instanceId()})");

        if ($this->option('once')) {
            return self::SUCCESS;
        }

        while (true) {
            sleep(30);
            try {
                if ($eureka->heartbeat() === 404) {
                    // Eureka a redémarré ou nous a oubliés : on se réenregistre.
                    $eureka->register();
                    $this->warn('Réenregistré dans Eureka');
                }
            } catch (\Throwable $e) {
                $this->warn('Heartbeat Eureka échoué : '.$e->getMessage());
            }
        }
    }
}
