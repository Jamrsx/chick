<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('product_stocks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->onDelete('cascade');
            $table->foreignId('branch_id')->constrained()->onDelete('cascade');
            $table->integer('quantity')->default(0);
            $table->integer('minimum_stock')->default(0);
            $table->timestamps();
            
            // Prevent duplicate entries for same product at same branch
            $table->unique(['product_id', 'branch_id']);
        });
    }

    public function down()
    {
        Schema::dropIfExists('product_stocks');
    }
};