# Deploy karne ka guide (link dene ke liye)

Aapko ek **link** chahiye jise dost browser me kholke use kare. Ye do free
tarike hain. **Domain kuch nahi chahiye** - hosting apna link degi.

---

## Option A: Vercel (sabse aasan, bina GitHub)

1. **deploy-vercel.bat** par double-click karo (is folder me hai).
2. Pehli baar browser khulega → **Vercel account banao** (GitHub/Google se signup).
3. Prompts me:
   - Build Command → `npm run build`
   - Output Directory → `dist`
4. Ho gaya → link milega: `https://<project>.vercel.app`

> `node` (Node.js) install hona chahiye. Nahi hai to https://nodejs.org se lo.

---

## Option B: Firebase Hosting

Project me `firebase.json` pehle se hosting ke liye ready hai (dist folder).

```sh
npm install -g firebase-tools
firebase login
npm run build
firebase deploy --only hosting
```
Link: `https://<project>.web.app`

---

## Important (dono me)

- App **time se progress compute** karti hai → orders kabhi "rukte" nahi dikhte,
  jab bhi kholo sahi progress dikhta hai.
- Agar `.env` me `VITE_FIREBASE_*` config ho → data **Firestore me cloud** hota
  hai, isliye dost bhi same orders dekhega (orders shared).
- **Static hosting** (Vercel/Firebase free) `server.mjs` ka background loop nahi
  chala sakti — par iski zaroorat nahi kyunki browser khud lagta hai.

---

## Link dost ko do

Deploy ke baad aaya `https://...` link copy karke dost ko WhatsApp/Telegram par bhej do. Wo browser me kholke use karega.
