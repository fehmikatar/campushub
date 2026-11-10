<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Répond 400 avec la cause exacte quand le corps JSON est mal formé,
 * au lieu d'une validation trompeuse « champ requis ».
 */
class RejectInvalidJson
{
    public function handle(Request $request, Closure $next): Response
    {
        $raw = $request->getContent();

        if ($raw !== '' && $request->isJson()) {
            json_decode($raw);
            if (json_last_error() !== JSON_ERROR_NONE) {
                return response()->json([
                    'message' => 'JSON invalide : '.json_last_error_msg(),
                    'body_received' => mb_substr($raw, 0, 500),
                ], 400);
            }
        }

        return $next($request);
    }
}
