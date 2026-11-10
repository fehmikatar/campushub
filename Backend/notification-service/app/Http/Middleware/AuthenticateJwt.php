<?php

namespace App\Http\Middleware;

use App\Services\JwtService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateJwt
{
    public function __construct(private JwtService $jwt)
    {
    }

    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->bearerToken();
        if (! $token) {
            return response()->json(['message' => 'Token manquant'], 401);
        }

        $payload = $this->jwt->decode($token);
        if ($payload === 'expired') {
            return response()->json(['message' => 'Token expiré'], 401);
        }
        if ($payload === null
            || ! is_string($payload['sub'] ?? null)
            || ! in_array($payload['role'] ?? null, config('roles.all'), true)) {
            return response()->json(['message' => 'Token invalide'], 401);
        }

        $request->attributes->set('user', ['id' => $payload['sub'], 'role' => $payload['role']]);

        return $next($request);
    }
}
