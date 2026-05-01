// database/migrations/2024_01_01_000010_create_staff_incentives_table.php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('staff_incentives', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->onDelete('cascade');
            $table->boolean('perfect_attendance')->default(false);
            $table->decimal('commission', 10, 2)->default(0);
            $table->decimal('other_incentives', 10, 2)->default(0);
            $table->integer('month');
            $table->integer('year');
            $table->timestamps();
        });
    }

    public function down()
    {
        Schema::dropIfExists('staff_incentives');
    }
};