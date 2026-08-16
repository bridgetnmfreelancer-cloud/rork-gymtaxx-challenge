import { supabase } from "@/lib/supabase";
import { canUsePush } from "@/lib/pwa";

/**
 * Push reminder subscriptions.
 *
 * Reminders are how someone who installed but never paid comes back, and how
 * someone mid-challenge finds out they're behind while there's still time to
 * fix it. Both matter commercially, so failures here are logged but never
 * allowed to block the screen the user was actually trying to use.
 */

/**
 * Resolve a promise, or give up after `ms`.
 *
 * `navigator.serviceWorker.ready` and `pushManager.subscribe()` can both hang
 * indefinitely on iOS rather than rejecting — the worker may never take control,
 * and Safari occasionally leaves a subscribe call pending forever. Without a
 * ceiling that leaves the reminders button spinning with no way forward, which
 * is exactly what it did. Reminders are optional; blocking the funnel is not.
 */
async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<T | null>([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          console.warn(`push: ${label} timed out after ${ms}ms`);
          resolve(null);
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

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
 * Why registering this device didn't work, in words the person can act on.
 *
 * Registration has two halves that fail independently: the browser creating a
 * subscription, and that subscription reaching our own list. The second half
 * used to fail silently, which meant the switch could read "on" while nothing
 * we send could ever arrive. Naming the step that broke is the difference
 * between a fixable problem and a mystery.
 */
export type RegisterResult = { ok: true; reason?: undefined } | { ok: false; reason: string };

/**
 * Subscribe this device and store it against the signed-in user.
 *
 * Safe to call repeatedly — the endpoint is unique, so re-subscribing on an
 * already-registered device updates the existing row rather than duplicating
 * it and sending someone the same reminder twice.
 */
export async function registerForRemindersDetailed(): Promise<RegisterResult> {
  try {
    const publicKey = import.meta.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      console.warn("push: no VAPID public key configured");
      return { ok: false, reason: "Reminders aren't configured on this version of the app yet." };
    }

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      return { ok: false, reason: "This browser can't send reminders. Open GymTaxx from your Home Screen." };
    }
    if (Notification.permission !== "granted") {
      return { ok: false, reason: "Notifications are switched off for GymTaxx in your iPhone Settings." };
    }

    const registration = await withTimeout(navigator.serviceWorker.ready, 8000, "service worker ready");
    if (!registration) {
      return { ok: false, reason: "The app's background helper didn't start. Close GymTaxx fully, reopen it, and try again." };
    }

    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await withTimeout(
        registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        }),
        8000,
        "push subscribe",
      ));

    if (!subscription) {
      return { ok: false, reason: "Your iPhone wouldn't set up reminders. Close GymTaxx fully, reopen it, and try again." };
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) return { ok: false, reason: "You're signed out. Log in, then turn reminders on." };

    // Deliberately not a plain upsert. A phone whose push endpoint was last
    // registered by a *different* account (a second account on a shared phone,
    // or a test login) cannot overwrite that row under row-level security, and
    // cannot delete it either — so reminders broke permanently and silently.
    // `claim_push_device` transfers the device to the caller instead.
    const { error } = await supabase.rpc("claim_push_device", {
      p_endpoint: subscription.endpoint,
      p_p256dh: arrayBufferToBase64Url(subscription.getKey("p256dh")),
      p_auth: arrayBufferToBase64Url(subscription.getKey("auth")),
      // The sender needs the user's own zone to pick a sensible hour.
      p_time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });

    if (error) {
      // This half used to fail invisibly. The raw message is kept because it
      // names the actual cause rather than hiding it behind a generic apology.
      console.error("push: could not save subscription", error.message);
      return { ok: false, reason: `Your phone couldn't be saved to our reminder list: ${error.message}` };
    }

    return { ok: true };
  } catch (error) {
    console.error("push: registration failed", error);
    const detail = error instanceof Error ? error.message : "unknown error";
    return { ok: false, reason: `Setting up reminders failed: ${detail}` };
  }
}

/** Boolean form, for callers that only need to know whether it worked. */
export async function registerForReminders(): Promise<boolean> {
  return (await registerForRemindersDetailed()).ok;
}

/**
 * Whether *our server* has this exact device on file.
 *
 * `hasActiveReminders` only asks the browser, which is not the same question —
 * a device the browser is happy with is still unreachable if it never made it
 * onto our list. Checking both is what stops the switch quietly lying.
 */
export async function isRegisteredOnServer(): Promise<boolean> {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
    const registration = await withTimeout(navigator.serviceWorker.ready, 5000, "service worker ready");
    if (!registration) return false;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return false;

    const { count, error } = await supabase
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("endpoint", subscription.endpoint);

    if (error) {
      console.error("push: could not check server registration", error.message);
      return false;
    }
    return (count ?? 0) > 0;
  } catch (error) {
    console.error("push: server registration check failed", error);
    return false;
  }
}

/**
 * Re-attach this device on launch, if it already has permission.
 *
 * Registration otherwise only happens on the reminders screen during sign-up,
 * which a returning user never sees — so a registration that gets dropped is
 * dropped for good. That happens routinely: reinstalling the app makes the
 * browser throw its subscription away, and the sender abandons a device after
 * repeated delivery failures. Either way the person keeps believing reminders
 * are on while nothing can reach them.
 *
 * Cheap and idempotent. An already-registered device re-saves the same endpoint
 * over itself, so this cannot produce duplicates or a second notification.
 */
export async function syncRemindersIfAllowed(): Promise<void> {
  try {
    if (!canUsePush()) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    await registerForReminders();
  } catch (error) {
    // Never allowed to affect the screen the user was actually opening.
    console.error("push: device sync failed", error);
  }
}

/** Turn reminders off on this device and forget it server-side. */
export async function unregisterReminders(): Promise<void> {
  try {
    if (!("serviceWorker" in navigator)) return;
    const registration = await withTimeout(navigator.serviceWorker.ready, 5000, "service worker ready");
    if (!registration) return;
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
    const registration = await withTimeout(navigator.serviceWorker.ready, 5000, "service worker ready");
    if (!registration) return false;
    return (await registration.pushManager.getSubscription()) !== null;
  } catch {
    return false;
  }
}
