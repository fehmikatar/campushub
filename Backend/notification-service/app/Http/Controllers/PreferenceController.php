<?php

namespace App\Http\Controllers;

use App\Models\NotificationPreference;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PreferenceController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $prefs = NotificationPreference::firstOrNew(['user_id' => $this->userId($request)]);

        return response()->json([
            'email' => $prefs->email,
            'email_enabled' => $prefs->email_enabled ?? true,
            'muted_types' => $prefs->muted_types ?? [],
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['nullable', 'email', 'max:150'],
            'email_enabled' => ['sometimes', 'boolean'],
            'muted_types' => ['sometimes', 'array', 'max:20'],
            'muted_types.*' => ['string', 'max:50'],
        ]);

        $prefs = NotificationPreference::updateOrCreate(['user_id' => $this->userId($request)], $data);

        return response()->json([
            'email' => $prefs->email,
            'email_enabled' => $prefs->email_enabled ?? true,
            'muted_types' => $prefs->muted_types ?? [],
        ]);
    }

    private function userId(Request $request): string
    {
        return $request->attributes->get('user')['id'];
    }
}
