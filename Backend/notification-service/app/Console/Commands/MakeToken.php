<?php

namespace App\Console\Commands;

use App\Services\JwtService;
use Illuminate\Console\Command;

class MakeToken extends Command
{
    protected $signature = 'token:make {userId} {role=ETUDIANT} {--hours=24}';

    protected $description = 'Génère un JWT de test (HS256) pour Swagger / Postman';

    public function handle(JwtService $jwt): int
    {
        $this->line($jwt->encode($this->argument('userId'), $this->argument('role'), (int) $this->option('hours')));

        return self::SUCCESS;
    }
}
