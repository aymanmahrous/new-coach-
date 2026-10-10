// Minimal Web Push helper: pure browser PushManager mechanics only. RPC calls
// are made by the caller via the app's existing callRpc, so this module has no
// networking/Supabase knowledge of its own. No offline business-data writes.

// Public VAPID key — not a secret; the matching private key lives only in
// Supabase Vault and is read exclusively by the send-push-notifications Edge Function.
const VAPID_PUBLIC_KEY = "BL2NMy-BSYu6LbuDt9F8KfTu9ZUxQ-4cuhZSd5rZdtJhWseRfxT6w65D10psPOvpHCvIFwYdQe712MdQBKlAYr4";

type Rpc = (rpcName: string, body: Record<string, unknown>) => Promise<unknown>;

function urlBase64ToUint8Array(base64: string) {
  const safe = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from([...atob(safe)].map((char) => char.charCodeAt(0)));
}

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function registerServiceWorker() {
  if ("serviceWorker" in navigator) return navigator.serviceWorker.register("/sw.js");
}

export async function getPushSubscription() {
  if (!pushSupported()) return null;
  return (await navigator.serviceWorker.ready).pushManager.getSubscription();
}

export async function enablePush(callRpc: Rpc) {
  if (!pushSupported()) throw new Error("UNSUPPORTED");
  if ((await Notification.requestPermission()) !== "granted") throw new Error("PERMISSION_DENIED");
  await registerServiceWorker();
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) throw new Error("SUBSCRIPTION_KEYS_MISSING");
  await callRpc("register_staff_push_subscription", { p_endpoint: json.endpoint, p_p256dh: p256dh, p_auth: auth });
  return subscription;
}

export async function disablePush(callRpc: Rpc) {
  const subscription = await getPushSubscription();
  if (!subscription) return;
  await callRpc("unregister_staff_push_subscription", { p_endpoint: subscription.endpoint });
  await subscription.unsubscribe();
}