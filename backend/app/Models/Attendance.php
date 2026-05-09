<?php

namespace App\Models;

use App\Models\Branch;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Attendance extends Model
{
    use HasFactory;

    protected $table = 'attendance';

    protected $fillable = [
        'user_id',
        'branch_id',
        'date',
        'time_in',
        'time_out',
        'is_late',
        'late_minutes',
        'hours_worked',
        'status',
    ];

    protected $casts = [
        'date' => 'date',
        // time_in / time_out are stored as plain TIME strings (HH:mm:ss).
        // Casting them as 'datetime' causes Laravel to apply timezone conversion
        // and serialize them as UTC ISO strings, shifting the displayed clock.
        // Keep them as strings so the frontend receives the raw DB value.
        'time_in' => 'string',
        'time_out' => 'string',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function branch()
    {
        return $this->belongsTo(Branch::class);
    }
}
