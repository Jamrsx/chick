<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class AdminUserSeeder extends Seeder
{
    public function run(): void
    {
        User::updateOrCreate(
            ['username' => 'admin'],
            [
                'firstname' => 'Admin',
                'lastname' => 'User',
                'role' => 'admin',
                'is_active' => true,
                'email' => 'admin@example.com',
                'password' => Hash::make('admin123'),
            ]
        );

        User::updateOrCreate(
            ['username' => 'staff'],
            [
                'firstname' => 'Staff',
                'lastname' => 'User',
                'role' => 'staff',
                'is_active' => true,
                'email' => 'staff@example.com',
                'password' => Hash::make('staff123'),
            ]
        );
    }
}

