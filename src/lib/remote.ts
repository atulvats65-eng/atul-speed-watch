// Server-side delivery engine sync layer.
// When the app is served by our node server (server.mjs), orders are mirrored to
// it so the background engine keeps delivering even while no tab is open.
// If the endpoint is unreachable (e.g. pure vite dev / static hosting), every
// call becomes a no-op and the app keeps working on localStorage/Firebase.
import type { Order } from "./engine";

const BASE = "/api/orders";

let available: boolean | null = null;

export async function remoteProbe(): Promise<boolean> {
  if (available !== null) return available;
  try {
    const res = await fetch(BASE, { method: "GET" });
    available = res.ok;
  } catch {
    available = false;
  }
  return available;
}

export function remoteIsAvailable(): boolean {
  return available === true;
}

export async function remoteFetchOrders(): Promise<Order[] | null> {
  try {
    const res = await fetch(BASE);
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data?.orders) ? (data.orders as Order[]) : null;
  } catch {
    return null;
  }
}

export function remotePushOrder(order: Order) {
  try {
    void fetch(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(order),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

export function remoteRemoveOrder(id: string) {
  try {
    void fetch(`${BASE}/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
  } catch {
    /* ignore */
  }
}
