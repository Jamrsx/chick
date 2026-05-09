<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ProductStockDelivery extends Model
{
    use HasFactory;

    protected $fillable = [
        'product_id',
        'branch_id',
        'quantity',
        'restocked_at',
        'received_at',
        'received_by',
    ];

    protected $casts = [
        // Keep these as raw DB strings. Casting as 'datetime' applies app-timezone
        // conversion to UTC on serialize, shifting the displayed clock.
        'restocked_at' => 'string',
        'received_at' => 'string',
    ];

    public function product()
    {
        return $this->belongsTo(Product::class);
    }

    public function branch()
    {
        return $this->belongsTo(Branch::class);
    }

    public function receiver()
    {
        return $this->belongsTo(User::class, 'received_by');
    }
}

