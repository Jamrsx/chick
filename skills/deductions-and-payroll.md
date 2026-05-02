# Deductions & payroll (Chick)

## Business rule (staff attendance app)

For each staff member and **calendar month**, government contributions are calculated from **actual monthly gross** for that month:

| Item | Rate (of monthly gross) |
|------|-------------------------|
| SSS | 4.5% |
| PhilHealth | 2.5% |
| Pag‑IBIG | 2% |

**Monthly gross** here means the sum of earned amounts for days worked in that month (as shown on the attendance sheet), not a theoretical salary unless that’s what you’re modelling.

## When deductions appear on the attendance screen

The API returns **`deduction_record_exists`** (`true` only if a row exists in `staff_deductions` for that user/month/year). Until the user saves via **Edit Deductions**, that flag is false and **monthly net on the sheet equals gross** (no SSS/PhilHealth/Pag‑IBIG/cash advance applied in the UI totals).

## Where it lives in code

### Frontend

- **File:** `frontend/src/Attendance/AttendanceSheet.js`
- **Rates:** `SSS_MONTHLY_RATE`, `PHILHEALTH_MONTHLY_RATE`, `PAGIBIG_MONTHLY_RATE`
- **Computation:** `computeGovernmentDeductionsFromMonthlyGross(monthlyGross)` → `{ sss, philhealth, pagibig }` (rounded peso amounts)
- **Totals:** `calculateDeductions()` adds those three **monthly** amounts plus **cash advance** (monthly) and **other** deductions from saved data.
- **Modal “Edit Deductions”:** Disabled fields show those computed amounts; **Save** sends monthly figures to the API. Editable: cash advance, incentives.

### Backend

- **Tables:** `staff_deductions`, `staff_incentives` (per `user_id`, `month`, `year`).
- **Controller:** `backend/app/Http/Controllers/Api/DeductionIncentiveController.php` — `storeDeductions`, `storeIncentives`, GET by month/year.
- **Daily payroll API:** `AttendanceController` spreads **monthly** stored amounts over working days using **÷ 22** for per‑day deduction slices (see `StaffDeduction` usage there).

So: **DB stores monthly peso amounts**; daily reports derive a **daily share** from those monthly totals.

## Incentives

Stored in `staff_incentives` (e.g. perfect attendance flag, commission). Net pay logic combines gross, deductions, and incentives according to the React payroll helpers in `AttendanceSheet.js`.
