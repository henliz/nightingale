/** "13:52" for the given instant, 24-hour local time. */
export function clockTime(date: Date = new Date()): string {
  return date.toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** "15:21" style elapsed mm:ss. */
export function elapsed(fromMs: number, nowMs: number): string {
  const total = Math.max(0, Math.floor((nowMs - fromMs) / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function greetingFor(date: Date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/** "Saturday, 17 October" */
export function longDate(date: Date = new Date()): string {
  const weekday = date.toLocaleDateString("en-GB", { weekday: "long" });
  const dayMonth = date.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  return `${weekday}, ${dayMonth}`;
}
