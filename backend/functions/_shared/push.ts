import webpush from "npm:web-push@3.6.7";

import type { createAdminClient } from "./auth.ts";

/**
 * Sending a push to one person's devices, on the back of something that has
 * already happened.
 *
 * Distinct from `send-reminders`, which decides *who* to contact on a schedule.
 * This is the other kind of notification: a fact the person is waiting for, sent
 * the moment it becomes true. It is always a courtesy alongside work that has
 * already succeeded, so nothing in here is allowed to fail loudly — a browser
 * that threw its subscription away must never turn a recorded review decision
 * into an error the operator sees.
 */

type Admin = ReturnType<typeof createAdminClient>;

/** After this many consecutive delivery failures, stop trying a device. */
export const MAX_FAILURES = 5;

export type PushMessage = {
  title: string;
  body: string;
  /** Where tapping the notification lands them. */
  url: string;
  tag?: string;
};

type Device = { id: string; endpoint: string; p256dh: string; auth: string; failure_count: number };

/** Loads VAPID credentials. False means push is not configured on this project. */
function configure(): boolean {
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!publicKey || !privateKey) return false;

  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT") ?? "mailto:support@gymtaxx.com",
    publicKey,
    privateKey,
  );
  return true;
}

/**
 * Delivers `message` to every device this person has installed the app on, and
 * reports how many got it.
 *
 * `last_sent_on` is deliberately left alone. That column paces the scheduled
 * nudges, and an approval is not a nudge — writing to it here would silence a
 * legitimate reminder later the same day.
 */
export async function notifyUser(
  admin: Admin,
  userId: string,
  message: PushMessage,
): Promise<number> {
  try {
    if (!configure()) {
      console.error("push: VAPID keys missing, notification skipped");
      return 0;
    }

    const { data, error } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth, failure_count")
      .eq("user_id", userId)
      .lt("failure_count", MAX_FAILURES);

    if (error) {
      console.error("push: could not read subscriptions", error.message);
      return 0;
    }

    const devices = (data ?? []) as Device[];
    let delivered = 0;

    for (const device of devices) {
      try {
        await webpush.sendNotification(
          { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
          JSON.stringify({
            title: message.title,
            body: message.body,
            url: message.url,
            tag: message.tag ?? "gymtaxx",
          }),
        );

        if (device.failure_count > 0) {
          await admin
            .from("push_subscriptions")
            .update({ failure_count: 0 })
            .eq("id", device.id);
        }
        delivered += 1;
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;

        // 404/410 mean the browser discarded the subscription — the app was
        // deleted or reinstalled. Drop it rather than retrying forever.
        if (statusCode === 404 || statusCode === 410) {
          await admin.from("push_subscriptions").delete().eq("id", device.id);
        } else {
          console.error("push: delivery failed", statusCode ?? "unknown");
          await admin
            .from("push_subscriptions")
            .update({ failure_count: device.failure_count + 1 })
            .eq("id", device.id);
        }
      }
    }

    return delivered;
  } catch (err) {
    console.error("push: notification failed", err);
    return 0;
  }
}
