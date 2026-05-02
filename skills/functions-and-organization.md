# Functions & code organization (JavaScript / React)

## What is a function?

A **function** is a reusable block that takes inputs (**parameters**) and returns or performs an outcome. In JavaScript:

```javascript
function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}
```

**Arrow functions** are common in React:

```javascript
const computeGovernmentDeductionsFromMonthlyGross = (monthlyGross) => {
  const g = Number(monthlyGross) || 0;
  return { sss: roundMoney(g * 0.045), /* … */ };
};
```

## Good habits (Chick-style)

1. **Pure helpers** — Given the same inputs, return the same output without hidden side effects (easier to test). Example: `computeGovernmentDeductionsFromMonthlyGross`.
2. **One clear responsibility** — Formatting money vs loading API vs grouping data = separate functions.
3. **Names that read like English** — `calculateDeductions`, `loadAttendanceData`, not `doStuff`.
4. **Constants at top** — Rates like `SSS_MONTHLY_RATE` beside the feature that uses them.
5. **Avoid huge components** — If a React file passes ~400+ lines, extract subcomponents or hooks (`usePayroll`, etc.) when you touch that area.

## React-specific

- **Hooks:** `useState` for UI state, `useEffect` for sync with props/API (mind dependency arrays).
- **Events:** `onClick={() => setOpen(true)}` — keep handlers short; call a named function if logic grows.

## Where to put new code

- **Shared helpers:** `frontend/src/utils/` (if the project already uses it) or a colocated `utils.js` next to the feature.
- **API calls:** keep near `config/api` usage patterns in existing modules.
