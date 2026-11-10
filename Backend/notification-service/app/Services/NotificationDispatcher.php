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
    /** @param array<string,mixed> $data */
    public function send(string $userId, string $type, string $title, string $message, array $data = []): ?Notification
    {
        $prefs = NotificationPreference::where('user_id', $userId)->first();

        if ($prefs && in_array($type, $prefs->muted_types ?? [], true)) {
            return null;
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
                Mail::to($prefs->email)->send(new NotificationMail($title, $message));
            } catch (\Throwable $e) {
                // L'email est un bonus : son échec ne doit pas perdre la notification.
                Log::warning("Email non envoyé à l'utilisateur $userId : ".$e->getMessage());
            }
        }

        return $notification;
    }
}
