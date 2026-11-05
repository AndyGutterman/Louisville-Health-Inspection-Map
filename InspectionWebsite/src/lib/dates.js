// Date formatting for inspection dates.

// ISO date strings are read as UTC calendar days so a date never shifts by one
// in time zones behind UTC.
export function formatDateSafe(val) {
  if (!val) return "n/a";
  if (typeof val === "string") {
    const m = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
      return d.toLocaleDateString(undefined, { timeZone: "UTC" });
    }
  }
  try {
    const d = new Date(val);
    return isNaN(d.getTime()) ? String(val) : d.toLocaleDateString();
  } catch {
    return String(val);
  }
}

// "Oct 28": short month and day, for compact lists. Empty string when there is no date.
export function formatMonthDay(val) {
  if (!val) return "";
  const m = String(val).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString(undefined, {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
    });
  }
  return String(val);
}

// "Oct 28, 2026" for a YYYY-MM-DD string. null when there is no date.
export function formatLongDate(d) {
  return d
    ? new Date(`${d}T00:00:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;
}
