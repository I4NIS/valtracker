const number = (digits: number) =>
  new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function fmt(value: number, digits = 0): string {
  return number(digits).format(value);
}

export function pct(value: number, digits = 1): string {
  return `${fmt(value, digits)} %`;
}

export function signed(value: number, digits = 0): string {
  const text = fmt(Math.abs(value), digits);
  return value >= 0 ? `+${text}` : `-${text}`;
}

export function timeAgo(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return "jamais";
  const date = new Date(iso);
  const minutes = Math.round((now.getTime() - date.getTime()) / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const time = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (date.toDateString() === yesterday.toDateString()) return `hier, ${time}`;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

export function greeting(now = new Date()): string {
  const hour = now.getHours();
  return hour >= 18 || hour < 5 ? "Bonsoir" : "Bonjour";
}

export function placeLabel(place: number): string {
  return place === 1 ? "1er" : `${place}e`;
}
