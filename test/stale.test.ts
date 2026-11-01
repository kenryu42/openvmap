import { describe, expect, it } from "vitest";
import { isStale, staleAfterDays } from "@/lib/stale";

const jst = (iso: string) => Date.parse(`${iso}+09:00`);

describe("isStale", () => {
  it(`calls a date stale only once more than ${staleAfterDays} full days have passed in Japan time`, () => {
    expect(staleAfterDays).toBe(7);
    expect(isStale("2026-10-26", jst("2026-11-02T23:59:59"))).toBe(false);
    expect(isStale("2026-10-26", jst("2026-11-03T00:00:00"))).toBe(true);
    expect(isStale("2026-11-02", jst("2026-11-02T00:00:00"))).toBe(false);
  });

  it("takes a different threshold", () => {
    expect(isStale("2026-11-01", jst("2026-11-03T00:00:00"), 1)).toBe(true);
    expect(isStale("2026-11-01", jst("2026-11-03T00:00:00"), 2)).toBe(false);
  });

  it("never calls a date it cannot read stale", () => {
    expect(isStale("", jst("2030-01-01T00:00:00"))).toBe(false);
    expect(isStale("not a date", jst("2030-01-01T00:00:00"))).toBe(false);
  });
});
