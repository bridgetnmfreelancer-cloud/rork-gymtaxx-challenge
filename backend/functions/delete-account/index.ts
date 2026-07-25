import {
  AuthError,
  corsHeaders,
  createAdminClient,
  json,
  requireAuth,
} from "../_shared/auth.ts";

const PROOF_BUCKET = "workout-proofs";

/**
 * Permanently delete the signed-in user's account and all of their data.
 *
 * Required by App Store Guideline 5.1.1(v): any app with account creation must
 * let the user delete that account from inside the app.
 *
 * Deleting the `auth.users` row cascades to `profiles`, `user_challenges`, and
 * `workout_submissions` (all three have ON DELETE CASCADE). Storage objects do
 * NOT cascade, so the proof photos are removed explicitly first — otherwise the
 * user's gym photos would outlive the account that owns them.
 *
 * The caller is identified from their JWT, never from the request body, so this
 * endpoint can only ever delete the account making the call.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { user } = await requireAuth(req);
    const admin = createAdminClient();

    // 1. Proof photos. Storage paths are `<lowercased user id>/<uuid>.jpg`.
    const folder = user.id.toLowerCase();
    const { data: files, error: listError } = await admin.storage
      .from(PROOF_BUCKET)
      .list(folder);

    if (listError) {
      // Don't delete the account while their photos are unaccounted for — a
      // retry is safe, an orphaned private photo set is not.
      console.error("delete-account: could not list proofs", listError);
      return json({ error: "storage_list_failed" }, 500);
    }

    if (files && files.length > 0) {
      const paths = files.map((f) => `${folder}/${f.name}`);
      const { error: removeError } = await admin.storage.from(PROOF_BUCKET).remove(paths);
      if (removeError) {
        console.error("delete-account: could not remove proofs", removeError);
        return json({ error: "storage_delete_failed" }, 500);
      }
    }

    // 2. Release any review this user performed. `reviewed_by` is the one FK to
    // auth.users without a cascade, so leaving it set would block the delete.
    const { error: reviewError } = await admin
      .from("workout_submissions")
      .update({ reviewed_by: null })
      .eq("reviewed_by", user.id);
    if (reviewError) {
      console.error("delete-account: could not clear reviews", reviewError);
      return json({ error: "review_cleanup_failed" }, 500);
    }

    // 3. The account itself. Cascades take out the rest of their rows.
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.error("delete-account: auth delete failed", deleteError);
      return json({ error: "delete_failed" }, 500);
    }

    return json({ status: "deleted" });
  } catch (err) {
    if (err instanceof AuthError) return json({ error: "unauthorized" }, 401);
    console.error("delete-account failed", err);
    return json({ error: "internal_error" }, 500);
  }
});
