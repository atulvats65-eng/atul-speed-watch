import { useState } from "react";
import { isSupabaseReady } from "../lib/supabase";
import { signOut, updateSession, useSession } from "../lib/store";
import { Button, Card, Field, GhostButton, Input } from "./ui";
import { toast } from "./Toast";

export default function Settings() {
  const session = useSession();
  const [name, setName] = useState(session?.name ?? "");
  const [resetConfirm, setResetConfirm] = useState(false);

  const save = () => {
    if (!name.trim()) {
      toast("Naam khali nahi ho sakta.", "error");
      return;
    }
    updateSession({ name: name.trim() });
    toast("Profile update ho gayi.");
  };

  const resetData = () => {
    if (!resetConfirm) {
      setResetConfirm(true);
      return;
    }
    ["atul_orders", "atul_session", "atul_users", "atul_tx", "atul_api_cfg", "atul_services"].forEach((k) => localStorage.removeItem(k));
    window.location.reload();
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card className="space-y-4 p-6">
        <h2 className="text-sm font-semibold text-slate-700">Profile</h2>
        <Field label="Naam">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="flex items-center gap-3">
          <Button onClick={save}>Save</Button>
        </div>
        <div className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500">
          <div>Access key: <span className="font-mono font-medium text-slate-700">{session?.key}</span></div>
          <div className="mt-1">Role: {session?.admin ? "Admin" : "User"}</div>
          <div className="mt-1">
            Backend:{" "}
            {isSupabaseReady() ? (
              <span className="font-medium text-green-600">Supabase connected</span>
            ) : (
              <span className="font-medium text-slate-600">LocalStorage (Supabase config nahi hai)</span>
            )}
          </div>
        </div>
      </Card>

      <Card className="space-y-4 border-red-100 p-6">
        <h2 className="text-sm font-semibold text-red-700">Danger zone</h2>
        <div className="flex flex-wrap items-center gap-3">
          <GhostButton className="text-red-600 hover:bg-red-50" onClick={resetData}>
            {resetConfirm ? "Pakka? Dobara dabayein" : "Reset all data"}
          </GhostButton>
          <GhostButton onClick={() => signOut()}>Logout</GhostButton>
        </div>
      </Card>
    </div>
  );
}
