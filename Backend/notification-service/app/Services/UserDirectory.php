<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Appel synchrone vers user-service : GET /api/v1/users/{id}/public (sans token, renvoie id, prenom, nom).
 * Un seul essai, 3 s maximum. Toute panne ou réponse inattendue donne null : la notification part sans prénom.
 */
class UserDirectory
{
    public function __construct(private EurekaClient $eureka)
    {
    }

    public function firstName(string $userId): ?string
    {
        try {
            $baseUrl = $this->baseUrl();
            if ($baseUrl === null) {
                Log::warning('user-service introuvable : notification envoyée sans prénom.');

                return null;
            }

            $response = Http::timeout(3)->acceptJson()->get("$baseUrl/api/v1/users/".rawurlencode($userId).'/public');
        } catch (\Throwable $e) {
            Log::warning("user-service injoignable : notification envoyée sans prénom ({$e->getMessage()}).");

            return null;
        }

        if ($response->status() === 404) {
            return null; // utilisateur inconnu : on notifie quand même
        }
        if (! $response->successful()) {
            Log::warning("user-service a répondu {$response->status()} : notification envoyée sans prénom.");

            return null;
        }

        $firstName = $response->json('prenom');

        return is_string($firstName) && trim($firstName) !== '' ? trim($firstName) : null;
    }

    /** USER_SERVICE_URL remplace Eureka (utile en Docker). */
    private function baseUrl(): ?string
    {
        $url = (string) config('services.user.url');

        return $url !== '' ? rtrim($url, '/') : $this->eureka->instanceUrl((string) config('services.user.app'));
    }
}
