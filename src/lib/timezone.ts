function etParts() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return {
    year: parts.find((p) => p.type === "year")!.value,
    month: parts.find((p) => p.type === "month")!.value,
    day: parts.find((p) => p.type === "day")!.value,
  };
}

export function getCurrentMonthKeyET(): string {
  const { year, month } = etParts();
  return `${year}-${month}`;
}

export function getCurrentDayET(): number {
  return Number(etParts().day);
}
