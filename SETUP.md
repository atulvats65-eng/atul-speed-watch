# Firebase Database Backend — Setup Guide

ATUL Speed Watch ab **Firebase Firestore** ko apne database backend ke roop me
use karta hai. Jab Firebase configure hota hai, saara data (orders, users,
balances, transactions, SMM config) cloud par sync hota hai aur doosre
devices/sessions se live update hota hai.

> **Default behavior:** Agar Firebase configure nahi hai to app bilkul pehle ki
> tarah localStorage par chalti rahegi. Firebase sirf tab use hota hai jab
> `.env` me sahi values hon.

---

## Step 1 — Firebase project banao

1. [Firebase Console](https://console.firebase.google.com/) kholo.
2. **Add project** dabao, naam do (e.g. `atul-speed-watch`), aur Google Analytics
   on/off choose karke project banao.
3. Project khulne par **Build → Firestore Database** par jao.
   - **Create database** dabao.
   - Mode me **Production mode** choose karo (rules baad me lagayenge).
   - Location choose karo (apne paas koi bhi, e.g. `asia-south1`).

---

## Step 2 — Web app (Firebase config) banao

1. Console me **Project Settings → General** par jao.
2. Neeche **Your apps** section me **Web** (`</>`) icon par click karo.
3. App ka naam do (e.g. `atul-web`), **Register app** dabao.
4. Firebase SDK config dikhegi (`apiKey`, `projectId`, `appId`, ...). Inko copy karo.

---

## Step 3 — .env me config bharo

Project ke root me `.env` file banao (`.env.example` copy karke):

```sh
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

> Firebase console se footer wali config ka `messagingSenderId` aur `storageBucket`
> bhi yahi aata hai. Agar koi value na mile to `authDomain` = `PROJECT_ID.firebaseapp.com`
> aur `storageBucket` = `PROJECT_ID.appspot.com`.

---

## Step 4 — Authentication chalu karo (optional, recommended)

Firestore rules abhi `request.auth != null` maangte hain, isliye kam se kam ek
user banao:

1. Console me **Build → Authentication → Get started**.
2. **Sign-in method** me **Email/Password** enable karo.
3. Us tab **Users** me ek user add karo (koi bhi email/password).

---

## Step 5 — Firestore rules deploy karo

`firestore.rules` file project me already hai. Inhe deploy karne ke liye:

### Option A: Console se
1. Console me **Firestore Database → Rules** tab kholo.
2. `firestore.rules` ka content paste karke **Publish** dabao.

### Option B: Firebase CLI se
```sh
npm install -g firebase-tools
firebase login
firebase init firestore   # rules file select karo
firebase deploy --only firestore:rules
```

> ⚠️ **Security note:** Diye gaye rules saare *authenticated* users ko read/write
> dete hain (kyunki ye ek shared panel hai). Production ke liye ise tighten karo —
> jaise sirf admin user ko write allow karo. Agar aap chahte ho ki bina login ke
> bhi chale, to rules me `request.auth != null` hata kar `true` kar do (lekin
> ye saare users ko public access dega).

---

## Step 6 — App chalao

```sh
npm install
npm run dev
```

Settings page me **"Firebase connected"** dikhega. Ab order place karo / user
banao — data Firestore me dikhega. Doosre browser/device me bhi same data dikhega
(CloudSync har change ko live merge karta hai).

---

## Step 7 — Scheduled delivery engine (Cloud Function) deploy karo ⭐

**Ye zyada important hai.** Iske bina orders *sirf tab tak* deliver hote hain jab
kuch device/browser on ho (ya `server.mjs` chal raha ho). Isse har **2 minute**
par saare orders Firestore me automatically advance hote hain — exactly Supabase ke
`pg_cron` jaisa. **Chahe har device/laptop band ho, delivery chalti rehti hai.**

Solution `functions/` folder me hai (`index.js` + `delivery.js`).

### Deploy karo (ek baar):
```sh
cd functions
npm install          # firebase-admin + firebase-functions install karo
cd ..
npm install -g firebase-tools
firebase login
firebase deploy --only functions
```

Deploy hone par:
- **`dripTick`** — scheduled (har 2 min) delivery engine. Ye Firestore ke `orders`
  collection se sab orders padhta hai, har order ka progress uske schedule (createdAt +
  profile) se recompute karta hai, aur `delivered` / `statusTxt` / `completedAt`
  wapas write karta hai.
- **`dripTickHttp`** — manual/external trigger (`POST https://<region>-<project>.cloudfunctions.net/dripTickHttp`)
  taaki aap apne kisi bhi cron se bhi bula sako.
- **`status`** — sanity check (`GET .../status` → `{ total, pending, completed }`).

> ⚠️ **Pahli baar deploy:** Firebase project me **Cloud Functions enable** hona
> chahiye (Console → Build → Functions → Get started). Scheduled functions ke liye
> Cloud Scheduler bhi auto-ban jata hai. Tumhare Firebase **plan** me scheduled
> functions free tier (`Spark`) me allow **nahi** hain — unhe **Blaze (pay-as-you-go)**
> plan chahiye. Ye Supabase ke pg_cron jaisa hi managed scheduler hai.

### Verify karo
```sh
firebase functions:log --only dripTick
```
Har 2 min me `drip-tick: N/M orders advanced` dikhega.

### Note — browser bhi khud compute karta hai
App ka browser `engine.ts` se progress **client-side bhi** compute karta hai, isliye
UI hamesha sahi dikhta hai. Cloud Function **authoritative server state** banata hai
taaki data Firestore me hamesha updated rahe aur kisi bhi device par open karne par
latest mile.

---

## SMM API — CORS problem aur proxy

Aapka SMM provider (jaise YoYo Media) browser se seedhe call **allow nahi karta**
(CORS block). Isliye "Test connection" browser me "Failed to fetch" / "404" error
deta hai, chahe URL-key sahi ho.

**Solution:** App me ab ek server-side proxy hai:

- **Dev mode** (`npm run dev`): Vite plugin `vite-proxy.plugin.mjs` `/api/smm`
  route ko handle karta hai.
- **Production** (`npm run build` + `npm start`): `server.mjs` `/api/smm` proxy
  ke saath `dist/` serve karta hai.

Frontend ab `/api/smm` par request bhejta hai (browser se seedha API par nahi),
likin server-side se provider ko call karta hai. Ye URL + `/v2` dono try karta hai.

**Production me chalane ke liye:**
```sh
npm run build
npm start        # server.mjs → http://localhost:8080
```
> `PORT` environment variable se port badla ja sakta hai.

---

## Data model (Firestore collections)

| Collection | Doc ID | Contents |
|-----------|--------|----------|
| `orders` | order id (e.g. `AT...`) | service, quantity, charge, profile, night, humanize, etc. |
| `users` | access key | name, admin, active, balance, createdAt |
| `transactions` | tx id (timestamp) | userKey, type, amount, status, note, at |
| `apiConfig` | `settings` | url, key, backupUrl, backupKey |

---

## Troubleshooting

- **Settings me "LocalStorage" dikh raha hai** → `.env` sahi jagah hai? Project ke
  root me (src me nahi). Variable names bilkul `.env.example` jaisi hon.
- **Write fail ho raha hai / "permission denied"** → Authentication me user maujood
  hai? Rules deploy kiye hain? App us user se sign-in hai?
- **Firebase configured hai par data sync nahi ho raha** → `CloudSync` component
  App me render ho raha hai? `isFirebaseReady()` `true` return kar raha hai?
