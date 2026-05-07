<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    protected $fillable = [
        'username',
        'password',
        'firstname',
        'lastname',
        'middlename',
        'address',
        'role',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected $casts = [
        'email_verified_at' => 'datetime',
        'password' => 'hashed',
    ];

    // Relationship with StaffAssignment
    public function branchAssignments()
    {
        return $this->hasMany(StaffAssignment::class, 'user_id');
    }

    // Helper method to get current active branch
    public function getCurrentBranchIdAttribute()
    {
        $activeAssignment = $this->branchAssignments->where('is_active', true)->first();
        return $activeAssignment ? $activeAssignment->branch_id : null;
    }

    // Helper method to get current branch
    public function getCurrentBranchAttribute()
    {
        $activeAssignment = $this->branchAssignments->where('is_active', true)->first();
        return $activeAssignment ? $activeAssignment->branch : null;
    }

    public function faceTemplates()
    {
        return $this->hasMany(UserFaceTemplate::class);
    }

    public function activeFaceTemplate()
    {
        return $this->hasOne(UserFaceTemplate::class)->where('is_active', true);
    }
}