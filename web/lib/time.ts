export const VN_TZ = "Asia/Ho_Chi_Minh";

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: VN_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function vnParts(date: Date): Record<string, string> {
  return Object.fromEntries(partsFormatter.formatToParts(date).map((p) => [p.type, p.value]));
}

export function toVnLocalInput(iso: string): string {
  const p = vnParts(new Date(iso));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export function vnLocalInputToIso(local: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) {
    throw new Error(`invalid datetime-local value: ${local}`);
  }
  return `${local}:00+07:00`;
}

export function nowVnLocalInput(now: Date = new Date()): string {
  return toVnLocalInput(now.toISOString());
}

export function currentVnMonth(now: Date = new Date()): string {
  const p = vnParts(now);
  return `${p.year}-${p.month}`;
}

export function formatVnDateTime(iso: string): string {
  const p = vnParts(new Date(iso));
  return `${p.day}/${p.month} ${p.hour}:${p.minute}`;
}
