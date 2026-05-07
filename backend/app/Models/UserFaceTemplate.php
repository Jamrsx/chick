<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UserFaceTemplate extends Model
{
    protected $fillable = [
        'user_id',
        'embedding',
        'algorithm',
        'embedding_dim',
        'is_active',
    ];

    protected $casts = [
        'embedding' => 'array',
        'is_active' => 'boolean',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
