import { supabase } from "@/lib/supabase";

/**
 * Push reminder subscriptions.
 *
 * Reminders are how someone who installed but never paid comes back, and how
 * someone mid-challenge finds out they're behind while there's still time to
 * fix it. Both matter commercially, so failures here are logged but never
 * allowed to block the screen the user was actually trying to use.
 */

/** The browser wants the VAPID public key as raw bytes, not base64url text. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalised);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

function arrayBufferToBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Subscribe this device and store it against the signed-in user.
 *
 * Safe to call repeatedly — the endpoint is unique, so re-subscribing on an
 * already-registered device updates the existing row rather than duplicating
 * it and sending someone the same reminder twice.
 */
export async function registerForReminders(): Promise<boolean> {
  try {
    const publicKey = import.meta.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      console.warn("push: no VAPID public key configured");
      return false;
    }

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
    if (Notification.permission !== "granted") return false;

    const registration = await navigator.serviceWorker.ready;

    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      }));

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) return false;

    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: userId,
        endpoint: subscription.endpoint,
        p256dh: arrayBufferToBase64Url(subscription.getKey("p256dh")),
        auth: arrayBufferToBase64Url(subscription.getKey("auth")),
        // The sender needs the user's own zone to pick a sensible hour.
        time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      { onConflict: "endpoint" },
    );

    if (error) {
      console.error("push: could not save subscription", error.message);
      return false;
    }

    return true;
  } catch (error) {
    console.error("push: registration failed", error);
    return false;
  }
}

/** Turn reminders off on this device and forget it server-side. */
export async function unregisterReminders(): Promise<void> {
  try {
    if (!("serviceWorker" in navigator)) return;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;

    await supabase.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
    await subscription.unsubscribe();
  } catch (error) {
    console.error("push: unsubscribe failed", error);
  }
}

/** Whether reminders are currently active on this device. */
export async function hasActiveReminders(): Promise<boolean> {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
    if (Notification.permission !== "granted") return false;
    const registration = await navigator.serviceWorker.ready;
    return (await registration.pushManager.getSubscription()) !== null;
  } catch {
    return false;
  }
}
