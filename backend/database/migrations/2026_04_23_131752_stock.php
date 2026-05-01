// database/migrations/2024_01_01_000004_create_product_stocks_table.php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('stock', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->onDelete('cascade');
            $table->foreignId('branch_id')->constrained()->onDelete('cascade');
            $table->integer('quantity')->default(0);
            $table->integer('minimum_stock')->default(20);
            $table->timestamps();
            
            $table->unique(['product_id', 'branch_id']);
        });
    }

    public function down()
    {
        Schema::dropIfExists('stock');
    }
};