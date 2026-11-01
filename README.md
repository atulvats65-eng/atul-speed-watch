# ATUL Speed Watch — Social Panel

A professional social-media delivery panel: place orders (views / likes /
followers / comments), choose delivery speed and night mode, and track live
progress — with an optional Firebase backend.

## Features
- **Dashboard** — totals, active orders, delivered units, spend, and a 7-day delivery chart
- **Naya Order** — pick service, link, quantity, bonus likes, speed profile (Safe/Normal/Turbo/Micro/Custom), night mode, and **Humanize/Bot-safe** delivery
- **Orders** — live progress bars, status badges, ETA, cancel & delete, status filters
- **Services** — all services with rates
- **Wallet** — balance, deposit requests, transaction history
- **SMM API** — connect your SMM provider (URL + API key + backup), test connection
- **Admin** — users, balances, pending deposits, overview stats
- **Settings** — profile, account info, reset data
- **Backend (optional)** — Firebase Auth + Firestore sync when configured

## Run locally
```sh
npm install
npm run dev
```
## the `http://localhost:5173` (or the printed port).

## Access
Any key of 4+ chars opens the panel. `ATUL-ADMIN` grants admin access.

## Firebase backend (database)

Firebase Firestore ko database backend ke roop me use karta hai. Jab
`.env` me `VITE_FIREBASE_*` config bhari hoti hai, saara data — orders, users,
balances, transactions aur SMM config — cloud par sync hota hai aur doosre
devices se live update hota hai. Bina config ke app localStorage par chalti
rahegi.

Setup ke liye `SETUP.md` dekho. Collections: `orders`, `users`,
`transactions`, `apiConfig`. Firestore rules `firestore.rules` me hain.

```sh
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

## Tech
React 19 · Vite 8 · Tailwind CSS 4 · TypeScript · Firebase (optional)
