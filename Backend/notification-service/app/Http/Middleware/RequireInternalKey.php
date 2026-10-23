<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RequireInternalKey
{
    public function handle(Request $request, Closure $next): Response
    {
        $expected = (string) config('services.internal.key');
        $given = (string) $request->header('X-Internal-Key', '');

        if ($expected === '' || ! hash_equals($expected, $given)) {
            return response()->json(['message' => 'Accès interdit'], 403);
        }

        return $next($request);
    }
}
