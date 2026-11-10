<?php

namespace App\Services;

/**
 * Encodage / décodage des JWT HS256 (mêmes règles que le user-service et le forum-service).
 */
class JwtService
{
    /** @return array<string,mixed>|string|null payload, 'expired', ou null si invalide */
    public function decode(string $token): array|string|null
    {
        $secret = (string) config('services.jwt.secret');
        $parts = explode('.', $token);
        if ($secret === '' || count($parts) !== 3) {
            return null;
        }
        [$h, $p, $s] = $parts;

        $header = json_decode($this->base64UrlDecode($h) ?: '', true);
        if (! is_array($header) || ($header['alg'] ?? null) !== 'HS256') {
            return null;
        }

        $given = $this->base64UrlDecode($s);
        if ($given === false || ! hash_equals(hash_hmac('sha256', "$h.$p", $secret, true), $given)) {
            return null;
        }

        $payload = json_decode($this->base64UrlDecode($p) ?: '', true);
        if (! is_array($payload) || ($payload['iss'] ?? null) !== config('services.jwt.issuer')) {
            return null;
        }
        if (isset($payload['exp']) && $payload['exp'] < time()) {
            return 'expired';
        }

        return $payload;
    }

    public function encode(string $subject, string $role, int $hours = 24): string
    {
        $h = $this->base64UrlEncode(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
        $p = $this->base64UrlEncode(json_encode([
            'sub' => $subject,
            'role' => $role,
            'iss' => config('services.jwt.issuer'),
            'exp' => time() + 3600 * $hours,
        ]));
        $s = $this->base64UrlEncode(hash_hmac('sha256', "$h.$p", (string) config('services.jwt.secret'), true));

        return "$h.$p.$s";
    }

    private function base64UrlDecode(string $value): string|false
    {
        return base64_decode(strtr($value, '-_', '+/'), true);
    }

    private function base64UrlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }
}
