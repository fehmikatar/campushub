<?php

namespace Tests\Feature;

use App\Services\JwtService;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/** Validation des tokens Keycloak (RS256) avec un Keycloak simulé : paire de clés de test + JWKS factice. */
class KeycloakAuthTest extends TestCase
{
    use RefreshDatabase;

    private const ISSUER = 'http://localhost:8180/realms/campushub';

    private const JWKS_URL = self::ISSUER.'/protocol/openid-connect/certs';

    private const KID = 'test-key';

    private string $privateKey;

    /** @var array<string,string> */
    private array $publicJwk;

    protected function setUp(): void
    {
        parent::setUp();

        config(['services.keycloak.issuer' => self::ISSUER, 'services.keycloak.jwks_uri' => null]);
        Cache::flush();

        [$this->privateKey, $this->publicJwk] = $this->rsaKeyPair(self::KID);
        $this->fakeJwks([$this->publicJwk]);

        Route::middleware('jwt:ENSEIGNANT,ADMIN')->get('/api/_test/teachers', fn () => ['ok' => true]);
    }

    /** @return array{0:string,1:array<string,string>} clé privée PEM et clé publique au format JWK */
    private function rsaKeyPair(string $kid): array
    {
        $options = ['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA];
        // Windows (XAMPP) : OpenSSL ne trouve pas toujours openssl.cnf tout seul.
        foreach ([getenv('OPENSSL_CONF'), dirname(PHP_BINARY).'/extras/ssl/openssl.cnf', dirname(PHP_BINARY).'/extras/openssl/openssl.cnf'] as $conf) {
            if ($conf && is_file($conf) && ! openssl_pkey_new($options)) {
                $options['config'] = $conf;
                break;
            }
        }
        $key = openssl_pkey_new($options);
        openssl_pkey_export($key, $pem, null, array_intersect_key($options, ['config' => 1]));
        $rsa = openssl_pkey_get_details($key)['rsa'];
        $b64 = fn (string $bin) => rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');

        return [$pem, ['kty' => 'RSA', 'use' => 'sig', 'alg' => 'RS256', 'kid' => $kid, 'n' => $b64($rsa['n']), 'e' => $b64($rsa['e'])]];
    }

    /** @param list<array<string,string>> $keys */
    private function fakeJwks(array $keys): void
    {
        Http::fake([self::JWKS_URL => Http::response(['keys' => $keys])]);
    }

    /** @param array<string,mixed> $claims */
    private function keycloakToken(array $claims = [], ?string $privateKey = null): string
    {
        $payload = array_merge([
            'sub' => '11111111-1111-4111-8111-111111111111',
            'iss' => self::ISSUER,
            'aud' => 'account',
            'iat' => time(),
            'exp' => time() + 1800,
            'realm_access' => ['roles' => ['ETUDIANT', 'offline_access', 'uma_authorization', 'default-roles-campushub']],
        ], $claims);

        return JWT::encode($payload, $privateKey ?? $this->privateKey, 'RS256', self::KID);
    }

    private function getWith(string $token, string $url = '/api/notifications')
    {
        return $this->withHeader('Authorization', "Bearer $token")->getJson($url);
    }

    public function test_valid_token_passes_with_sub_as_id_and_role_from_realm_access(): void
    {
        $user = null;
        Route::middleware('jwt')->get('/api/_test/me', function (\Illuminate\Http\Request $request) use (&$user) {
            $user = $request->attributes->get('user');

            return ['ok' => true];
        });

        $this->getWith($this->keycloakToken(), '/api/_test/me')->assertOk();

        $this->assertSame(['id' => '11111111-1111-4111-8111-111111111111', 'role' => 'ETUDIANT'], $user);
    }

    public function test_highest_campushub_role_wins_and_other_roles_are_ignored(): void
    {
        $user = null;
        Route::middleware('jwt')->get('/api/_test/me', function (\Illuminate\Http\Request $request) use (&$user) {
            $user = $request->attributes->get('user');

            return ['ok' => true];
        });
        $token = $this->keycloakToken(['realm_access' => ['roles' => ['ETUDIANT', 'ADMIN', 'ENSEIGNANT', 'autre']]]);

        $this->getWith($token, '/api/_test/me')->assertOk();

        $this->assertSame('ADMIN', $user['role']);
    }

    public function test_wrong_signature_is_401(): void
    {
        [$otherPrivateKey] = $this->rsaKeyPair(self::KID);

        $this->getWith($this->keycloakToken([], $otherPrivateKey))->assertStatus(401);
    }

    public function test_expired_token_is_401(): void
    {
        $this->getWith($this->keycloakToken(['exp' => time() - 60]))
            ->assertStatus(401)
            ->assertJson(['message' => 'Token expiré']);
    }

    public function test_wrong_issuer_is_401(): void
    {
        $this->getWith($this->keycloakToken(['iss' => 'http://autre:8180/realms/campushub']))->assertStatus(401);
    }

    public function test_hs256_token_is_401(): void
    {
        config(['services.jwt.secret' => 'dev-secret', 'services.jwt.issuer' => self::ISSUER]);
        $hs256 = app(JwtService::class)->encode('a', 'ADMIN');

        $this->getWith($hs256)->assertStatus(401);
    }

    public function test_malformed_or_missing_token_is_401(): void
    {
        $this->getJson('/api/notifications')->assertStatus(401);
        $this->getWith('pas-un-jwt')->assertStatus(401);
    }

    public function test_token_without_campushub_role_is_403(): void
    {
        $token = $this->keycloakToken(['realm_access' => ['roles' => ['offline_access', 'uma_authorization']]]);

        $this->getWith($token)->assertStatus(403);
    }

    public function test_insufficient_role_on_a_restricted_route_is_403(): void
    {
        $this->getWith($this->keycloakToken(), '/api/_test/teachers')->assertStatus(403);

        $teacher = $this->keycloakToken(['realm_access' => ['roles' => ['ENSEIGNANT']]]);
        $this->getWith($teacher, '/api/_test/teachers')->assertOk();
    }

    public function test_keycloak_unreachable_with_unknown_key_is_503_never_500(): void
    {
        Cache::flush();
        Http::fake(fn () => throw new ConnectionException('connection refused'));

        $this->getWith($this->keycloakToken())->assertStatus(503);

        Http::fake([self::JWKS_URL => Http::response('boom', 500)]);
        $this->getWith($this->keycloakToken())->assertStatus(503);
    }

    public function test_public_keys_are_cached_and_not_fetched_on_every_request(): void
    {
        $token = $this->keycloakToken();

        $this->getWith($token)->assertOk();
        $this->getWith($token)->assertOk();

        Http::assertSentCount(1);

        // Keycloak tombe : la clé en cache suffit encore.
        Http::fake(fn () => throw new ConnectionException('connection refused'));
        $this->getWith($token)->assertOk();
    }

    public function test_jwks_uri_overrides_the_issuer_address_for_the_keys(): void
    {
        $uri = 'http://keycloak:8080/realms/campushub/protocol/openid-connect/certs';
        config(['services.keycloak.jwks_uri' => $uri]);
        Http::fake([$uri => Http::response(['keys' => [$this->publicJwk]])]);

        $this->getWith($this->keycloakToken())->assertOk();

        Http::assertSent(fn (Request $r) => $r->url() === $uri);
    }

    public function test_only_signature_keys_are_used(): void
    {
        $encryptionKey = array_merge($this->publicJwk, ['use' => 'enc', 'kid' => 'enc-key']);
        $uri = 'http://keycloak:8080/enc-only';
        config(['services.keycloak.jwks_uri' => $uri]);
        Http::fake([$uri => Http::response(['keys' => [$encryptionKey]])]);

        $this->getWith($this->keycloakToken())->assertStatus(401);
    }

    public function test_empty_keycloak_issuer_keeps_legacy_hs256_mode(): void
    {
        config(['services.keycloak.issuer' => '', 'services.jwt.secret' => 'secret', 'services.jwt.issuer' => 'campushub-user-service']);
        $token = app(JwtService::class)->encode('alice', 'ETUDIANT');

        $this->getWith($token)->assertOk();
        Http::assertNothingSent();
    }
}
