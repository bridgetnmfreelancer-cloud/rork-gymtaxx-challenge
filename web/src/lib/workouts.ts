import type { LocationFix } from "./location";
import { supabase } from "./supabase";

const BUCKET = "workout-proofs";

/**
 * Upload the proof photo, then create the pending submission row.
 *
 * If the upload succeeds but the insert fails we make one attempt to delete the
 * just-uploaded object so it doesn't become an orphan. Same approach as the iOS
 * app: deliberately simple, no cleanup job.
 */
export async function submitWorkout({
  blob,
  userId,
  userChallengeId,
  capturedAt,
  fix,
}: {
  blob: Blob;
  userId: string;
  userChallengeId: string;
  capturedAt: Date;
  fix: LocationFix;
}): Promise<void> {
  // Storage RLS compares the folder name as text against auth.uid()::text,
  // which Postgres returns lowercase — an uppercase id 403s against the
  // own-folder policy.
  const path = `${userId.toLowerCase()}/${crypto.randomUUID().toLowerCase()}.jpg`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: "image/jpeg",
    upsert: false,
  });

  if (uploadError) {
    console.error("submit: storage upload failed", path, uploadError.message);
    throw new Error("upload_failed");
  }

  const { error: insertError } = await supabase.from("workout_submissions").insert({
    user_id: userId,
    user_challenge_id: userChallengeId,
    captured_at: capturedAt.toISOString(),
    storage_path: path,
    latitude: fix.latitude,
    longitude: fix.longitude,
    location_accuracy_m: fix.accuracyM,
    location_status: fix.status,
  });

  if (insertError) {
    console.error("submit: row insert failed after upload", path, insertError.message);
    const { error: cleanupError } = await supabase.storage.from(BUCKET).remove([path]);
    if (cleanupError) {
      console.error("submit: orphan cleanup failed", path, cleanupError.message);
    }
    throw new Error("record_failed");
  }
}

/** Compress a captured frame before upload — gym wifi is rarely good. */
export function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.7): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("encode_failed"));
      },
      "image/jpeg",
      quality,
    );
  });
}
