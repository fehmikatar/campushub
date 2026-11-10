<?php

namespace App\Http\Controllers;

use App\Http\Requests\UpdatePreferencesRequest;
use App\Models\NotificationPreference;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PreferenceController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        return $this->respond(NotificationPreference::firstOrNew(['user_id' => $this->userId($request)]));
    }

    public function update(UpdatePreferencesRequest $request): JsonResponse
    {
        $prefs = NotificationPreference::updateOrCreate(['user_id' => $this->userId($request)], $request->validated());

        return $this->respond($prefs);
    }

    private function respond(NotificationPreference $prefs): JsonResponse
    {
        return response()->json([
            'email' => $prefs->email,
            'email_enabled' => $prefs->email_enabled ?? true,
            'muted_types' => $prefs->muted_types ?? [],
        ]);
    }
}
