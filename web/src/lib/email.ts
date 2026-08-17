/**
 * Catching mistyped email domains before an account is created.
 *
 * A wrong address here is unrecoverable: the password can't be reset, reminders
 * can't be delivered, and the person is gone permanently. Three of the first
 * thirty accounts were lost exactly this way (`gmail.con`, `gmwil.com`,
 * `hmail.com`), which is why this runs at the point of typing rather than
 * relying on a confirmation email that a broken address can never receive.
 *
 * This only ever *suggests*. A real address that happens to look unusual must
 * always be able to proceed, so nothing here is treated as a hard rejection.
 */

/**
 * Domains common enough that a near-miss is far more likely to be a typo than
 * a real address. Deliberately includes the UK variants, since a decent share
 * of sign-ups are British and `hotmail.co.uk` must never be "corrected".
 *
 * Order matters: it runs most to least common, and settles ties. `hmail.com`
 * sits one slip from `gmail.com`, `mail.com` and `ymail.com` all at once, and
 * with two thirds of sign-ups on Gmail that is the only sensible guess.
 */
const POPULAR_DOMAINS: string[] = [
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "ymail.com",
  "hotmail.com",
  "hotmail.co.uk",
  "outlook.com",
  "live.com",
  "live.co.uk",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "mail.com",
  "gmx.com",
  "zoho.com",
  "yandex.com",
  "btinternet.com",
  "sky.com",
  "virginmedia.com",
  "talktalk.net",
  "comcast.net",
  "verizon.net",
  "att.net",
];

const POPULAR_SET: ReadonlySet<string> = new Set(POPULAR_DOMAINS);

/**
 * Endings that are never valid but sit one slip away from `.com`.
 *
 * A fix from this table is only offered when the repaired domain turns out to
 * be a popular one, so a genuine `.co` or `.cm` address is left alone.
 */
const TLD_FIXES: Record<string, string> = {
  cim: "com",
  clm: "com",
  cmo: "com",
  cm: "com",
  co: "com",
  c0m: "com",
  com_: "com",
  comm: "com",
  con: "com",
  cno: "com",
  cok: "com",
  cpm: "com",
  net_: "net",
  ocm: "com",
  om: "com",
  vom: "com",
  xom: "com",
};

/** Levenshtein distance, capped so a hopeless comparison stops early. */
function editDistance(a: string, b: string, cap: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;

  let previous: number[] = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    const current: number[] = [i];
    let best = i;

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        previous[j] + 1, // deletion
        current[j - 1] + 1, // insertion
        previous[j - 1] + cost, // substitution
      );
      current.push(value);
      if (value < best) best = value;
    }

    // Every remaining row can only add to the score, so a row already over the
    // cap can never come back under it.
    if (best > cap) return cap + 1;
    previous = current;
  }

  return previous[b.length];
}

/**
 * How far a domain may stray before a correction stops being a safe guess.
 *
 * Short domains get a tighter budget because two edits on six characters is
 * closer to a different address than to a slip of the thumb — `gmx.de` must
 * not be turned into `gmx.com`.
 */
function allowedDistance(domain: string): number {
  return domain.length >= 8 ? 2 : 1;
}

/**
 * Suggest a corrected address, or null when it looks fine or is too unusual
 * to guess at.
 *
 * Returns the whole address rather than just the domain so the caller can put
 * it straight into the field, which is the only version of this that people
 * actually act on.
 */
export function suggestEmailFix(email: string): string | null {
  const trimmed = email.trim().toLowerCase();

  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return null;

  const local = trimmed.slice(0, at);
  // A trailing dot is a slip in its own right, and would otherwise block every
  // comparison below from matching.
  const domain = trimmed.slice(at + 1).replace(/\.+$/, "");
  if (domain.length === 0 || domain.includes("@")) return null;

  // Compared against what was actually typed, not the tidied domain, so a
  // stray trailing dot is still offered as a fix.
  const rebuild = (fixed: string): string | null => {
    const suggestion = `${local}@${fixed}`;
    return suggestion === trimmed ? null : suggestion;
  };

  if (POPULAR_SET.has(domain)) return rebuild(domain);

  // A broken ending is the most common and most confident case, so it is worth
  // checking before falling back to fuzzy matching.
  const lastDot = domain.lastIndexOf(".");
  if (lastDot > 0) {
    const stem = domain.slice(0, lastDot);
    const ending = domain.slice(lastDot + 1);
    const replacement = TLD_FIXES[ending];
    if (replacement) {
      const repaired = `${stem}.${replacement}`;
      if (POPULAR_SET.has(repaired)) return rebuild(repaired);
    }
  }

  // Otherwise look for a popular domain within a slip or two. Ties fall to
  // whichever is listed first, which is why the list is ordered by how common
  // each one actually is.
  let best: string | null = null;
  let bestScore = Number.MAX_SAFE_INTEGER;

  for (const candidate of POPULAR_DOMAINS) {
    const budget = Math.min(allowedDistance(domain), allowedDistance(candidate));
    const score = editDistance(domain, candidate, budget);
    if (score > budget) continue;

    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best ? rebuild(best) : null;
}
