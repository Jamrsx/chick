<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Branch extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'code',
        'address',
        'phone',
        'email',
        'is_active',
    ];

    public function staff()
    {
        return $this->belongsToMany(User::class, 'staff_assignments');
    }

    public function productStocks()
    {
        return $this->hasMany(ProductStock::class);
    }

    public function products()
    {
        return $this->belongsToMany(Product::class, 'product_stocks')
                    ->withPivot('quantity', 'minimum_stock');
    }

    public function sales()
    {
        return $this->hasMany(Sale::class);
    }

    public function attendance()
    {
        return $this->hasMany(Attendance::class);
    }
}