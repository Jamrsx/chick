# Laravel (what it is & how Chick uses it)

## What is Laravel?

**Laravel** is a **PHP** web framework: routing, HTTP controllers, database (Eloquent ORM), validation, authentication, and more in one structured place. You build **APIs** and **server-rendered** apps; Chick’s **backend** is Laravel exposing JSON APIs to the React frontend.

## Chick backend layout (high level)

- **`backend/routes/api.php`** — API routes → controllers.
- **`backend/app/Http/Controllers/`** — Request handling (e.g. `DeductionIncentiveController`, `AttendanceController`).
- **`backend/app/Models/`** — Eloquent models (`StaffDeduction`, `User`, …).
- **`backend/database/migrations/`** — Schema for tables like `staff_deductions`, `staff_incentives`.

## Typical flow

1. Browser/React calls `GET`/`POST` with JSON.
2. **Route** matches URL → **Controller** method runs.
3. **Validation** on input → **Model** reads/writes DB → **JSON response**.

## Tips

- Prefer **form requests** or `$request->validate([...])` for input safety.
- Use **Eloquent** relationships (`User`, `StaffDeduction`) instead of raw SQL unless necessary.
- Run migrations after schema changes: `php artisan migrate` (from `backend/`).
