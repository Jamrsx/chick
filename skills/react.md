# React (what it is & how Chick uses it)

## What is React?

**React** is a **JavaScript library** for building user interfaces. You describe UI as **components** (functions that return JSX markup). When **state** or **props** change, React updates the DOM efficiently.

Key ideas:

- **Components** — Reusable pieces (pages, modals, buttons).
- **JSX** — HTML-like syntax inside JavaScript.
- **State** — `useState` holds data that triggers re-renders when updated.
- **Effects** — `useEffect` runs side effects (fetch data, subscribe) when dependencies change.
- **Props** — Data passed parent → child.

## Chick frontend

- **Entry:** `frontend/src/main.jsx` (often mounts `<App />` and routing).
- **Attendance / payroll UI:** `frontend/src/Attendance/AttendanceSheet.js` — large page component using Ant Design (`Button`, `Modal`, `Form`, `Table`-style markup).
- **HTTP:** through `frontend/src/config/api` (axios) to Laravel.

## Practical tips

- Keep **business rules** (e.g. deduction percentages) in **constants + pure functions** at the top of the file or in a shared module.
- **Don't** duplicate API URL strings; use the shared `api` instance.
- Split new UI into **small components** when a file becomes hard to navigate.
