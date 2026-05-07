<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Product extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'price',
        'description',
        'sku',
        'category',
        'is_active',
    ];

    public function stocks()
    {
        return $this->hasMany(ProductStock::class);
    }

    public function deliveries()
    {
        return $this->hasMany(ProductStockDelivery::class);
    }

    public function branches()
    {
        return $this->belongsToMany(Branch::class, 'product_stocks')
                    ->withPivot('quantity', 'minimum_stock');
    }

    public function saleItems()
    {
        return $this->hasMany(SaleItem::class);
    }
}