<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ProductStock extends Model
{
    use HasFactory;

    protected $fillable = [
        'product_id',
        'branch_id',
        'quantity',
        'restocked_at',
        'minimum_stock',
        'received',
    ];

    protected $casts = [
        'quantity' => 'decimal:2',
        // Keep restocked_at as plain DB string. Casting it as 'datetime' makes Laravel
        // treat the stored time as the app timezone (Asia/Manila) and serialize it as
        // UTC ISO, shifting the displayed clock by 8 hours.
        'restocked_at' => 'string',
        'received' => 'boolean',
    ];

    public function product()
    {
        return $this->belongsTo(Product::class);
    }

    public function branch()
    {
        return $this->belongsTo(Branch::class);
    }
}