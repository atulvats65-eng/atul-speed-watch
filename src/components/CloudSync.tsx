import { useEffect } from "react";
import { isFirebaseReady } from "../lib/firebase";
import {
  applyCloudApiCfg,
  applyCloudOrders,
  applyCloudTx,
  applyCloudUsers,
  getApiCfg,
  getOrders,
  getTx,
  getUsers,
} from "../lib/store";
import {
  cloudWatchApiCfg,
  cloudWatchOrders,
  cloudWatchTx,
  cloudWatchUsers,
  cloudWriteApiCfg,
  cloudWriteTx,
  cloudWriteUsers,
} from "../lib/cloud";
import { cloudPushOrders } from "../lib/cloud";
import { remoteFetchOrders, remoteProbe } from "../lib/remote";

/**
 * When Firebase is configured, uploads the current local state once, then
 * subscribes to Firestore so that changes made on other devices / sessions are
 * merged back into localStorage (and thus into the reactive store).
 * Also pulls orders from the server-side delivery engine (when the app is
 * served by server.mjs) so server-advanced progress is reflected.
 */
export default function CloudSync() {
  useEffect(() => {
    if (!isFirebaseReady()) return;

    // Initial upload: seed the cloud from whatever is on this device.
    const orders = getOrders();
    if (orders.length > 0) cloudPushOrders(orders);
    const users = getUsers();
    if (Object.keys(users).length > 0) cloudWriteUsers(users);
    const tx = getTx();
    if (tx.length > 0) cloudWriteTx(tx);
    const api = getApiCfg();
    if (api.url) cloudWriteApiCfg(api);

    const offs = [
      cloudWatchOrders(applyCloudOrders),
      cloudWatchUsers(applyCloudUsers),
      cloudWatchTx(applyCloudTx),
      cloudWatchApiCfg(applyCloudApiCfg),
    ];
    return () => offs.forEach((off) => off && off());
  }, []);

  return null;
}
