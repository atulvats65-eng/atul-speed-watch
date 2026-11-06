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

> ⚠️ **Security note:** The base `schema.sql` ships with **open** RLS policies
> (`using (true)`) so the app works out of the box. **Do not rely on this for
> production.** Apply `supabase/migration_owner_rls.sql` and enable Supabase
> Auth **before** sharing the panel — otherwise anyone can read/edit every
> user's rows (including SMM provider keys).

---

## Step 3 — .env me config bharo

Project ke root me `.env` file banao (`.env.example` copy karke):

```sh
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

- `VITE_SUPABASE_URL` → Dashboard → **Settings → API → Project URL**
- `VITE_SUPABASE_ANON_KEY` → **Settings → API → anon public key**

> 🔑 The **anon key is not authorization** — it only identifies the project.
> Access is controlled by RLS policies. With the base schema the policies are
> open; you must apply the owner-RLS migration (Step 4b) so that only the row
> owner (auth.uid()) can read/write their data. The service-role key must
> **never** go in the browser.

---

## Step 4 — Google login chalu karo (optional, recommended)

Login page par **Gmail se login** Supabase Auth use karta hai.

1. Supabase Dashboard → **Authentication → Providers → Google**.
2. **Enable** karo.
3. Google Cloud Console me OAuth Client ID + Secret banao aur yahan daalo
   (redirect URL Supabase dikhata hai — use wahi URL).
4. Save karo.

---

## Step 4b — Security hardening (apply owner-RLS migration) ⭐

Before sharing the panel, lock the database down:

1. Enable **Supabase Auth** (Settings → Authentication → Providers → email OTP
   and/or Google).
2. Run `supabase/migration_owner_rls.sql` in the SQL Editor. It:
   - adds `owner_id uuid default auth.uid()` and **owner-only RLS policies** to
     `cloud_orders`, `services`, `transactions`, `api_configs`
   - makes `access_keys` **unreadable by clients** and adds a security-definer
     `redeem_key(code)` RPC (checks active/expired and links the key to the
     calling user)
   - changes `services`/`cloud_orders`/`transactions` primary keys to
     per-owner composite keys `(owner_id, id)`
   - keeps the raw SMM provider key server-side (client only sees a suffix)
3. Create the `profiles` table entries (admin flag) via a server-side admin
   script — **never** from the browser.

> After this migration, the client sync layer must call `redeem_key` and use
> `auth.uid()` as the owner. The remaining client work is covered in later
> phases; do not rely on the open `schema.sql` policies for production.

## Server-side secrets (used by server.mjs / api functions)

- `PANEL_SERVER_SECRET` — shared secret for `/api/*` in Node server mode
  (set it to protect `/api/orders` and the proxy).
- `PROVIDER_ALLOW_HOSTS` — comma-separated allowlist of SMM provider hosts the
  proxy may call (default includes `yoyomedia.in`). Everything else is rejected
  (SSRF guard).
- Provider SMM API keys are stored server-side only (see S2/S6).

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
