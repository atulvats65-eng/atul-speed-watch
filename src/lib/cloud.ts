// Cloud sync layer. Mirrors the app's data (orders, users, transactions, SMM
// config) to Firestore when Firebase is configured, and listens for remote
// changes. Never throws when Firebase is not configured — all calls become
// no-ops so the app keeps working on localStorage.

import { cloudSet, cloudDelete, cloudGet, cloudWatch, isFirebaseReady } from "./firebase";
import { getSupabase } from "./supabase";
import type { Order } from "./engine";
import type { PanelUser, ApiCfg, Tx } from "./store";

const C_ORDERS = "orders";
const C_USERS = "users";
const C_API = "apiConfig";
const C_TX = "transactions";
const API_SETTINGS_ID = "settings";

/* ---- Orders ---- */

export function cloudPushOrders(orders: Order[]) {
  if (!isFirebaseReady()) return;
  for (const o of orders) {
    void cloudSet(C_ORDERS, o.id, o as unknown as Record<string, unknown>);
  }
}

export function cloudRemoveOrder(id: string) {
  if (!isFirebaseReady()) return;
  void cloudDelete(C_ORDERS, id);
}

export function cloudWatchOrders(cb: (orders: Order[]) => void) {
  return cloudWatch(C_ORDERS, (docs) => {
    const orders = docs.map((d) => d.data as unknown as Order);
    orders.sort((a, b) => b.createdAt - a.createdAt);
    cb(orders);
  });
}

/* ---- Users ---- */

export function cloudWriteUsers(all: Record<string, PanelUser>) {
  if (!isFirebaseReady()) return;
  for (const [key, u] of Object.entries(all)) {
    void cloudSet(C_USERS, key, u as unknown as Record<string, unknown>);
  }
}

export function cloudWatchUsers(cb: (all: Record<string, PanelUser>) => void) {
  return cloudWatch(C_USERS, (docs) => {
    const map: Record<string, PanelUser> = {};
    for (const d of docs) map[d.id] = d.data as unknown as PanelUser;
    cb(map);
  });
}

export async function cloudGetUser(key: string): Promise<PanelUser | null> {
  // Firebase registry fallback
  if (isFirebaseReady()) {
    const data = await cloudGet(C_USERS, key);
    if (data) return data as unknown as PanelUser;
  }
  // Supabase access_keys registry (cross-device)
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from("access_keys")
      .select("code, name, note, is_admin, active, duration, expires_at")
      .eq("code", key)
      .maybeSingle();
    if (!error && data) {
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
  }
  return null;
}

/* ---- Transactions ---- */

export function cloudWriteTx(list: Tx[]) {
  if (!isFirebaseReady()) return;
  for (const t of list) {
    void cloudSet(C_TX, t.id, t as unknown as Record<string, unknown>);
  }
}

export function cloudWatchTx(cb: (list: Tx[]) => void) {
  return cloudWatch(C_TX, (docs) => {
    const list = docs.map((d) => d.data as unknown as Tx);
    list.sort((a, b) => b.at - a.at);
    cb(list);
  });
}

/* ---- SMM API config ---- */

export function cloudWriteApiCfg(cfg: ApiCfg) {
  if (!isFirebaseReady()) return;
  void cloudSet(C_API, API_SETTINGS_ID, cfg as unknown as Record<string, unknown>);
}

export function cloudWatchApiCfg(cb: (cfg: ApiCfg) => void) {
  return cloudWatch(C_API, (docs) => {
    const d = docs.find((x) => x.id === API_SETTINGS_ID);
    if (d) cb(d.data as unknown as ApiCfg);
  });
}
