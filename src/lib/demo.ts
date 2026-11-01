import type { Order, SpeedProfile } from "./engine";
import { newOrderId, chargeFor } from "./engine";

const DEMO_SERVICE = {
  id: "demo",
  name: "Demo Views",
  category: "Demo",
  kind: "views" as const,
  rate: 120,
  min: 100,
  max: 10_000_000,
};

const PROFILE_LABEL: Record<SpeedProfile, string> = {
  safe: "Safe",
  normal: "Normal",
  turbo: "Turbo",
  micro: "Micro Fast",
  scurve: "S-Curve",
  stealth: "Stealth",
  custom: "Custom",
};

const QUANTITIES: Record<Omit<SpeedProfile, "custom">, number> = {
  safe: 5000,
  normal: 12000,
  turbo: 20000,
  micro: 8000,
  scurve: 15000,
  stealth: 10000,
};

const CUSTOM_ORDER: Order = {
  id: "demo-custom",
  serviceId: DEMO_SERVICE.id,
  serviceName: `${DEMO_SERVICE.name} · Custom`,
  kind: "views",
  link: "https://instagram.com/p/demo-custom",
  quantity: 6000,
  likes: 180,
  charge: chargeFor(DEMO_SERVICE, 6000, 180),
  createdAt: Date.now() - 7 * 45 * 60_000,
  profile: "custom",
  cMinDrop: 25,
  cMaxDrop: 60,
  cMinGap: 3,
  cMaxGap: 12,
  night: "none",
  humanize: false,
};

// Builds one sample order per speed profile, with createdAt staggered into the
// past so the Orders page shows a mix of pending / in-progress / completed and
// a delivery curve for every mode.
export function createDemoOrders(): Order[] {
  const now = Date.now();
  const orders: Order[] = [];

  (Object.keys(QUANTITIES) as Omit<SpeedProfile, "custom">[]).forEach((profile, i) => {
    const qty = QUANTITIES[profile]!;
    const likes = Math.round(qty * 0.03);
    const createdAt = now - (i + 1) * 45 * 60_000 - (i % 3) * 20 * 60_000;
    orders.push({
      id: newOrderId(),
      serviceId: DEMO_SERVICE.id,
      serviceName: `${DEMO_SERVICE.name} · ${PROFILE_LABEL[profile]}`,
      kind: "views",
      link: `https://instagram.com/p/demo-${profile}`,
      quantity: qty,
      likes,
      charge: chargeFor(DEMO_SERVICE, qty, likes),
      createdAt,
      profile,
      night: "none",
      humanize: false,
    });
  });

  orders.push(CUSTOM_ORDER);

  // Small ("mini") orders below the typical 100 minimum, so you can see how
  // low-quantity delivery behaves. Demo orders bypass the service min check.
  const smallOrders: Order[] = [
    {
      id: newOrderId(),
      serviceId: DEMO_SERVICE.id,
      serviceName: `${DEMO_SERVICE.name} · Normal (Mini)`,
      kind: "views",
      link: "https://instagram.com/p/mini-normal",
      quantity: 45,
      likes: 2,
      charge: chargeFor(DEMO_SERVICE, 45, 2),
      createdAt: now - 12 * 60_000,
      profile: "normal",
      night: "none",
      humanize: false,
    },
    {
      id: newOrderId(),
      serviceId: DEMO_SERVICE.id,
      serviceName: `${DEMO_SERVICE.name} · Stealth (Mini)`,
      kind: "views",
      link: "https://instagram.com/p/mini-stealth",
      quantity: 55,
      likes: 2,
      charge: chargeFor(DEMO_SERVICE, 55, 2),
      createdAt: now - 6 * 60_000,
      profile: "stealth",
      night: "none",
      humanize: false,
    },
  ];
  orders.push(...smallOrders);
  return orders;
}
