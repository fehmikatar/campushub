<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

abstract class Controller
{
    /** Identifiant de l'utilisateur authentifié (posé par le middleware « jwt »). */
    protected function userId(Request $request): string
    {
        return $request->attributes->get('user')['id'];
    }
}
