import webpush from "npm:web-push@3.6.7";

import { AuthError, corsHeaders, createAdminClient, json, requireAuth } from "../_shared/auth.ts";

/**
 * Send a reminder to the caller's own devices, right now.
 *
 * The scheduled sender only fires between 17:00 and 20:00 local time on
 * particular days, so there is otherwise no way to find out whether reminders
 * actually work on a given phone without waiting for the right evening. This
 * exists so the answer takes five seconds instead.
 *
 * Safe to expose to any signed-in user: it reads subscriptions belonging to the
 * caller and nobody else, so the worst anyone can do is notify themselves.
 */

type DeviceResult = {
  ok: boolean;
  /** Present only on failure, so the client can explain what went wrong. */
  reason?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { user } = await requireAuth(req);

    const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const contact = Deno.env.get("VAPID_SUBJECT") ?? "mailto:support@gymtaxx.com";
    if (!publicKey || !privateKey) {
      console.error("send-test-notification: VAPID keys missing");
      return json({ error: "not_configured" }, 500);
    }
    webpush.setVapidDetails(contact, publicKey, privateKey);

    const admin = createAdminClient();

    const { data: subscriptions, error } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", user.id);

    if (error) {
      console.error("send-test-notification: read failed", error.message);
      return json({ error: "read_failed" }, 500);
    }

    if (!subscriptions || subscriptions.length === 0) {
      // Not an error: it means this account has no device registered, which is
      // itself the answer the caller is looking for.
      return json({ devices: 0, delivered: 0, results: [] as DeviceResult[] });
    }

    const results: DeviceResult[] = [];
    let delivered = 0;

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({
            title: "Reminders are working",
            body: "This is what a nudge will look like when you're behind.",
            url: "/account",
            // A distinct tag so a test never replaces a real reminder.
            tag: "gymtaxx-test",
          }),
        );
        delivered += 1;
        results.push({ ok: true });

        await admin.from("push_subscriptions").update({ failure_count: 0 }).eq("id", sub.id);
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;

        // The browser discarded this subscription — the app was deleted or
        // reinstalled. Clearing it means the next opt-in starts clean.
        if (statusCode === 404 || statusCode === 410) {
          await admin.from("push_subscriptions").delete().eq("id", sub.id);
          results.push({ ok: false, reason: "expired" });
        } else {
          console.error("send-test-notification: delivery failed", statusCode ?? "unknown");
          results.push({ ok: false, reason: `push_error_${statusCode ?? "unknown"}` });
        }
      }
    }

    return json({ devices: subscriptions.length, delivered, results });
  } catch (err) {
    if (err instanceof AuthError) return json({ error: "unauthorized" }, 401);
    console.error("send-test-notification failed", err);
    return json({ error: "internal_error" }, 500);
  }
});
