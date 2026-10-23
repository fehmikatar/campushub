<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

class MakeToken extends Command
{
    protected $signature = 'token:make {userId} {role=ETUDIANT} {--hours=24}';

    protected $description = 'Génère un JWT de test (HS256) pour Swagger / Postman';

    public function handle(): int
    {
        $b64 = fn (string $v) => rtrim(strtr(base64_encode($v), '+/', '-_'), '=');
        $h = $b64(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
        $p = $b64(json_encode([
            'sub' => $this->argument('userId'),
            'role' => $this->argument('role'),
            'iss' => config('services.jwt.issuer'),
            'exp' => time() + 3600 * (int) $this->option('hours'),
        ]));
        $sig = $b64(hash_hmac('sha256', "$h.$p", (string) config('services.jwt.secret'), true));

        $this->line("$h.$p.$sig");

        return self::SUCCESS;
    }
}
