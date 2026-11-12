<?php

namespace App\Services;

use App\Mail\NotificationMail;
use App\Models\Notification;
use App\Models\NotificationPreference;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Point d'entrée unique pour créer une notification : respecte les préférences
 * de l'utilisateur (types coupés) et envoie un email si une adresse est configurée.
 */
class NotificationDispatcher
{
    public function __construct(private UserDirectory $users)
    {
    }

    /**
     * @param  array<string,mixed>  $data
     * @param  bool  $greet  ajoute le prénom du destinataire (un appel à user-service) ; à réserver aux envois
     *                       à une ou deux personnes : jamais d'appel synchrone dans une boucle sur une liste.
     */
    public function send(string $userId, string $type, string $title, string $message, array $data = [], bool $greet = false): ?Notification
    {
        $prefs = NotificationPreference::where('user_id', $userId)->first();

        if ($prefs && in_array($type, $prefs->muted_types ?? [], true)) {
            return null;
        }

        if ($greet && ($firstName = $this->users->firstName($userId)) !== null) {
            $message = "Bonjour $firstName, ".mb_strtolower(mb_substr($message, 0, 1)).mb_substr($message, 1);
        }

        $notification = Notification::create([
            'user_id' => $userId,
            'type' => $type,
            'title' => $title,
            'message' => $message,
            'data' => $data ?: null,
        ]);

        if ($prefs && $prefs->email_enabled && $prefs->email) {
            try {
                // Mis en file d'attente : l'envoi réel (et ses nouveaux essais) se fait dans le worker.
                Mail::to($prefs->email)->queue(new NotificationMail($title, $message));
            } catch (\Throwable $e) {
                // L'email est un bonus : son échec ne doit pas perdre la notification.
                Log::warning("Email non mis en file pour l'utilisateur $userId : ".$e->getMessage());
            }
        }

        return $notification;
    }
}
