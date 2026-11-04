# Supabase Database Backend — Setup Guide

ATUL Speed Watch **Supabase** ko apne database backend ke roop me use karta
hai. Jab `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` configured hote hain,
saara data (orders, users, services, transactions, SMM config) Supabase tables
par sync hota hai aur doosre devices/sessions se **live (realtime)** update
hota hai. Google login bhi Supabase Auth se chalta hai.

> **Default behavior:** Agar Supabase configured nahi hai to app bilkul pehle ki
> tarah localStorage par chalti rahegi. Supabase sirf tab use hota hai jab
> `.env` me sahi values hon.

---

## Step 1 — Supabase project banao

1. [Supabase](https://supabase.com/) par jao aur **New project** dabao.
2. Naam do (e.g. `atul-speed-watch`), ek strong DB password rakho, aur region
   choose karo (apne paas wali, e.g. `ap-south-1`).
3. Create karo aur kuch minute wait karo.

---

## Step 2 — Schema (tables + rules) deploy karo

`supabase/schema.sql` me saare tables aur RLS policies hain (access_keys, users,
cloud_orders, services, api_configs, transactions). Inhe Supabase SQL Editor me
chalao:

1. Supabase Dashboard me **SQL Editor** kholo.
2. `supabase/schema.sql` ka pura content paste karo.
3. **Run** dabao.

> ⚠️ **Security note:** Ye shared panel hai, isliye read/write policies `true`
> hain (koi bhi anon key se padh/likh sakta hai). Production ke liye ise
> tighten karo — e.g. sirf admin user ko write allow karo.

---

## Step 3 — .env me config bharo

Project ke root me `.env` file banao (`.env.example` copy karke):

```sh
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

- `VITE_SUPABASE_URL` → Dashboard → **Settings → API → Project URL**
- `VITE_SUPABASE_ANON_KEY` → **Settings → API → anon public key**

> 🔑 Anon key **safe** hai browser ke liye (RLS policies hi access control
> deti hain). Service role key **kabhi bhi** browser me mat daalo.

---

## Step 4 — Google login chalu karo (optional, recommended)

Login page par **Gmail se login** Supabase Auth use karta hai.

1. Supabase Dashboard → **Authentication → Providers → Google**.
2. **Enable** karo.
3. Google Cloud Console me OAuth Client ID + Secret banao aur yahan daalo
   (redirect URL Supabase dikhata hai — use wahi URL).
4. Save karo.

---

## Step 5 — App chalao

```sh
npm install
npm run dev
```

Settings page me **"Supabase connected"** dikhega. Ab order place karo / key
banao — data Supabase tables me dikhega. Doosre browser/device me bhi same data
dikhega (CloudSync realtime se merge karta hai).

---

## Data model (Supabase tables)

| Table | Key | Contents |
|-------|-----|----------|
| `access_keys` | `code` (unique) | name, note, is_admin, active, duration, expires_at |
| `users` | id | key_code, name |
| `cloud_orders` | `id` (order id) | owner_code, data (jsonb order), updated_at |
| `services` | `id` | owner_code, data (jsonb service) |
| `api_configs` | `owner_code` | url, key, backup_url, backup_key |
| `transactions` | `id` | owner_code, data (jsonb tx) |

Har user-owned row `owner_code` = current session (access) key se namespaced hai,
isliye har key apna data hi dekhta hai.

---

## SMM API — CORS problem aur proxy

Aapka SMM provider (jaise YoYo Media) browser se seedhe call **allow nahi
karta** (CORS block). Isliye "Test connection" browser me "Failed to fetch" /
"404" error deta hai, chahe URL-key sahi ho.

**Solution:** App me ek server-side proxy hai:

- **Dev mode** (`npm run dev`): Vite plugin `vite-proxy.plugin.mjs` `/api/smm`
  route ko handle karta hai.
- **Production** (`npm run build` + `npm start`): `server.mjs` `/api/smm` proxy
  ke saath `dist/` serve karta hai.

Frontend ab `/api/smm` par request bhejta hai (browser se seedha API par nahi),
lekin server-side se provider ko call karta hai. Ye URL + `/v2` dono try karta
hai.

---

## Troubleshooting

- **Settings me "LocalStorage" dikh raha hai** → `.env` sahi jagah hai? Project
  ke root me (src me nahi). Variable names bilkul `.env.example` jaisi hon.
- **Supabase configured hai par data sync nahi ho raha** → `CloudSync` component
  App me render ho raha hai? `isSupabaseReady()` `true` return kar raha hai?
  Schema deploy kiya hai?
- **Google login kaam nahi kar raha** → Supabase me Google provider enable hai?
  Redirect URL sahi hai?
