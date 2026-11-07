import { invoke } from "@tauri-apps/api/core";
import { fmt, signed } from "./format";
import { t } from "./i18n";

export type TierRef = { id: number | null; name: string | null };

export type Act = {
  seasonId: string;
  seasonShort: string | null;
  games: number;
  wins: number;
  endTier: number | null;
  endTierName: string | null;
  endRr: number | null;
  rankingSchema: string | null;
  actRankTier: number | null;
  actRankName: string | null;
  actWins: TierRef[];
  leaderboardRank: number | null;
};

export const getActs = (puuid: string) => invoke<Act[]>("get_acts", { puuid });

const FAMILIES = ["iron", "bronze", "silver", "gold", "platinum", "diamond", "ascendant", "immortal"];

export const RANK_COLORS: Record<string, string> = {
  iron: "#6f7275",
  bronze: "#a8774a",
  silver: "#b9c2c6",
  gold: "#e2b13c",
  platinum: "#3aa4b3",
  diamond: "#c27de6",
  ascendant: "#3cb878",
  immortal: "#c63a5c",
  radiant: "#f3dd8c",
};

export function rankFamily(name: string | null | undefined): string | null {
  const word = (name ?? "").trim().split(" ")[0]?.toLowerCase() ?? "";
  if (word === "radiant") return "radiant";
  return FAMILIES.includes(word) ? word : null;
}

export function tierFromName(name: string | null | undefined): number | null {
  const family = rankFamily(name);
  if (family === null) return null;
  if (family === "radiant") return 27;
  const division = Number((name ?? "").trim().split(" ")[1] ?? 1);
  const step = Number.isFinite(division) ? Math.min(3, Math.max(1, division)) : 1;
  return 3 + FAMILIES.indexOf(family) * 3 + step - 1;
}

export type RrDetail = {
  change: number | null;
  rrAfter: number | null;
  tierAfter: number | null;
  tierAfterName: string | null;
  rrBefore: number | null;
  tierBefore: number | null;
  tierBeforeName: string | null;
  performanceBonus: number | null;
  penalty: number | null;
  afkPenalty: number | null;
  refunded: number | null;
  derankProtected: boolean | null;
  protectionReplenished: boolean | null;
  mapIncentiveForgiven: number | null;
  placement: boolean | null;
};

export type RankState = {
  shields: number | null;
  protectionStatus: string | null;
  protectedTier: boolean | null;
  gamesNeededForRating: number | null;
  gamesNeededForLeaderboard: number | null;
  leaderboardRank: number | null;
  lastDerankProtected: boolean | null;
  lastProtectionReplenished: boolean | null;
  lastPlacement: boolean | null;
};

export function rankStateFacts(state: RankState | null | undefined): string[] {
  if (!state) return [];
  const facts: string[] = [];
  const needed = state.gamesNeededForRating ?? 0;
  if (needed > 0)
    facts.push(t(`${needed} ${needed > 1 ? "matchs" : "match"} avant d'être classé`, `${needed} ${needed === 1 ? "match" : "matches"} before getting ranked`));
  if (state.protectedTier) facts.push(t("Rang protégé", "Protected rank"));
  if (state.leaderboardRank) facts.push(t(`${state.leaderboardRank}e au classement`, `#${state.leaderboardRank} on the leaderboard`));
  if (state.lastDerankProtected) facts.push(t("Protection utilisée au dernier match", "Protection used in the last match"));
  else if (state.lastProtectionReplenished) facts.push(t("Protection rechargée au dernier match", "Protection replenished in the last match"));
  return facts;
}

export type RrSum = { total: number; matches: number };

export type RrBreakdown = {
  detailed: number;
  performanceBonus: RrSum;
  penalty: RrSum;
  afkPenalty: RrSum;
  refunded: RrSum;
  mapIncentiveForgiven: RrSum;
  derankProtected: number;
  protectionReplenished: number;
  placements: number;
};

export type RrFact = { key: string; value: string; label: string; tone: "good" | "bad" | "" };

const rr = (value: number) => {
  const size = Math.abs(value);
  return size < 1 ? fmt(size, 1) : fmt(Math.round(size));
};

const shown = (value: number | null | undefined) => value != null && Math.abs(value) >= 0.05;

const matchWord = (count: number) => t(count > 1 ? "matchs" : "match", count === 1 ? "match" : "matches");

export function rrSummary(detail: RrDetail): string | null {
  const parts: string[] = [];
  if (detail.rrBefore !== null) parts.push(t(`RR avant ${detail.rrBefore}`, `RR before ${detail.rrBefore}`));
  if (detail.change !== null) {
    const bonus = detail.performanceBonus ?? 0;
    const change = `${signed(detail.change)} RR`;
    parts.push(bonus ? t(`${change} (dont ${signed(bonus)} de bonus de performance)`, `${change} (including ${signed(bonus)} performance bonus)`) : change);
  }
  return parts.length ? parts.join(", ") : null;
}

export function rrFacts(detail: RrDetail): RrFact[] {
  const facts: RrFact[] = [];
  if (shown(detail.penalty)) facts.push({ key: "penalty", value: `-${rr(detail.penalty ?? 0)} RR`, label: t("pénalité de groupe", "party penalty"), tone: "bad" });
  if (shown(detail.afkPenalty)) facts.push({ key: "afk", value: `-${rr(detail.afkPenalty ?? 0)} RR`, label: t("pénalité d'inactivité", "AFK penalty"), tone: "bad" });
  if (shown(detail.refunded)) facts.push({ key: "refund", value: `+${rr(detail.refunded ?? 0)} RR`, label: t("remboursés", "refunded"), tone: "good" });
  if (shown(detail.mapIncentiveForgiven))
    facts.push({ key: "map", value: `${rr(detail.mapIncentiveForgiven ?? 0)} RR`, label: t("épargnés par le bonus nouvelle map", "spared by the new map incentive"), tone: "good" });
  if (detail.derankProtected) facts.push({ key: "protected", value: t("Protection", "Protection"), label: t("de rang utilisée", "used against a derank"), tone: "" });
  if (detail.protectionReplenished) facts.push({ key: "replenished", value: t("Protection", "Protection"), label: t("rechargée", "replenished"), tone: "good" });
  if (detail.placement) facts.push({ key: "placement", value: t("Placement", "Placement"), label: t("match de placement", "placement match"), tone: "" });
  return facts;
}

export function breakdownFacts(breakdown: RrBreakdown): RrFact[] {
  const facts: RrFact[] = [];
  const { performanceBonus, penalty, afkPenalty, refunded, mapIncentiveForgiven } = breakdown;
  if (performanceBonus.matches)
    facts.push({
      key: "bonus",
      value: `+${rr(performanceBonus.total)} RR`,
      label: t(`de bonus de performance sur ${performanceBonus.matches} ${matchWord(performanceBonus.matches)}`, `performance bonus over ${performanceBonus.matches} ${matchWord(performanceBonus.matches)}`),
      tone: "good",
    });
  if (penalty.matches)
    facts.push({
      key: "penalty",
      value: `-${rr(penalty.total)} RR`,
      label: t(`de pénalité de groupe sur ${penalty.matches} ${matchWord(penalty.matches)}`, `party penalty over ${penalty.matches} ${matchWord(penalty.matches)}`),
      tone: "bad",
    });
  if (afkPenalty.matches)
    facts.push({
      key: "afk",
      value: `-${rr(afkPenalty.total)} RR`,
      label: t(`de pénalité d'inactivité sur ${afkPenalty.matches} ${matchWord(afkPenalty.matches)}`, `AFK penalty over ${afkPenalty.matches} ${matchWord(afkPenalty.matches)}`),
      tone: "bad",
    });
  if (refunded.matches)
    facts.push({
      key: "refund",
      value: `+${rr(refunded.total)} RR`,
      label: t(`remboursés sur ${refunded.matches} ${matchWord(refunded.matches)}`, `refunded over ${refunded.matches} ${matchWord(refunded.matches)}`),
      tone: "good",
    });
  if (mapIncentiveForgiven.matches)
    facts.push({
      key: "map",
      value: `${rr(mapIncentiveForgiven.total)} RR`,
      label: t(`épargnés par le bonus nouvelle map sur ${mapIncentiveForgiven.matches} ${matchWord(mapIncentiveForgiven.matches)}`, `spared by the new map incentive over ${mapIncentiveForgiven.matches} ${matchWord(mapIncentiveForgiven.matches)}`),
      tone: "good",
    });
  if (breakdown.derankProtected)
    facts.push({
      key: "protected",
      value: String(breakdown.derankProtected),
      label: t("fois protégé d'une descente de rang", `${breakdown.derankProtected === 1 ? "time" : "times"} protected from a derank`),
      tone: "",
    });
  if (breakdown.protectionReplenished)
    facts.push({
      key: "replenished",
      value: String(breakdown.protectionReplenished),
      label: t("recharges de protection", breakdown.protectionReplenished === 1 ? "protection refill" : "protection refills"),
      tone: "",
    });
  if (breakdown.placements)
    facts.push({ key: "placements", value: String(breakdown.placements), label: t(`${breakdown.placements > 1 ? "matchs" : "match"} de placement`, breakdown.placements === 1 ? "placement match" : "placement matches"), tone: "" });
  return facts;
}
