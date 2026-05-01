<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('attendance', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->onDelete('cascade');
            $table->foreignId('branch_id')->constrained()->onDelete('cascade');
            $table->date('date');
            $table->time('time_in')->nullable();
            $table->time('time_out')->nullable();
            $table->boolean('is_late')->default(false);
            $table->integer('late_minutes')->default(0);
            $table->decimal('hours_worked', 5, 2)->nullable(); // ADD THIS LINE - hours worked calculation
            $table->string('status')->default('present'); // present, absent, late, late_15, late_30, late_60, completed, completed_late
            $table->timestamps();
            
            $table->unique(['user_id', 'date']);
            
            // Add indexes for better performance
            $table->index('date');
            $table->index('branch_id');
            $table->index('status');
        });
    }

    public function down()
    {
        Schema::dropIfExists('attendance');
    }
};