<?php

namespace Tests\Feature;

use App\Services\EurekaClient;
use App\Services\UserDirectory;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/** Appel synchrone Notification -> User (le vrai client, user-service simulé). */
class UserDirectoryTest extends TestCase
{
    private const USER_URL = 'http://user-service.test:8081';

    private function directory(): UserDirectory
    {
        return new UserDirectory(new EurekaClient);
    }

    private function useUserUrl(): void
    {
        config(['services.user.url' => self::USER_URL]);
    }

    public function test_200_returns_first_name(): void
    {
        $this->useUserUrl();
        Http::fake([self::USER_URL.'/*' => Http::response(['id' => 'alice', 'prenom' => 'Alice', 'nom' => 'Martin'])]);

        $this->assertSame('Alice', $this->directory()->firstName('alice'));

        Http::assertSent(fn (Request $r) => $r->method() === 'GET'
            && $r->url() === self::USER_URL.'/api/v1/users/alice/public'
            && ! $r->hasHeader('Authorization'));
    }

    public function test_404_returns_null(): void
    {
        $this->useUserUrl();
        Http::fake([self::USER_URL.'/*' => Http::response(['message' => 'not found'], 404)]);

        $this->assertNull($this->directory()->firstName('inconnu'));
    }

    public function test_server_error_returns_null(): void
    {
        $this->useUserUrl();
        Http::fake([self::USER_URL.'/*' => Http::response('boom', 503)]);

        $this->assertNull($this->directory()->firstName('alice'));
    }

    public function test_timeout_or_unreachable_returns_null_without_exception_and_with_single_try(): void
    {
        $this->useUserUrl();
        $attempts = 0;
        Http::fake(function () use (&$attempts) {
            $attempts++;
            throw new ConnectionException('cURL error 28: timed out');
        });

        $this->assertNull($this->directory()->firstName('alice'));
        $this->assertSame(1, $attempts);
    }

    public function test_empty_or_missing_first_name_returns_null(): void
    {
        $this->useUserUrl();
        Http::fake([self::USER_URL.'/*' => Http::sequence()
            ->push(['id' => 'a', 'prenom' => '  '])
            ->push(['id' => 'b'])]);

        $this->assertNull($this->directory()->firstName('a'));
        $this->assertNull($this->directory()->firstName('b'));
    }

    public function test_service_is_found_through_eureka_when_no_url_is_set(): void
    {
        config(['services.user.url' => null]);
        Http::fake([
            '*/eureka/apps/USER-SERVICE' => Http::response(['application' => ['name' => 'USER-SERVICE', 'instance' => [
                ['hostName' => 'down.test', 'status' => 'DOWN', 'port' => ['$' => 9999]],
                ['hostName' => 'user.test', 'status' => 'UP', 'port' => ['$' => 8081]],
            ]]]),
            'http://user.test:8081/*' => Http::response(['prenom' => 'Alice']),
        ]);

        $this->assertSame('Alice', $this->directory()->firstName('alice'));
    }

    public function test_eureka_single_instance_object_is_supported(): void
    {
        config(['services.user.url' => null]);
        Http::fake([
            '*/eureka/apps/USER-SERVICE' => Http::response(['application' => ['instance' => [
                'hostName' => 'user.test', 'status' => 'UP', 'port' => ['$' => 8081],
            ]]]),
            'http://user.test:8081/*' => Http::response(['prenom' => 'Alice']),
        ]);

        $this->assertSame('Alice', $this->directory()->firstName('alice'));
    }

    public function test_service_missing_in_eureka_or_eureka_down_returns_null(): void
    {
        config(['services.user.url' => null]);

        Http::fake(['*/eureka/apps/USER-SERVICE' => Http::response('', 404)]);
        $this->assertNull($this->directory()->firstName('alice'));

        Http::fake(fn () => throw new ConnectionException('connection refused'));
        $this->assertNull($this->directory()->firstName('alice'));
    }

    public function test_user_service_url_replaces_eureka(): void
    {
        $this->useUserUrl();
        Http::fake([self::USER_URL.'/*' => Http::response(['prenom' => 'Alice'])]);

        $this->directory()->firstName('alice');

        Http::assertNotSent(fn (Request $r) => str_contains($r->url(), '/eureka/'));
    }
}
