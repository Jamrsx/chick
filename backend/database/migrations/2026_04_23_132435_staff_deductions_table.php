// database/migrations/2024_01_01_000009_create_staff_deductions_table.php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('staff_deductions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->onDelete('cascade');
            $table->decimal('sss', 10, 2)->default(0);
            $table->decimal('philhealth', 10, 2)->default(0);
            $table->decimal('pagibig', 10, 2)->default(0);
            $table->decimal('cash_advance', 10, 2)->default(0);
            $table->decimal('other_deductions', 10, 2)->default(0);
            $table->integer('month');
            $table->integer('year');
            $table->timestamps();
        });
    }

    public function down()
    {
        Schema::dropIfExists('staff_deductions');
    }
};