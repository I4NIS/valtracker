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

export function tierLabel(name: string | null | undefined): string {
  if (!name) return "Non classé";
  const [word, ...rest] = name.split(" ");
  const translated = TIER_WORDS[word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()] ?? word;
  return [translated, ...rest].join(" ");
}

const TIER_LADDER = ["Fer", "Bronze", "Argent", "Or", "Platine", "Diamant", "Ascendant", "Immortel"];

export function tierNameById(tier: number | null | undefined): string {
  if (!tier || tier < 3) return "Non classé";
  if (tier >= 27) return "Radiant";
  const index = Math.floor((tier - 3) / 3);
  return `${TIER_LADDER[index]} ${((tier - 3) % 3) + 1}`;
}

export function seasonLabel(short: string): string {
  const match = /^e(\d+)a(\d+)$/i.exec(short);
  return match ? `Épisode ${match[1]}, acte ${match[2]}` : short;
}

export const REGIONS = [
  { id: "eu", label: "Europe" },
  { id: "na", label: "Amérique du Nord" },
  { id: "latam", label: "Amérique latine" },
  { id: "br", label: "Brésil" },
  { id: "ap", label: "Asie-Pacifique" },
  { id: "kr", label: "Corée" },
];

export const HENRIK_DASHBOARD = "https://api.henrikdev.xyz/dashboard/";
