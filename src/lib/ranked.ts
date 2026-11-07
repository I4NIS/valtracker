import { fmt, signed } from "./format";
import { t } from "./i18n";

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

const rr = (value: number) => Math.round(Math.abs(value));

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
  if (detail.penalty) facts.push({ key: "penalty", value: `-${rr(detail.penalty)} RR`, label: t("pénalité de groupe", "party penalty"), tone: "bad" });
  if (detail.afkPenalty) facts.push({ key: "afk", value: `-${rr(detail.afkPenalty)} RR`, label: t("pénalité d'inactivité", "AFK penalty"), tone: "bad" });
  if (detail.refunded) facts.push({ key: "refund", value: `+${rr(detail.refunded)} RR`, label: t("remboursés", "refunded"), tone: "good" });
  if (detail.mapIncentiveForgiven)
    facts.push({ key: "map", value: `${rr(detail.mapIncentiveForgiven)} RR`, label: t("épargnés par le bonus nouvelle map", "spared by the new map incentive"), tone: "good" });
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
      value: `+${fmt(performanceBonus.total)} RR`,
      label: t(`de bonus de performance sur ${performanceBonus.matches} ${matchWord(performanceBonus.matches)}`, `performance bonus over ${performanceBonus.matches} ${matchWord(performanceBonus.matches)}`),
      tone: "good",
    });
  if (penalty.matches)
    facts.push({
      key: "penalty",
      value: `-${fmt(penalty.total)} RR`,
      label: t(`de pénalité de groupe sur ${penalty.matches} ${matchWord(penalty.matches)}`, `party penalty over ${penalty.matches} ${matchWord(penalty.matches)}`),
      tone: "bad",
    });
  if (afkPenalty.matches)
    facts.push({
      key: "afk",
      value: `-${fmt(afkPenalty.total)} RR`,
      label: t(`de pénalité d'inactivité sur ${afkPenalty.matches} ${matchWord(afkPenalty.matches)}`, `AFK penalty over ${afkPenalty.matches} ${matchWord(afkPenalty.matches)}`),
      tone: "bad",
    });
  if (refunded.matches)
    facts.push({
      key: "refund",
      value: `+${fmt(refunded.total)} RR`,
      label: t(`remboursés sur ${refunded.matches} ${matchWord(refunded.matches)}`, `refunded over ${refunded.matches} ${matchWord(refunded.matches)}`),
      tone: "good",
    });
  if (mapIncentiveForgiven.matches)
    facts.push({
      key: "map",
      value: `${fmt(mapIncentiveForgiven.total)} RR`,
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
