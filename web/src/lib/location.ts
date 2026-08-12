/**
 * Location capture for a check-in, mirroring `LocationCapture.swift`.
 *
 * The rule from the iOS app carries over exactly: permission is *required*, but
 * a failed fix is not. A gym in a basement with no signal must not block a
 * check-in someone has genuinely earned — it's recorded with its reason and
 * looked at during review instead.
 */

export type LocationState = "located" | "approximate" | "no_signal" | "denied" | "unknown";

export type LocationFix = {
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  status: LocationState;
};

/** Anything tighter than this places someone at a building. */
const GOOD_ACCURACY_M = 65;
const TIMEOUT_MS = 12_000;

export const DENIED_FIX: LocationFix = {
  latitude: null,
  longitude: null,
  accuracyM: null,
  status: "denied",
};

export const NO_SIGNAL_FIX: LocationFix = {
  latitude: null,
  longitude: null,
  accuracyM: null,
  status: "no_signal",
};

/** Whether the browser has already been granted or refused location. */
export async function locationPermissionState(): Promise<PermissionState | "unsupported"> {
  if (typeof navigator === "undefined" || !navigator.permissions) return "unsupported";
  try {
    const status = await navigator.permissions.query({ name: "geolocation" });
    return status.state;
  } catch {
    return "unsupported";
  }
}

/**
 * Ask for a position once.
 *
 * Resolves rather than rejects for every failure: the caller needs the *reason*
 * to store against the submission, and a thrown error would lose that.
 */
export function captureLocation(): Promise<LocationFix> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(NO_SIGNAL_FIX);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const accuracy = position.coords.accuracy;
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyM: accuracy,
          status: accuracy <= GOOD_ACCURACY_M ? "located" : "approximate",
        });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          resolve(DENIED_FIX);
          return;
        }
        // Timeout or position-unavailable: they allowed it, the phone just
        // couldn't see the sky.
        console.warn("location: no usable fix", error.code, error.message);
        resolve(NO_SIGNAL_FIX);
      },
      { enableHighAccuracy: true, timeout: TIMEOUT_MS, maximumAge: 30_000 },
    );
  });
}
