export type Lang = "fr" | "en";

let current: Lang = "fr";

export function lang(): Lang {
  return current;
}

export function setLang(next: Lang) {
  current = next;
  document.documentElement.lang = next;
}

export function t(fr: string, en: string): string {
  return current === "en" ? en : fr;
}

export function locale(): string {
  return current === "en" ? "en-GB" : "fr-FR";
}

export function asLang(value: string | null | undefined): Lang {
  return value === "en" ? "en" : "fr";
}
