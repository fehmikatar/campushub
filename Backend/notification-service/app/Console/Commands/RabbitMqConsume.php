<?php

namespace App\Console\Commands;

use App\Services\EventMessageProcessor;
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

    public function handle(RabbitMqConsumer $consumer, EventMessageProcessor $processor): int
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
            $consumer->consume(function (string $queue, string $body) use ($processor): bool {
                $handled = $processor->process($queue, $body);
                $handled
                    ? $this->info("[$queue] message traité")
                    : $this->warn("[$queue] message écarté (voir storage/logs/laravel.log)");

                return $handled;
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
