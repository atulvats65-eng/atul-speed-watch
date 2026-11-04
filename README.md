# ATUL Speed Watch — Social Panel

A professional social-media delivery panel: place orders (views / likes /
followers / comments), choose delivery speed and night mode, and track live
progress — with an optional Supabase backend.

## Features
- **Dashboard** — totals, active orders, delivered units, spend, and a 7-day delivery chart
- **New Order** — pick service, link, quantity, bonus likes, speed profile (Safe/Normal/Turbo/Micro/Custom), night mode, and **Humanize/Bot-safe** delivery
- **Orders** — live progress bars, status badges, ETA, cancel & delete, status filters
- **Services** — all services with rates
- **SMM API** — connect your SMM provider (URL + API key + backup), test connection
- **Admin** — user/access keys, orders overview, service manager
- **Settings** — profile, account info, reset data
- **Backend (optional)** — Supabase sync (cross-device) + Google login when configured

## Run locally
```sh
npm install
npm run dev
```
Then open `http://localhost:5173` (or the printed port).

## Access
Any verified key opens the panel. `ATUL-ADMIN` grants admin access. Admin can
generate access keys on the Admin page; keys sync to Supabase so they work on
any device.

## Supabase backend (database)

Supabase tables ko database backend ke roop me use karta hai. Jab `.env` me
`VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` bhari hoti hai, saara data —
orders, users, services, transactions aur SMM config — cloud par sync hota hai
aur doosre devices se live update hota hai (realtime). Bina config ke app
localStorage par chalti rahegi.

Setup ke liye `SETUP.md` dekho. Tables: `access_keys`, `users`,
`cloud_orders`, `services`, `api_configs`, `transactions` (see `supabase/schema.sql`).

```sh
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## Tech
React 19 · Vite 8 · Tailwind CSS 4 · TypeScript · Supabase (optional)
