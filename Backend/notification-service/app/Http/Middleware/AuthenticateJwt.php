<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Valide le JWT HS256 émis par le user-service (mêmes règles que le forum-service).
 */
class AuthenticateJwt
{
    private const ROLES = ['ETUDIANT', 'ENSEIGNANT', 'ADMIN'];

    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->bearerToken();
        if (! $token) {
            return response()->json(['message' => 'Token manquant'], 401);
        }

        $payload = $this->decode($token);
        if ($payload === 'expired') {
            return response()->json(['message' => 'Token expiré'], 401);
        }
        if ($payload === null
            || ! is_string($payload['sub'] ?? null)
            || ! in_array($payload['role'] ?? null, self::ROLES, true)) {
            return response()->json(['message' => 'Token invalide'], 401);
        }

        $request->attributes->set('user', ['id' => $payload['sub'], 'role' => $payload['role']]);

        return $next($request);
    }

    /** @return array<string,mixed>|string|null */
    private function decode(string $token): array|string|null
    {
        $secret = (string) config('services.jwt.secret');
        $parts = explode('.', $token);
        if ($secret === '' || count($parts) !== 3) {
            return null;
        }
        [$h, $p, $s] = $parts;

        $header = json_decode($this->b64($h) ?: '', true);
        if (! is_array($header) || ($header['alg'] ?? null) !== 'HS256') {
            return null;
        }

        $expected = hash_hmac('sha256', "$h.$p", $secret, true);
        $given = $this->b64($s);
        if ($given === false || ! hash_equals($expected, $given)) {
            return null;
        }

        $payload = json_decode($this->b64($p) ?: '', true);
        if (! is_array($payload) || ($payload['iss'] ?? null) !== config('services.jwt.issuer')) {
            return null;
        }
        if (isset($payload['exp']) && $payload['exp'] < time()) {
            return 'expired';
        }

        return $payload;
    }

    private function b64(string $value): string|false
    {
        return base64_decode(strtr($value, '-_', '+/'), true);
    }
}
