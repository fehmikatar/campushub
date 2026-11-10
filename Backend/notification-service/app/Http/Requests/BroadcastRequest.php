<?php

namespace App\Http\Requests;

use App\Enums\BroadcastType;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class BroadcastRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // protégé par le middleware « internal »
    }

    /** @return array<string,mixed> */
    public function rules(): array
    {
        return [
            'userIds' => ['required', 'array', 'min:1', 'max:500'],
            'userIds.*' => ['required', 'string', 'max:64'],
            'type' => ['required', Rule::enum(BroadcastType::class)],
            'title' => ['required', 'string', 'max:200'],
            'message' => ['required', 'string', 'max:2000'],
            'data' => ['nullable', 'array'],
        ];
    }
}
