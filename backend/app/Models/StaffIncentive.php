<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class StaffIncentive extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'perfect_attendance',
        'commission',
        'other_incentives',
        'month',
        'year',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}