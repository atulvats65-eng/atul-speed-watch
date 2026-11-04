// localStorage-backed order store with reactive hook. When Supabase is
// configured, every change is also mirrored to Supabase (best-effort).
import { useSyncExternalStore } from "react";
import type { Order, Service, ServiceKind } from "./engine";
import { getSupabase, isSupabaseReady } from "./supabase";
import {
  cloudGetUser,
  cloudPushOrders,
  cloudRemoveOrder,
  cloudWriteUsers,
  cloudWriteApiCfg,
  cloudWriteTx,
  cloudWriteServices,
} from "./cloud";
import { remotePushOrder, remoteRemoveOrder } from "./remote";

const EVT = "atul-store";

// Namespace every user-data key by the current session key, so each access key
// sees only its own orders / services / API config (per-key isolation).
function nsKey(base: string): string {
  const s = read<Session | null>(K_SESSION, null);
  return s && s.key ? `${base}:${s.key}` : base;
}

const K_ORDERS_BASE = "atul_orders";
const K_ORDERS = () => nsKey(K_ORDERS_BASE);

function read<T>(k: string, fallback: T): T {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(k: string, v: unknown) {
  localStorage.setItem(k, JSON.stringify(v));
  cache.delete(k);
  window.dispatchEvent(new Event(EVT));
}

const cache = new Map<string, { raw: string | null; val: unknown }>();

function useStored<T>(k: string, fallback: T): T {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener(EVT, cb);
      window.addEventListener("storage", cb);
      return () => {
        window.removeEventListener(EVT, cb);
        window.removeEventListener("storage", cb);
      };
    },
    () => {
      const raw = localStorage.getItem(k);
      const c = cache.get(k);
      if (c && c.raw === raw) return c.val as T;
      const val = read(k, fallback);
      cache.set(k, { raw, val });
      return val;
    },
    () => fallback,
  );
}

const EMPTY: never[] = [];
export const useOrders = () => useStored<Order[]>(K_ORDERS(), EMPTY);
export const getOrders = () => read<Order[]>(K_ORDERS(), []);
export function setOrders(orders: Order[]) {
  write(K_ORDERS(), orders);
}
export function addOrder(o: Order) {
  const s = read<Session | null>(K_SESSION, null);
  const order = s && !o.userKey ? { ...o, userKey: s.key } : o;
  void s;
  const next = [order, ...getOrders()];
  setOrders(next);
  if (isSupabaseReady()) cloudPushOrders(next);
  remotePushOrder(order);
}
export function updateOrder(id: string, patch: Partial<Order>) {
  const next = getOrders().map((o) => (o.id === id ? { ...o, ...patch } : o));
  setOrders(next);
  const target = next.find((o) => o.id === id);
  if (target) {
    if (isSupabaseReady()) cloudPushOrders([target]);
    remotePushOrder(target);
  }
}
export function deleteOrder(id: string) {
  setOrders(getOrders().filter((o) => o.id !== id));
  if (isSupabaseReady()) cloudRemoveOrder(id);
  remoteRemoveOrder(id);
}

// One-time cleanup: removes leftover demo/test orders (marked with "Demo" in
// the service name or "demo-"/"mini-" in the link) from storage.
export function purgeDemoOrders() {
  const all = getOrders();
  const filtered = all.filter(
    (o) =>
      !(o.serviceName && o.serviceName.includes("Demo")) &&
      !(o.link && (o.link.includes("demo-") || o.link.includes("mini-"))),
  );
  if (filtered.length !== all.length) setOrders(filtered);
}

/* ---- SMM API config ---- */
export interface ApiCfg {
  url: string;
  key: string;
  backupUrl: string;
  backupKey: string;
}

const K_API_CFG_BASE = "atul_api_cfg";
const K_API_CFG = () => nsKey(K_API_CFG_BASE);
const EMPTY_API: ApiCfg = { url: "", key: "", backupUrl: "", backupKey: "" };
export const useApiCfg = () => useStored<ApiCfg>(K_API_CFG(), EMPTY_API);
export const getApiCfg = () => read<ApiCfg>(K_API_CFG(), EMPTY_API);
export function saveApiCfg(cfg: ApiCfg) {
  write(K_API_CFG(), cfg);
  if (isSupabaseReady()) cloudWriteApiCfg(cfg);
}

/* ---- services (user-added + API imported — single unified list) ---- */
export interface ApiService {
  apiServiceId: string;
  name: string;
  category: string;
  kind: ServiceKind;
  rate: number;
  min: number;
  max: number;
}

const K_SERVICES_BASE = "atul_services";
const K_SERVICES = () => nsKey(K_SERVICES_BASE);
const K_API_SERVICES_LEGACY = "atul_api_services";

// One-time lift of old API-imported services (was `atul_api_services`) into the
// unified list so nothing is lost when defaults are removed.
function migrateLegacyServices(): Service[] {
  try {
    const raw = localStorage.getItem(K_API_SERVICES_LEGACY);
    if (!raw) return [];
    const legacy = JSON.parse(raw) as ApiService[];
    if (!Array.isArray(legacy) || legacy.length === 0) return [];
    const migrated: Service[] = legacy.map((s) => ({
      id: s.apiServiceId,
      name: s.name,
      category: s.category,
      kind: s.kind,
      rate: s.rate,
      min: s.min,
      max: s.max,
    }));
    const cur = read<Service[]>(K_SERVICES(), []);
    const byId = new Map(cur.map((s) => [s.id, s]));
    for (const s of migrated) byId.set(s.id, s);
    const merged = Array.from(byId.values());
    write(K_SERVICES(), merged);
    localStorage.removeItem(K_API_SERVICES_LEGACY);
    return merged;
  } catch {
    return read<Service[]>(K_SERVICES(), []);
  }
}

export const useServices = () => useStored<Service[]>(K_SERVICES(), EMPTY);
export const getServices = () => {
  const cur = read<Service[]>(K_SERVICES(), []);
  if (cur.length > 0) return cur;
  return migrateLegacyServices();
};
export function saveServices(list: Service[]) {
  write(K_SERVICES(), list);
  if (isSupabaseReady()) cloudWriteServices(list);
}
export function addService(s: Service) {
  saveServices([...getServices().filter((x) => x.id !== s.id), s]);
}
export function removeService(id: string) {
  saveServices(getServices().filter((s) => s.id !== id));
}
export function updateService(id: string, patch: Partial<Service>) {
  saveServices(getServices().map((s) => (s.id === id ? { ...s, ...patch } : s)));
}

// API import writes into the same unified list (append).
export function saveApiServices(list: ApiService[]) {
  const converted: Service[] = list.map((s) => ({
    id: s.apiServiceId,
    name: s.name,
    category: s.category,
    kind: s.kind,
    rate: s.rate,
    min: s.min,
    max: s.max,
    svcId: String(s.apiServiceId),
  }));
  saveServices([...getServices(), ...converted]);
}
export const useApiServices = () => useStored<Service[]>(K_SERVICES(), EMPTY);
export const getApiServices = () => getServices();

/* ---- session ---- */
export interface Session {
  key: string;
  admin: boolean;
  name: string;
}

const K_SESSION = "atul_session";
export const useSession = () => useStored<Session | null>(K_SESSION, null);

const KEY_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generateAccessKey(length = 8): string {
  let s = "";
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  for (let i = 0; i < length; i++) s += KEY_CHARS[arr[i]! % KEY_CHARS.length];
  return s;
}

export function adminCreateUser(
  name?: string,
  opts?: { duration?: string; isAdmin?: boolean; note?: string },
): string {
  let key = generateAccessKey();
  while (getUsers()[key]) key = generateAccessKey();
  const duration = opts?.duration || "lifetime";
  const ms = KEY_DURATION_MS[duration] ?? Infinity;
  const expiresAt = ms === Infinity ? undefined : Date.now() + ms;
  const all = getUsers();
  all[key] = {
    key,
    name: name?.trim() || opts?.note?.trim() || "User",
    admin: !!opts?.isAdmin,
    active: true,
    createdAt: Date.now(),
    duration,
    expiresAt,
    note: opts?.note?.trim() || undefined,
  };
  writeUsers(all);

  // Mirror to Supabase so the key works on any device.
  const sb = getSupabase();
  if (sb) {
    void sb.from("access_keys").insert({
      code: key,
      name: all[key]!.name,
      note: all[key]!.note ?? null,
      is_admin: !!opts?.isAdmin,
      active: true,
      duration,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
    }).then(({ error }) => {
      if (error) console.warn("Supabase key insert failed:", error.message);
    });
  }

  return key;
}

export function adminDeleteUser(key: string) {
  const all = getUsers();
  delete all[key];
  writeUsers(all);

  const sb = getSupabase();
  if (sb) {
    void sb.from("access_keys").delete().eq("code", key);
  }
}

export async function signIn(key: string, name?: string): Promise<boolean> {
  const k = key.trim();
  const admin = k.toUpperCase() === "ATUL-ADMIN";
  if (admin) {
    ensureUser({ key: k, admin: true, name: name?.trim() || "Admin" });
    write(K_SESSION, { key: k, admin: true, name: name?.trim() || "Admin" });
    return true;
  }
  // local check first
  const localUser = getUsers()[k];
  if (localUser) {
    if (!localUser.active) return false;
    if (isKeyExpired(localUser)) return false;
    write(K_SESSION, { key: k, admin: !!localUser.admin, name: name?.trim() || localUser.name || "User" });
    return true;
  }
  // fall back to cloud registry
  const cloudUser = await cloudGetUser(k);
  if (cloudUser) {
    if (!cloudUser.active) return false;
    ensureUser({ key: k, admin: cloudUser.admin, name: cloudUser.name });
    write(K_SESSION, { key: k, admin: cloudUser.admin, name: name?.trim() || cloudUser.name || "User" });
    return true;
  }
  // Only verified (admin-registered) keys open a panel. Each key has its own
  // isolated data. Use Gmail login if you don't have a verified key.
  return false;
}

export function signInGoogle(user: { uid: string; email?: string; displayName?: string }) {
  const key = "google:" + user.uid;
  const name = user.displayName || user.email?.split("@")[0] || "Google User";
  ensureUser({ key, admin: false, name });
  write(K_SESSION, { key, admin: false, name });
}

export function updateSession(patch: Partial<Session>) {
  const s = read<Session | null>(K_SESSION, null);
  if (!s) return;
  write(K_SESSION, { ...s, ...patch });
}

export function signOut() {
  localStorage.removeItem(K_SESSION);
  cache.delete(K_SESSION);
  window.dispatchEvent(new Event(EVT));
}

/* ---- users ---- */
export interface PanelUser {
  key: string;
  name: string;
  admin: boolean;
  active: boolean;
  createdAt: number;
  duration?: string;
  expiresAt?: number;
  note?: string;
}

export const KEY_DURATION_MS: Record<string, number> = {
  "1d": 86_400_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
  lifetime: Infinity,
};

export function isKeyExpired(u: PanelUser): boolean {
  return typeof u.expiresAt === "number" && Date.now() > u.expiresAt;
}

const K_USERS = "atul_users";
export const useUsers = () => useStored<Record<string, PanelUser>>(K_USERS, {});
export const getUsers = () => read<Record<string, PanelUser>>(K_USERS, {});
const writeUsers = (all: Record<string, PanelUser>) => {
  write(K_USERS, all);
  if (isSupabaseReady()) cloudWriteUsers(all);
};

function ensureUser(u: { key: string; admin: boolean; name: string }) {
  const all = getUsers();
  if (!all[u.key]) {
    all[u.key] = {
      key: u.key,
      name: u.name,
      admin: u.admin,
      active: true,
      createdAt: Date.now(),
    };
    writeUsers(all);
  }
}

export function upsertUser(u: PanelUser) {
  const all = getUsers();
  all[u.key] = u;
  writeUsers(all);
}

export function setUserActive(key: string, active: boolean) {
  const all = getUsers();
  const u = all[key];
  if (u) {
    u.active = active;
    writeUsers(all);
  }
}

/* ---- transactions ---- */
export interface Tx {
  id: string;
  userKey: string;
  type: string;
  amount: number;
  status: string;
  note?: string;
  at: number;
}

const K_TX_BASE = "atul_tx";
const K_TX = () => nsKey(K_TX_BASE);
export const useTx = () => useStored<Tx[]>(K_TX(), EMPTY);
export const getTx = () => read<Tx[]>(K_TX(), []);

export function addTx(t: Tx) {
  const next = [t, ...getTx()];
  write(K_TX(), next);
  if (isSupabaseReady()) cloudWriteTx(next);
}

/* ---- cloud -> local merge (used by CloudSync) ---- */
// These write straight to localStorage without re-pushing to the cloud so we
// don't create an echo loop when remote changes arrive.

export function applyCloudOrders(cloud: Order[]) {
  const local = getOrders();
  const byId = new Map(local.map((o) => [o.id, o]));
  for (const o of cloud) byId.set(o.id, o);
  const merged = Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt);
  write(K_ORDERS(), merged);
}

export function applyCloudUsers(cloud: Record<string, PanelUser>) {
  const local = getUsers();
  const merged: Record<string, PanelUser> = { ...cloud };
  for (const k of Object.keys(local)) if (!(k in merged)) merged[k] = local[k]!;
  write(K_USERS, merged);
}

export function applyCloudServices(cloud: Service[]) {
  if (!Array.isArray(cloud)) return;
  const local = getServices();
  const byId = new Map(local.map((s) => [s.id, s]));
  for (const s of cloud) byId.set(s.id, s);
  write(K_SERVICES(), Array.from(byId.values()));
}

export function applyCloudApiCfg(cloud: ApiCfg) {
  if (cloud && cloud.url) write(K_API_CFG(), cloud);
}

export function applyCloudTx(cloud: Tx[]) {
  if (Array.isArray(cloud)) write(K_TX(), cloud);
}
