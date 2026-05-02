# Expo (what it is & Chick `mob/`)

## What is Expo?

**Expo** is a toolchain and platform for **React Native**: build **iOS/Android** apps with JavaScript and React patterns. It provides:

- Dev client, builds, OTA updates (depending on setup)
- Access to device APIs (camera, notifications) via Expo modules
- Often **Expo Router** or React Navigation for screens

**React Native** renders real native views (not a WebView); **Expo** sits on top to simplify development and builds.

## Chick mobile app

- Folder: **`mob/`** — see `mob/README.md` for scripts (`npm start`, platform builds).
- Shares **business concepts** with the web app (staff, attendance) but UI code is separate from `frontend/` (different components, navigation).

## When to use Expo vs web React

| | Web (`frontend/`) | Mobile (`mob/`) |
|--|-------------------|-----------------|
| Stack | React + Vite (typical) | React Native + Expo |
| Layout | CSS / Tailwind | Flexbox, RN styles |
| Navigation | React Router (or similar) | Expo Router / React Navigation |

Keep **API contracts** (Laravel JSON) aligned so both clients can call the same endpoints where intended.
