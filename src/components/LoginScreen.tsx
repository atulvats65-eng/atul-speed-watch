import { useEffect, useState } from "react";
import { Button, Card, Field, Input } from "./ui";
import { signIn, signInGoogle } from "../lib/store";
import { getSupabase, isSupabaseReady } from "../lib/supabase";

export default function LoginScreen() {
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // If Supabase redirected back from Google OAuth, finalize the sign-in.
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    let cancelled = false;
    void sb.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const user = data.session?.user;
      if (!user) return;
      signInGoogle({
        uid: user.id,
        email: user.email ?? undefined,
        displayName: user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email?.split("@")[0],
      });
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;
      if (!user) return;
      signInGoogle({
        uid: user.id,
        email: user.email ?? undefined,
        displayName: user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email?.split("@")[0],
      });
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const submit = async () => {
    if (key.trim().length < 4) {
      setError("Kam se kam 4 characters ki key daaliye.");
      return;
    }
    setBusy(true);
    const ok = await signIn(key, name);
    setBusy(false);
    if (!ok) setError("Yeh key valid nahi hai. Admin se access key lo.");
  };

  const googleLogin = async () => {
    if (!isSupabaseReady()) {
      setError("Supabase configured nahi hai — Google login ke liye Supabase setup chahiye.");
      return;
    }
    const sb = getSupabase();
    if (!sb) {
      setError("Supabase client initialize nahi hua.");
      return;
    }
    try {
      setBusy(true);
      const { data, error } = await sb.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
      // If a session is already present (e.g. OAuth popup flow on some setups),
      // finalize the sign-in immediately; otherwise the redirect handles it.
      const { data: sess } = await sb.auth.getSession();
      if (sess.session?.user) {
        const user = sess.session.user;
        signInGoogle({
          uid: user.id,
          email: user.email ?? undefined,
          displayName: user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email?.split("@")[0],
        });
      }
      void data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google login failed");
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <Card className="w-full max-w-md p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-slate-900 text-white shadow">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold">ATUL Speed Watch</h1>
            <p className="text-xs text-slate-500">Professional Delivery Panel</p>
          </div>
        </div>

        <div className="space-y-4">
          <Field label="Aapka naam (optional)">
            <Input placeholder="e.g. Rahul" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Access key">
            <Input
              placeholder="Access key"
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </Field>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <Button className="w-full" onClick={submit} disabled={busy}>
            {busy ? "Check ho raha hai…" : "Panel kholen"}
          </Button>

          <div className="flex items-center gap-3 py-1">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-[11px] uppercase text-slate-400">ya</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <Button className="w-full bg-white text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50" onClick={googleLogin} disabled={busy}>
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.43 3.45 1.18 4.93l3.66-2.84z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Gmail se login karein
          </Button>

          <p className="text-center text-xs text-slate-400">
            Access key admin se lo · <span className="font-medium text-slate-600">ATUL-ADMIN</span> = admin
          </p>
        </div>
      </Card>
    </div>
  );
}
