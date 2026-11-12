<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/**
 * E-mail d'une notification, envoyé par la file d'attente : un serveur SMTP lent ne bloque ni l'API
 * ni le consommateur RabbitMQ. Trois essais espacés avant d'abandonner (table `failed_jobs`).
 */
class NotificationMail extends Mailable implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public function __construct(public string $heading, public string $body)
    {
    }

    /** @return int[] secondes d'attente avant chaque nouvel essai */
    public function backoff(): array
    {
        return [30, 120];
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: $this->heading);
    }

    public function content(): Content
    {
        return new Content(text: 'mail.notification');
    }
}
