<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class StaffDeduction extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'sss',
        'philhealth',
        'pagibig',
        'cash_advance',
        'other_deductions',
        'month',
        'year',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}