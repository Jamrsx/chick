# Efficient Data Fetching (Avoiding N+1 & Slow Queries)

Chick uses **Laravel Eloquent** on the backend and **React** on the frontend. This guide covers how to keep database queries fast when loading lists, relationships, or large datasets.

## 1. N+1 Problem: What It Is

The **N+1 problem** happens when you load a parent record, then loop over its children and query the database again for each child.

```php
// BAD — 101 queries for 100 users
$users = User::all();                // 1 query
foreach ($users as $user) {
    echo $user->profile->phone;      // +100 queries (one per user)
}
```

## 2. Eager Loading (`with`)

Use `with()` to load relationships in **one extra query** instead of N.

```php
// GOOD — 2 queries total
$users = User::with('profile')->get();

foreach ($users as $user) {
    echo $user->profile->phone; // already loaded, no extra DB hit
}
```

### Multiple / Nested Relationships

```php
User::with(['profile', 'department'])->get();
User::with('posts.comments.author')->get();
```

### Select Specific Columns

```php
User::with(['profile' => fn ($q) => $q->select('user_id', 'phone')])
    ->get();
```

## 3. Lazy Eager Loading (If You Forgot `with`)

If you already have a collection and notice N+1 happening, use `load()`:

```php
$users = User::all();
// ... later in code ...
$users->load('profile'); // 2 queries instead of N+1
```

## 4. Pagination (Don't Load Everything)

Never `->all()` or `->get()` huge tables. Use **pagination**:

```php
// Backend
$deductions = StaffDeduction::with('staff')
    ->latest()
    ->paginate(50); // 50 per page

// Returns JSON with `data`, `current_page`, `last_page`, `total`
return response()->json($deductions);
```

```js
// Frontend
const [page, setPage] = useState(1);
const { data } = useQuery({
    queryKey: ['deductions', page],
    queryFn: () => api.get(`/deductions?page=${page}`),
});
```

## 5. Select Only What You Need

```php
// BAD — fetches every column
User::all();

// GOOD — fetches only what's used
User::select('id', 'name', 'email')->get();
```

## 6. Query Scopes & Conditions

Filter at the database level, not in PHP loops:

```php
// BAD — loads everything then filters in PHP
User::all()->filter(fn ($u) => $u->created_at > now()->subDays(7));

// GOOD — SQL `WHERE`
User::where('created_at', '>', now()->subDays(7))->get();
```

## 7. Chunking for Bulk Operations

When you must process many rows, use `chunk()` or `lazy()` to avoid memory crashes:

```php
User::chunk(200, function ($users) {
    foreach ($users as $user) {
        // process 200 at a time
    }
});
```

## 8. Counting Without Loading

```php
// BAD — loads all rows just to count
User::all()->count();

// GOOD — SQL COUNT(*)
User::count();
User::withCount('posts')->get(); // adds `posts_count` column
```

## 9. Cursor Pagination (100k+ Rows)

Standard `paginate()` uses **OFFSET**, which gets slower as you go deeper into large tables (offset 90,000 still scans 90,000 rows). Use **cursor pagination** instead:

```php
// Backend — cursor-based, no OFFSET
$records = Attendance::orderBy('id')
    ->cursorPaginate(50);

return response()->json([
    'data' => $records->items(),
    'next_cursor' => $records->nextCursor()?->encode(),
    'prev_cursor' => $records->previousCursor()?->encode(),
]);
```

```js
// Frontend — pass cursor to next request
const [cursor, setCursor] = useState(null);
const { data } = useQuery({
    queryKey: ['attendances', cursor],
    queryFn: () => api.get(`/attendances?cursor=${cursor ?? ''}`),
});
```

## 10. Lazy Collections (Low Memory for Huge Tables)

If you must iterate **all** 100,000 rows (e.g., export to CSV), use `lazy()` or `cursor()` so only **one row is in memory at a time**:

```php
// GOOD — generator, never loads all 100k at once
foreach (Attendance::lazy() as $attendance) {
    fputcsv($handle, [
        $attendance->staff_id,
        $attendance->date,
        $attendance->status,
    ]);
}

// Or cursor (even lighter, raw PDO)
foreach (Attendance::cursor() as $attendance) {
    // process one row
}
```

**Always `select()` only needed columns** when iterating huge tables:

```php
Attendance::select('id', 'staff_id', 'date', 'status')
    ->lazy()
    ->each(function ($row) {
        // process
    });
```

## 11. Avoid Model Hydration When Possible

If you only need raw data (not Eloquent models with casts, accessors, etc.), use `toArray()` or raw DB:

```php
// Faster — no model creation overhead
$rows = DB::table('attendances')
    ->select('staff_id', 'date', 'status')
    ->where('date', '>=', now()->subDays(30))
    ->get();

// Or
$rows = Attendance::select('staff_id', 'date', 'status')
    ->get()
    ->toArray();
```

## 12. Raw SQL Joins for Complex Reports

For reports that need data from 3+ tables, a single **JOIN** is often faster than Eloquent relationships + PHP loops:

```php
// One query instead of eager loading multiple relations
$report = DB::select("
    SELECT a.date, s.name, d.sss, d.philhealth
    FROM attendances a
    JOIN staff s ON a.staff_id = s.id
    LEFT JOIN staff_deductions d ON s.id = d.staff_id
    WHERE a.date BETWEEN ? AND ?
", [$start, $end]);

return response()->json($report);
```

## 13. Add Database Indexes

If a query is still slow after code fixes, add an index on the filtered / sorted column:

```php
// migration — single column
Schema::table('attendances', function (Blueprint $table) {
    $table->index(['staff_id']);
    $table->index(['date']);
});

// migration — composite (best for multi-column WHERE + ORDER BY)
Schema::table('attendances', function (Blueprint $table) {
    $table->index(['staff_id', 'date']);
});
```

**When to index:**
- Columns in `WHERE`, `ORDER BY`, `JOIN` conditions
- Foreign keys (`staff_id`, `user_id`, etc.)
- Date range columns (`date`, `created_at`) for time-series data

## 14. Cache Heavy Computed Data

If a report or summary query is slow and the data doesn't change every second, cache it:

```php
// Cache for 10 minutes
$summary = Cache::remember('attendance_summary', 600, function () {
    return Attendance::selectRaw('status, COUNT(*) as count')
        ->groupBy('status')
        ->get();
});

// Clear cache when data changes
Cache::forget('attendance_summary');
```

For exports or nightly reports, cache the **file path** instead of the data:

```php
$path = Cache::remember('monthly_report_2026_05', 3600, function () {
    $path = storage_path('app/reports/may_2026.csv');
    // generate CSV with lazy() or cursor()
    return $path;
});

return response()->download($path);
```

## 15. Big Table Anti-Patterns to Avoid

| Anti-Pattern | Why It Breaks at 100k+ | Better Way |
|--------------|------------------------|------------|
| `Model::all()` | Loads **all** rows into RAM | `paginate()` / `cursorPaginate()` |
| `OFFSET` deep pagination | Scans all skipped rows every page | `cursorPaginate()` |
| `foreach ($bigCollection as $item)` in PHP | Memory crash | `->lazy()` or `->cursor()` |
| `SELECT *` on wide tables | Transfers unused data over the wire | `->select(...)` only needed columns |
| `IN` with 10,000 IDs | Query plan degrades, slow | `JOIN` or filter with `WHERE` range |
| `GROUP BY` on unindexed columns | Full table scan + temp table | Add index on grouped column |
| No `WHERE` on time-series data | Reads entire history every request | Always filter by `date >= ?` or `created_at >= ?` |

## 16. Quick Checklist

| Situation | Fix |
|-----------|-----|
| Looping over models and accessing a relationship | Add `with('relation')` |
| Loading 1000+ rows at once | Use `paginate()` or `chunk()` |
| Fetching all columns but only using 3 | Add `select(...)` |
| Filtering a loaded collection in PHP | Move filter into the query (`where(...)`) |
| Counting a loaded collection | Use `->count()` on the query builder |
| Deep pages on 100k+ table | Switch to `cursorPaginate()` |
| Exporting all 100k rows | Use `lazy()` or `cursor()` |
| Complex report from 3+ tables | Raw `JOIN` SQL instead of multiple eager loads |
| Same slow query called repeatedly | `Cache::remember(...)` |
| Query still slow after code fixes | Add database **index** on `WHERE` / `ORDER BY` columns |

## Laravel Debug Bar / Telescope

Install **Laravel Telescope** or use `DB::enableQueryLog()` during development to spot N+1 or duplicate queries quickly:

```php
DB::enableQueryLog();
$users = User::all();
// ... run suspect code ...
dd(DB::getQueryLog()); // see every query fired
```
