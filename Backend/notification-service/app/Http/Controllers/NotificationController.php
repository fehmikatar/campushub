<?php

namespace App\Http\Controllers;

use App\Http\Requests\ListNotificationsRequest;
use App\Models\Notification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class NotificationController extends Controller
{
    public function index(ListNotificationsRequest $request): JsonResponse
    {
        $query = Notification::forUser($this->userId($request))->latest('id');
        if ($request->boolean('unread')) {
            $query->unread();
        }

        return response()->json($query->paginate($request->integer('per_page', 20)));
    }

    public function unreadCount(Request $request): JsonResponse
    {
        return response()->json([
            'count' => Notification::forUser($this->userId($request))->unread()->count(),
        ]);
    }

    public function markRead(Request $request, int $id): JsonResponse
    {
        $notification = $this->findOwned($request, $id);
        if ($notification->read_at === null) {
            $notification->update(['read_at' => now()]);
        }

        return response()->json($notification);
    }

    public function markAllRead(Request $request): JsonResponse
    {
        $updated = Notification::forUser($this->userId($request))->unread()->update(['read_at' => now()]);

        return response()->json(['updated' => $updated]);
    }

    public function destroy(Request $request, int $id): Response
    {
        $this->findOwned($request, $id)->delete();

        return response()->noContent();
    }

    private function findOwned(Request $request, int $id): Notification
    {
        return Notification::forUser($this->userId($request))->findOrFail($id);
    }
}
