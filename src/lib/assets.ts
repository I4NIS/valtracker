import { t } from "./i18n";

const MEDIA = "https://media.valorant-api.com";
const TIER_SET = "03621f52-342b-cf4e-4f86-9350a49c6d04";

export function tierIcon(tier: number | null | undefined): string {
  return `${MEDIA}/competitivetiers/${TIER_SET}/${tier ?? 0}/largeicon.png`;
}

export function agentIcon(agentId: string | null | undefined): string | undefined {
  return agentId ? `${MEDIA}/agents/${agentId}/displayicon.png` : undefined;
}

const TIER_WORDS: Record<string, string> = {
  Unrated: "Non classé",
  Unranked: "Non classé",
  Iron: "Fer",
  Bronze: "Bronze",
  Silver: "Argent",
  Gold: "Or",
  Platinum: "Platine",
  Diamond: "Diamant",
  Ascendant: "Ascendant",
  Immortal: "Immortel",
  Radiant: "Radiant",
};

const UNRANKED = () => t("Non classé", "Unranked");

export function tierLabel(name: string | null | undefined): string {
  if (!name) return UNRANKED();
  const [word, ...rest] = name.split(" ");
  const key = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  const known = key in TIER_WORDS;
  const english = key === "Unrated" ? "Unranked" : known ? key : word;
  const translated = t(TIER_WORDS[key] ?? word, english);
  return [translated, ...rest].join(" ");
}

const TIER_LADDER = ["Fer", "Bronze", "Argent", "Or", "Platine", "Diamant", "Ascendant", "Immortel"];
const TIER_LADDER_EN = ["Iron", "Bronze", "Silver", "Gold", "Platinum", "Diamond", "Ascendant", "Immortal"];

export function tierNameById(tier: number | null | undefined): string {
  if (!tier || tier < 3) return UNRANKED();
  if (tier >= 27) return "Radiant";
  const index = Math.floor((tier - 3) / 3);
  const division = ((tier - 3) % 3) + 1;
  return t(`${TIER_LADDER[index]} ${division}`, `${TIER_LADDER_EN[index]} ${division}`);
}

export function seasonLabel(short: string): string {
  const match = /^e(\d+)a(\d+)$/i.exec(short);
  return match ? t(`Épisode ${match[1]}, acte ${match[2]}`, `Episode ${match[1]}, Act ${match[2]}`) : short;
}

function region(id: string, fr: string, en: string) {
  return {
    id,
    get label() {
      return t(fr, en);
    },
  };
}

export const REGIONS = [
  region("eu", "Europe", "Europe"),
  region("na", "Amérique du Nord", "North America"),
  region("latam", "Amérique latine", "Latin America"),
  region("br", "Brésil", "Brazil"),
  region("ap", "Asie-Pacifique", "Asia Pacific"),
  region("kr", "Corée", "Korea"),
];

export const HENRIK_DASHBOARD = "https://api.henrikdev.xyz/dashboard/";
