<?php

namespace App\Services;

use Firebase\JWT\ExpiredException;
use Firebase\JWT\JWK;
use Firebase\JWT\JWT;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * Vérification des JWT. Mode Keycloak (RS256, clés publiques JWKS) si KEYCLOAK_ISSUER_URI est renseigné,
 * sinon ancien mode HS256 avec JWT_SECRET (transition, même règles que le user-service et le forum-service).
 */
class JwtService
{
    private const JWKS_CACHE_KEY = 'keycloak.jwks';

    private const JWKS_TTL_SECONDS = 600;

    public function usesKeycloak(): bool
    {
        return (string) config('services.keycloak.issuer') !== '';
    }

    /**
     * @return array<string,mixed>|string|null payload, 'expired', ou null si invalide
     *
     * @throws KeycloakUnavailableException Keycloak injoignable et clé inconnue du cache (mode Keycloak)
     */
    public function decode(string $token): array|string|null
    {
        return $this->usesKeycloak() ? $this->decodeKeycloak($token) : $this->decodeHs256($token);
    }

    /** Payload avec "role" = rôle CampusHub le plus élevé de realm_access.roles (null s'il n'y en a aucun). */
    private function decodeKeycloak(string $token): array|string|null
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return null;
        }
        $header = json_decode($this->base64UrlDecode($parts[0]) ?: '', true);
        if (! is_array($header) || ($header['alg'] ?? null) !== 'RS256') {
            return null;
        }

        $keys = $this->signingKeys(is_string($header['kid'] ?? null) ? $header['kid'] : null);

        try {
            $payload = json_decode(json_encode(JWT::decode($token, JWK::parseKeySet(['keys' => $keys], 'RS256'))), true);
        } catch (ExpiredException) {
            return 'expired';
        } catch (Throwable) {
            return null;
        }

        if (! is_array($payload) || ($payload['iss'] ?? null) !== config('services.keycloak.issuer')) {
            return null;
        }
        $payload['role'] = $this->highestRole($payload['realm_access']['roles'] ?? []);

        return $payload;
    }

    /** @return list<array<string,mixed>> */
    private function signingKeys(?string $kid): array
    {
        $keys = $this->signingKeysFrom(Cache::get(self::JWKS_CACHE_KEY, []));

        // Cache vide ou clé inconnue (rotation chez Keycloak) : un seul rechargement.
        if ($keys === [] || ($kid !== null && ! in_array($kid, array_column($keys, 'kid'), true))) {
            $keys = $this->signingKeysFrom($this->fetchJwks());
        }

        return $keys;
    }

    /** @return list<array<string,mixed>> */
    private function signingKeysFrom(mixed $keys): array
    {
        return array_values(array_filter(
            is_array($keys) ? $keys : [],
            fn ($key) => is_array($key) && ($key['use'] ?? null) === 'sig'
        ));
    }

    /** @return list<array<string,mixed>> */
    private function fetchJwks(): array
    {
        $issuer = rtrim((string) config('services.keycloak.issuer'), '/');
        $uri = (string) config('services.keycloak.jwks_uri') ?: "$issuer/protocol/openid-connect/certs";

        try {
            $response = Http::timeout(3)->acceptJson()->get($uri);
        } catch (Throwable $e) {
            throw new KeycloakUnavailableException('Keycloak injoignable : '.$e->getMessage(), 0, $e);
        }
        $keys = $response->json('keys');
        if (! $response->successful() || ! is_array($keys)) {
            throw new KeycloakUnavailableException("Clés Keycloak indisponibles (HTTP {$response->status()})");
        }

        Cache::put(self::JWKS_CACHE_KEY, $keys, self::JWKS_TTL_SECONDS);

        return $keys;
    }

    private function highestRole(mixed $roles): ?string
    {
        $roles = is_array($roles) ? $roles : [];
        foreach (array_reverse(config('roles.all')) as $role) {
            if (in_array($role, $roles, true)) {
                return $role;
            }
        }

        return null;
    }

    /** @return array<string,mixed>|string|null */
    private function decodeHs256(string $token): array|string|null
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
