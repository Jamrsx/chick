<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Sale extends Model
{
    use HasFactory;

    protected $fillable = [
        'invoice_number',
        'branch_id',
        'user_id',
        'customer_name',
        'senior_discount',
        'sale_date',
        'subtotal',
        'tax',
        'discount_amount',
        'total',
        'cash_collected',
        'change_given',
        'payment_method',
    ];

    protected $casts = [
        // Keep sale_date as a plain string. Casting it as 'date' makes Laravel
        // serialize it as a timezone-shifted ISO datetime (Manila midnight -> UTC),
        // which causes the frontend to display the previous calendar day.
        'sale_date' => 'string',
    ];

    public function branch()
    {
        return $this->belongsTo(Branch::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function items()
    {
        return $this->hasMany(SaleItem::class);
    }
}

