<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Allow fractional quantities (e.g. 0.5 for half-portion sales)
        Schema::table('sale_items', function (Blueprint $table) {
            $table->decimal('quantity', 10, 2)->change();
        });

        Schema::table('product_stocks', function (Blueprint $table) {
            $table->decimal('quantity', 10, 2)->default(0)->change();
            $table->decimal('minimum_stock', 10, 2)->default(0)->change();
        });
    }

    public function down(): void
    {
        Schema::table('sale_items', function (Blueprint $table) {
            $table->integer('quantity')->change();
        });

        Schema::table('product_stocks', function (Blueprint $table) {
            $table->integer('quantity')->default(0)->change();
            $table->integer('minimum_stock')->default(0)->change();
        });
    }
};
