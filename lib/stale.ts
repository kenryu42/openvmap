export const staleAfterDays = 7;

const japanUtcOffset = "+09:00";
const msPerDay = 86_400_000;

export function daysSince(verifiedAt: string, now: number): number | null {
  const t = Date.parse(`${verifiedAt}T00:00:00${japanUtcOffset}`);
  return Number.isNaN(t) ? null : Math.floor((now - t) / msPerDay);
}
