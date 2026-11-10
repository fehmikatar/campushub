<?php

namespace App\Http\Controllers;

use App\Http\Requests\BroadcastRequest;
use App\Services\NotificationDispatcher;
use Illuminate\Http\JsonResponse;

/**
 * Endpoint générique pour les autres services (notes, annonces, rappels d'échéance...).
 */
class BroadcastController extends Controller
{
    public function store(BroadcastRequest $request, NotificationDispatcher $dispatcher): JsonResponse
    {
        $payload = $request->validated();

        $created = 0;
        foreach (array_unique($payload['userIds']) as $userId) {
            if ($dispatcher->send($userId, $payload['type'], $payload['title'], $payload['message'], $payload['data'] ?? [])) {
                $created++;
            }
        }

        return response()->json(['created' => $created], 201);
    }
}
