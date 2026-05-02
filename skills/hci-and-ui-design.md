# HCI & UI design (practical checklist)

Human–computer interaction (HCI) is about making systems **easy to learn, efficient, and safe** for real users. Use this when designing or reviewing Chick screens.

## Core principles

1. **Visibility of system status** — Users see what’s happening (loading, saved, errors). Example: spinners, success toasts, clear error messages.
2. **Match the real world** — Labels and flows match user vocabulary (e.g. “Monthly gross”, “Edit deductions”), not internal DB names unless in dev tools.
3. **User control** — Obvious cancel/back; destructive actions confirmed; pagination or scroll so long lists aren’t trapped (see attendance daily rows).
4. **Consistency** — Same action, same control (primary button for submit, link style for secondary actions). Align with Ant Design / Tailwind patterns already in the project.
5. **Error prevention** — Disable or validate inputs; computed fields read-only so users don’t overwrite SSS/PhilHealth/Pag‑IBIG by mistake.
6. **Recognition over recall** — Show options (dropdowns, filters) instead of expecting memorized codes.
7. **Flexibility** — Shortcuts for experts (keyboard, quick filters) optional; novices get clear paths.
8. **Minimalist design** — Every extra control adds cognitive load; remove clutter.
9. **Help users recover from errors** — Say what failed and what to do next, not only “Error”.
10. **Documentation** — Short inline hints where concepts are heavy (e.g. percentage basis for deductions).

## For this codebase

- Keep **touch targets** large enough on mobile (`mob/`).
- Respect **contrast** (dark sidebar vs light content already sets a pattern).
- **Tables:** sticky headers or scroll regions when many rows; pagination where lists are long (attendance daily pagination pattern).
