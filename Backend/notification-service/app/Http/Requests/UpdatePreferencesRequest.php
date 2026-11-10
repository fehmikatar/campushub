<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdatePreferencesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // protégé par le middleware « jwt »
    }

    /** @return array<string,mixed> */
    public function rules(): array
    {
        return [
            'email' => ['nullable', 'email', 'max:150'],
            'email_enabled' => ['sometimes', 'boolean'],
            'muted_types' => ['sometimes', 'array', 'max:20'],
            'muted_types.*' => ['string', 'max:50'],
        ];
    }
}
