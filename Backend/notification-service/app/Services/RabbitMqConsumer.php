<?php

namespace App\Services;

use Closure;
use PhpAmqpLib\Channel\AMQPChannel;
use PhpAmqpLib\Connection\AMQPStreamConnection;
use PhpAmqpLib\Message\AMQPMessage;

/**
 * Connexion à RabbitMQ : déclare les files (le notification-service est le seul à le faire)
 * et consomme leurs messages un par un.
 */
class RabbitMqConsumer
{
    private ?AMQPStreamConnection $connection = null;

    private ?AMQPChannel $channel = null;

    public function isEnabled(): bool
    {
        return (string) config('services.rabbitmq.url') !== '';
    }

    /** @return string[] */
    public function queues(): array
    {
        return config('services.rabbitmq.queues');
    }

    /**
     * Se connecte et déclare les files durables.
     *
     * @throws \Throwable si RabbitMQ est injoignable
     */
    public function connect(): void
    {
        $url = parse_url((string) config('services.rabbitmq.url'));

        $this->connection = new AMQPStreamConnection(
            $url['host'] ?? 'localhost',
            $url['port'] ?? 5672,
            isset($url['user']) ? urldecode($url['user']) : 'guest',
            isset($url['pass']) ? urldecode($url['pass']) : 'guest',
            isset($url['path']) && $url['path'] !== '/' ? urldecode(ltrim($url['path'], '/')) : '/',
        );
        $this->channel = $this->connection->channel();

        foreach ($this->queues() as $queue) {
            // durable = survit à un redémarrage de RabbitMQ
            $this->channel->queue_declare($queue, false, true, false, false);
        }

        // Un seul message non confirmé à la fois : un traitement lent ne fait pas s'empiler le reste.
        $this->channel->basic_qos(0, 1, false);
    }

    /**
     * Écoute toutes les files. $handler reçoit (nom de la file, corps du message) ;
     * son résultat (true = traité, false = invalide et journalisé) n'a pas d'effet sur l'ack : toujours confirmé.
     * Une exception remet le message en file pour un nouvel essai.
     *
     * @param  Closure(string,string):bool  $handler
     */
    public function consume(Closure $handler): void
    {
        foreach ($this->queues() as $queue) {
            $this->channel->basic_consume($queue, '', false, false, false, false,
                function (AMQPMessage $message) use ($queue, $handler) {
                    try {
                        $handler($queue, $message->getBody());
                    } catch (\Throwable $e) {
                        $message->nack(true); // panne passagère (ex. base) : on retentera
                        throw $e;
                    }
                    // Traité ou invalide : dans les deux cas ack, sinon un message invalide reviendrait en boucle.
                    $message->ack();
                });
        }

        while ($this->channel->is_consuming()) {
            $this->channel->wait();
        }
    }

    public function close(): void
    {
        $this->channel?->close();
        $this->connection?->close();
    }
}
