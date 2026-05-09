<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$rows = \Illuminate\Support\Facades\DB::select("
    SELECT id, branch_id, sale_date, created_at, updated_at,
           DATE(CONVERT_TZ(created_at, '+00:00', '+08:00')) as ph_date,
           @@session.time_zone as session_tz,
           @@global.time_zone as global_tz
    FROM sales ORDER BY id DESC LIMIT 10
");

foreach ($rows as $r) {
    echo "id={$r->id} sale_date={$r->sale_date} created_at={$r->created_at} ph_date={$r->ph_date} session_tz={$r->session_tz}" . PHP_EOL;
}
