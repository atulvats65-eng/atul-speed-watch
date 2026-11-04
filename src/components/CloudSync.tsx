import { useEffect } from "react";
import { isSupabaseReady } from "../lib/supabase";
import {
  applyCloudApiCfg,
  applyCloudOrders,
  applyCloudServices,
  applyCloudTx,
  applyCloudUsers,
  getApiCfg,
  getOrders,
  getServices,
  getTx,
  getUsers,
} from "../lib/store";
import {
  cloudWatchApiCfg,
  cloudWatchOrders,
  cloudWatchServices,
  cloudWatchTx,
  cloudWatchUsers,
  cloudWriteApiCfg,
  cloudWriteServices,
  cloudWriteTx,
  cloudWriteUsers,
} from "../lib/cloud";
import { cloudPushOrders } from "../lib/cloud";
import { remoteFetchOrders, remoteProbe } from "../lib/remote";

/**
 * When Supabase is configured, uploads the current local state once, then
 * subscribes to realtime so that changes made on other devices / sessions are
 * merged back into localStorage (and thus into the reactive store).
 * Also pulls orders from the server-side delivery engine (when the app is
 * served by server.mjs) so server-advanced progress is reflected.
 */
export default function CloudSync() {
  useEffect(() => {
    if (!isSupabaseReady()) return;

    // Initial upload: seed the cloud from whatever is on this device.
    const orders = getOrders();
    if (orders.length > 0) cloudPushOrders(orders);
    const users = getUsers();
    if (Object.keys(users).length > 0) cloudWriteUsers(users);
    const tx = getTx();
    if (tx.length > 0) cloudWriteTx(tx);
    const services = getServices();
    if (services.length > 0) cloudWriteServices(services);
    const api = getApiCfg();
    if (api.url) cloudWriteApiCfg(api);

    const offs = [
      cloudWatchOrders(applyCloudOrders),
      cloudWatchUsers(applyCloudUsers),
      cloudWatchTx(applyCloudTx),
      cloudWatchServices(applyCloudServices),
      cloudWatchApiCfg(applyCloudApiCfg),
    ];
    return () => offs.forEach((off) => off && off());
  }, []);

  return null;
}
