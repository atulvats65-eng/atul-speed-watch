// Cloud sync layer (Supabase). Mirrors the app's data (orders, users, services,
// transactions, SMM config) to Supabase tables and listens for realtime changes.
// Never throws when Supabase is not configured — all calls become no-ops so the
// app keeps working on localStorage.
//
// Tables (see supabase/schema.sql): access_keys, cloud_orders, services,
// api_configs, transactions. Every user-owned row is namespaced by owner_code =
// the current session (access) key.

import { getSupabase, isSupabaseReady } from "./supabase";
import type { Order, Service } from "./engine";
import type { PanelUser, ApiCfg, Tx } from "./store";

function currentOwnerCode(): string {
  try {
    const raw = localStorage.getItem("atul_session");
    if (!raw) return "";
    const s = JSON.parse(raw) as { key?: string } | null;
    return s?.key ?? "";
  } catch {
    return "";
  }
}

function iso(): string {
  return new Date().toISOString();
}

/* ---- Orders (cloud_orders) ---- */

export function cloudPushOrders(orders: Order[]) {
  const sb = getSupabase();
  const owner = currentOwnerCode();
  if (!sb || !isSupabaseReady() || !owner) return;
  const rows = orders.map((o) => ({
    id: o.id,
    owner_code: owner,
    data: o as unknown as Record<string, unknown>,
    updated_at: iso(),
  }));
  void sb.from("cloud_orders").upsert(rows, { onConflict: "id" });
}

export function cloudRemoveOrder(id: string) {
  const sb = getSupabase();
  const owner = currentOwnerCode();
  if (!sb || !isSupabaseReady() || !owner) return;
  void sb.from("cloud_orders").delete().eq("id", id).eq("owner_code", owner);
}

export function cloudWatchOrders(cb: (orders: Order[]) => void) {
  const sb = getSupabase();
  const owner = currentOwnerCode();
  if (!sb || !isSupabaseReady() || !owner) return () => {};
  const load = () => {
    sb.from("cloud_orders")
      .select("data")
      .eq("owner_code", owner)
      .then(({ data }) => {
        if (!data) return;
        const orders = data.map((r) => r.data as unknown as Order);
        orders.sort((a, b) => b.createdAt - a.createdAt);
        cb(orders);
      });
  };
  load();
  const ch = sb
    .channel(`orders-${owner}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "cloud_orders", filter: `owner_code=eq.${owner}` },
      load,
    )
    .subscribe();
  return () => {
    void sb.removeChannel(ch);
  };
}

/* ---- Users (access_keys) ---- */

export function cloudWriteUsers(all: Record<string, PanelUser>) {
  const sb = getSupabase();
  if (!sb || !isSupabaseReady()) return;
  const rows = Object.values(all).map((u) => ({
    code: u.key,
    name: u.name,
    note: u.note ?? null,
    is_admin: !!u.admin,
    active: !!u.active,
    duration: u.duration || "lifetime",
    expires_at: u.expiresAt && Number.isFinite(u.expiresAt) ? new Date(u.expiresAt).toISOString() : null,
  }));
  void sb.from("access_keys").upsert(rows, { onConflict: "code" });
}

export function cloudWatchUsers(cb: (all: Record<string, PanelUser>) => void) {
  const sb = getSupabase();
  if (!sb || !isSupabaseReady()) return () => {};
  const load = () => {
    sb.from("access_keys")
      .select("code, name, note, is_admin, active, duration, expires_at")
      .then(({ data }) => {
        if (!data) return;
        const map: Record<string, PanelUser> = {};
        for (const d of data) {
          map[d.code] = {
            key: d.code,
            name: d.name || "User",
            admin: !!d.is_admin,
            active: !!d.active,
            createdAt: 0,
            duration: d.duration || "lifetime",
            expiresAt: d.expires_at ? new Date(d.expires_at).getTime() : undefined,
            note: d.note || undefined,
          };
        }
        cb(map);
      });
  };
  load();
  const ch = sb
    .channel("users")
    .on("postgres_changes", { event: "*", schema: "public", table: "access_keys" }, load)
    .subscribe();
  return () => {
    void sb.removeChannel(ch);
  };
}

export async function cloudGetUser(key: string): Promise<PanelUser | null> {
  const sb = getSupabase();
  if (!sb || !isSupabaseReady()) return null;
  const { data, error } = await sb
    .from("access_keys")
    .select("code, name, note, is_admin, active, duration, expires_at")
    .eq("code", key)
    .maybeSingle();
  if (error || !data) return null;
  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : undefined;
  return {
    key: data.code,
    name: data.name || "User",
    admin: !!data.is_admin,
    active: !!data.active,
    createdAt: 0,
    duration: data.duration || "lifetime",
    expiresAt,
    note: data.note || undefined,
  };
}

/* ---- Services (services) ---- */

export function cloudWriteServices(list: Service[]) {
  const sb = getSupabase();
  const owner = currentOwnerCode();
  if (!sb || !isSupabaseReady() || !owner) return;
  const rows = list.map((s) => ({
    id: s.id,
    owner_code: owner,
    data: s as unknown as Record<string, unknown>,
    updated_at: iso(),
  }));
  void sb.from("services").upsert(rows, { onConflict: "owner_code,id" });
}

export function cloudRemoveService(id: string) {
  const sb = getSupabase();
  const owner = currentOwnerCode();
  if (!sb || !isSupabaseReady() || !owner) return;
  void sb.from("services").delete().eq("id", id).eq("owner_code", owner);
}

export function cloudWatchServices(cb: (list: Service[]) => void) {
  const sb = getSupabase();
  const owner = currentOwnerCode();
  if (!sb || !isSupabaseReady() || !owner) return () => {};
  const load = () => {
    sb.from("services")
      .select("data")
      .eq("owner_code", owner)
      .then(({ data }) => {
        if (!data) return;
        cb(data.map((r) => r.data as unknown as Service));
      });
  };
  load();
  const ch = sb
    .channel(`services-${owner}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "services", filter: `owner_code=eq.${owner}` },
      load,
    )
    .subscribe();
  return () => {
    void sb.removeChannel(ch);
  };
}

/* ---- Transactions (transactions) ---- */

export function cloudWriteTx(list: Tx[]) {
  const sb = getSupabase();
  const owner = currentOwnerCode();
  if (!sb || !isSupabaseReady() || !owner) return;
  const rows = list.map((t) => ({
    id: t.id,
    owner_code: owner,
    data: t as unknown as Record<string, unknown>,
    updated_at: iso(),
  }));
  void sb.from("transactions").upsert(rows, { onConflict: "id" });
}

export function cloudWatchTx(cb: (list: Tx[]) => void) {
  const sb = getSupabase();
  const owner = currentOwnerCode();
  if (!sb || !isSupabaseReady() || !owner) return () => {};
  const load = () => {
    sb.from("transactions")
      .select("data")
      .eq("owner_code", owner)
      .then(({ data }) => {
        if (!data) return;
        const list = data.map((r) => r.data as unknown as Tx);
        list.sort((a, b) => b.at - a.at);
        cb(list);
      });
  };
  load();
  const ch = sb
    .channel(`tx-${owner}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "transactions", filter: `owner_code=eq.${owner}` },
      load,
    )
    .subscribe();
  return () => {
    void sb.removeChannel(ch);
  };
}

/* ---- SMM API config (api_configs) ---- */

export function cloudWriteApiCfg(cfg: ApiCfg) {
  const sb = getSupabase();
  const owner = currentOwnerCode();
  if (!sb || !isSupabaseReady() || !owner) return;
  void sb.from("api_configs").upsert(
    {
      owner_code: owner,
      url: cfg.url,
      key: cfg.key,
      backup_url: cfg.backupUrl,
      backup_key: cfg.backupKey,
      updated_at: iso(),
    },
    { onConflict: "owner_code" },
  );
}

export function cloudWatchApiCfg(cb: (cfg: ApiCfg) => void) {
  const sb = getSupabase();
  const owner = currentOwnerCode();
  if (!sb || !isSupabaseReady() || !owner) return () => {};
  const load = () => {
    sb.from("api_configs")
      .select("url, key, backup_url, backup_key")
      .eq("owner_code", owner)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        cb({
          url: data.url || "",
          key: data.key || "",
          backupUrl: data.backup_url || "",
          backupKey: data.backup_key || "",
        });
      });
  };
  load();
  const ch = sb
    .channel(`api-${owner}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "api_configs", filter: `owner_code=eq.${owner}` },
      load,
    )
    .subscribe();
  return () => {
    void sb.removeChannel(ch);
  };
}

