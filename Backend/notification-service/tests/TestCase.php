<?php

namespace Tests;

use App\Services\UserDirectory;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Par défaut aucun appel réseau vers user-service : pas de prénom. UserDirectoryTest teste le vrai client.
        $this->userFirstNames([]);
    }

    /** @param array<string,string> $firstNames prénom par identifiant d'utilisateur */
    protected function userFirstNames(array $firstNames): void
    {
        $this->app->instance(UserDirectory::class, new class($firstNames) extends UserDirectory
        {
            public function __construct(private array $firstNames)
            {
            }

            public function firstName(string $userId): ?string
            {
                return $this->firstNames[$userId] ?? null;
            }
        });
    }
}
