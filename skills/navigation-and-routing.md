# Navigation & routing (web vs mobile)

## Web (`frontend/`)

- **Purpose:** Move between **URLs** (bookmarkable, browser back/forward).
- **Typical stack:** **React Router** (`BrowserRouter`, `Routes`, `Route`, `Link`, `Navigate`).
- **Layout:** Often a **layout route** wraps sidebar + `<Outlet />` for nested pages (similar to Chick’s menu layout pattern).
- **Design tips:** Keep **active** nav state visible; avoid hidden-only navigation; group related routes under one layout.

## Mobile (`mob/` — Expo / React Native)

- **Purpose:** Stack, tabs, or drawers between **screens** (no URL bar unless using deep linking).
- **Typical:** **Expo Router** (file-based: `app/(tabs)/index.tsx`) or **React Navigation** (`createNativeStackNavigator`, tab navigator).
- **Design tips:** **Tab bar** for top-level sections; **stack** for drill-down; **back** behavior must be obvious on Android/iOS.

## Shared HCI idea

Users should always know **where they are** and **how to go back**. Web: breadcrumbs or highlighted nav item. Mobile: stack header back button + tab indicator.

## Chick-specific

- Web sidebar lives in **`frontend/src/MENU/`** (e.g. `Layout.js`, `Menu.js`) — new pages should register there so users can reach them.
