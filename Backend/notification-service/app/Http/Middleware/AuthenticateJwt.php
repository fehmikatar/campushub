<?php

namespace App\Http\Middleware;

use App\Services\JwtService;
use App\Services\KeycloakUnavailableException;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateJwt
{
    public function __construct(private JwtService $jwt)
    {
    }

    /** @param string ...$roles rôles autorisés sur la route (aucun = tout rôle CampusHub), ex. jwt:ENSEIGNANT,ADMIN */
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $token = $request->bearerToken();
        if (! $token) {
            return response()->json(['message' => 'Token manquant'], 401);
        }

        try {
            $payload = $this->jwt->decode($token);
        } catch (KeycloakUnavailableException $e) {
            Log::warning($e->getMessage());

            return response()->json(['message' => 'Service d\'authentification indisponible'], 503);
        }
        if ($payload === 'expired') {
            return response()->json(['message' => 'Token expiré'], 401);
        }
        if ($payload === null || ! is_string($payload['sub'] ?? null)) {
            return response()->json(['message' => 'Token invalide'], 401);
        }

        $role = $payload['role'] ?? null;
        if (! in_array($role, config('roles.all'), true)) {
            // Keycloak : token authentique mais sans rôle CampusHub = 403 ; ancien mode : token invalide = 401.
            return $this->jwt->usesKeycloak()
                ? response()->json(['message' => 'Aucun rôle CampusHub'], 403)
                : response()->json(['message' => 'Token invalide'], 401);
        }
        if ($roles !== [] && ! in_array($role, $roles, true)) {
            return response()->json(['message' => 'Accès refusé'], 403);
        }

        $request->attributes->set('user', ['id' => $payload['sub'], 'role' => $role]);

        return $next($request);
    }
}
