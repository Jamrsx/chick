<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$updated = \Illuminate\Support\Facades\DB::update(
    "UPDATE sales SET sale_date = DATE(CONVERT_TZ(created_at, '+00:00', '+08:00')) WHERE sale_date <> DATE(CONVERT_TZ(created_at, '+00:00', '+08:00'))"
);

echo "Updated {$updated} row(s). All sale_date values now match PH calendar date." . PHP_EOL;
