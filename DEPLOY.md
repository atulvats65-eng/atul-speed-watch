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

## Option B: Node server (server.mjs)

```sh
npm run build
npm start        # server.mjs → http://localhost:8080
```
> `PORT` environment variable se port badla ja sakta hai.

---

## Important (dono me)

- App **time se progress compute** karti hai → orders kabhi "rukte" nahi dikhte,
  jab bhi kholo sahi progress dikhta hai.
- Agar `.env` me `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` ho → data
  **Supabase tables me cloud** hota hai, isliye dost bhi same orders dekhega
  (orders shared, cross-device).
- **Static hosting** (Vercel) `server.mjs` ka background loop nahi chala sakti —
  par iski zaroorat nahi kyunki browser khud lagta hai. (SMM proxy ke liye
  server.mjs ya Vite proxy chahiye.)

---

## Link dost ko do

Deploy ke baad aaya `https://...` link copy karke dost ko WhatsApp/Telegram par
bhej do. Wo browser me kholke use karega.
