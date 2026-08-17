import { describe, expect, it } from "vitest";

import { suggestEmailFix } from "@/lib/email";

describe("suggestEmailFix", () => {
  it("fixes the typos that actually cost us accounts", () => {
    // Every one of these is a real sign-up that could never be reached again.
    expect(suggestEmailFix("claassenjade57@gmail.con")).toBe("claassenjade57@gmail.com");
    expect(suggestEmailFix("someone@gmwil.com")).toBe("someone@gmail.com");
    expect(suggestEmailFix("someone@hmail.com")).toBe("someone@gmail.com");
  });

  it("fixes other near-misses on common domains", () => {
    expect(suggestEmailFix("a@gmial.com")).toBe("a@gmail.com");
    expect(suggestEmailFix("a@gamil.com")).toBe("a@gmail.com");
    expect(suggestEmailFix("a@gnail.com")).toBe("a@gmail.com");
    expect(suggestEmailFix("a@hotmial.com")).toBe("a@hotmail.com");
    expect(suggestEmailFix("a@yahooo.com")).toBe("a@yahoo.com");
    expect(suggestEmailFix("a@iclould.com")).toBe("a@icloud.com");
  });

  it("repairs broken endings", () => {
    expect(suggestEmailFix("a@gmail.cm")).toBe("a@gmail.com");
    expect(suggestEmailFix("a@gmail.co")).toBe("a@gmail.com");
    expect(suggestEmailFix("a@yahoo.cpm")).toBe("a@yahoo.com");
    expect(suggestEmailFix("a@outlook.con")).toBe("a@outlook.com");
  });

  it("leaves correct addresses alone", () => {
    expect(suggestEmailFix("a@gmail.com")).toBeNull();
    expect(suggestEmailFix("a@icloud.com")).toBeNull();
    expect(suggestEmailFix("a@yahoo.com")).toBeNull();
    expect(suggestEmailFix("a@proton.me")).toBeNull();
  });

  it("leaves valid British addresses alone", () => {
    // The costly false positive: a real address "corrected" into a dead one.
    expect(suggestEmailFix("tahneen_ambia@hotmail.co.uk")).toBeNull();
    expect(suggestEmailFix("a@yahoo.co.uk")).toBeNull();
    expect(suggestEmailFix("a@live.co.uk")).toBeNull();
    expect(suggestEmailFix("a@btinternet.com")).toBeNull();
  });

  it("leaves work and niche domains alone", () => {
    expect(suggestEmailFix("someone@bhf.org.uk")).toBeNull();
    expect(suggestEmailFix("someone@gymtaxx.com")).toBeNull();
    expect(suggestEmailFix("someone@nhs.net")).toBeNull();
    expect(suggestEmailFix("someone@companyname.co")).toBeNull();
    expect(suggestEmailFix("someone@gmx.de")).toBeNull();
  });

  it("ignores addresses too incomplete to judge", () => {
    expect(suggestEmailFix("")).toBeNull();
    expect(suggestEmailFix("someone")).toBeNull();
    expect(suggestEmailFix("someone@")).toBeNull();
    expect(suggestEmailFix("@gmail.com")).toBeNull();
  });

  it("normalises what it hands back", () => {
    // Phones love to capitalise the first letter and leave a trailing space.
    expect(suggestEmailFix("  Someone@Gmail.CON  ")).toBe("someone@gmail.com");
    expect(suggestEmailFix("someone@gmail.com.")).toBe("someone@gmail.com");
  });
});
