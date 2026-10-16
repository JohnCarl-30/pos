export function ticketMinutes(sentAt: string, now: number): number {
  return Math.max(0, Math.floor((now - Date.parse(sentAt)) / 60_000));
}

export function ticketTone(minutes: number): "normal" | "late" | "overdue" {
  if (minutes >= 20) return "overdue";
  if (minutes >= 10) return "late";
  return "normal";
}
