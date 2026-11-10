<?php

namespace App\Console\Commands;

use App\Services\RabbitMqConsumer;
use Illuminate\Console\Command;

/**
 * Écoute RabbitMQ en continu : php artisan rabbitmq:consume
 * (à lancer dans son propre terminal, à côté de `php artisan serve`).
 */
class RabbitMqConsume extends Command
{
    protected $signature = 'rabbitmq:consume';

    protected $description = 'Écoute les files RabbitMQ (forum.events, evaluation.events, course.events)';

    public function handle(RabbitMqConsumer $consumer): int
    {
        if (! $consumer->isEnabled()) {
            $this->warn('RABBITMQ_URL est vide : consommation RabbitMQ désactivée.');

            return self::SUCCESS;
        }

        try {
            $consumer->connect();
        } catch (\Throwable $e) {
            $this->error('RabbitMQ injoignable : '.$e->getMessage());

            return self::FAILURE;
        }

        $this->info('Connecté à RabbitMQ. Files : '.implode(', ', $consumer->queues()));
        $this->line('En attente de messages... (Ctrl+C pour arrêter)');

        try {
            // Le traitement des messages est branché à l'étape D ; en attendant, on les journalise et on les écarte.
            $consumer->consume(function (string $queue, string $body): bool {
                $this->warn("[$queue] message reçu mais pas encore traité : $body");

                return false;
            });
        } catch (\Throwable $e) {
            $this->error('Consommation interrompue : '.$e->getMessage());

            return self::FAILURE;
        } finally {
            $consumer->close();
        }

        return self::SUCCESS;
    }
}
