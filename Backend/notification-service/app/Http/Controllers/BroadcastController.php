<?php

namespace App\Http\Controllers;

use App\Services\NotificationDispatcher;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Endpoint générique pour les autres services (notes, annonces, rappels d'échéance...).
 */
class BroadcastController extends Controller
{
    public const TYPES = ['grade', 'announcement', 'deadline', 'system'];

    public function store(Request $request, NotificationDispatcher $dispatcher): JsonResponse
    {
        $payload = $request->validate([
            'userIds' => ['required', 'array', 'min:1', 'max:500'],
            'userIds.*' => ['required', 'string', 'max:64'],
            'type' => ['required', Rule::in(self::TYPES)],
            'title' => ['required', 'string', 'max:200'],
            'message' => ['required', 'string', 'max:2000'],
            'data' => ['nullable', 'array'],
        ]);

        $created = 0;
        foreach (array_unique($payload['userIds']) as $userId) {
            if ($dispatcher->send($userId, $payload['type'], $payload['title'], $payload['message'], $payload['data'] ?? [])) {
                $created++;
            }
        }

        return response()->json(['created' => $created], 201);
    }
}
