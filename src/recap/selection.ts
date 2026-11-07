import type { Account } from "../lib/api";
import { t } from "../lib/i18n";
import type { SessionRecap } from "../lib/recap";
import { dayLabel, plural } from "./draw";
import { renderSummaryRecap } from "./session";

export type SelectionScope = { kind: "matches" } | { kind: "range"; first: string; last: string };

function sameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function thisYear(a: string, b: string): boolean {
  const current = new Date().getFullYear();
  return new Date(a).getFullYear() === current && new Date(b).getFullYear() === current;
}

export function spanLabel(first: string, last: string): string {
  const year = !thisYear(first, last);
  if (sameDay(first, last)) return t(`Le ${dayLabel(first, year)}`, dayLabel(first, year));
  return t(`Du ${dayLabel(first, year)} au ${dayLabel(last, year)}`, `${dayLabel(first, year)} to ${dayLabel(last, year)}`);
}

function dayCount(first: string, last: string): number {
  const start = new Date(first);
  const end = new Date(last);
  start.setHours(12, 0, 0, 0);
  end.setHours(12, 0, 0, 0);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

export function renderSelectionRecap(recap: SessionRecap, account: Account, scope: SelectionScope): Promise<HTMLCanvasElement> {
  const count = recap.matches.length;
  const first = recap.matches[0]?.startedAt ?? recap.startedAt;
  const last = recap.matches[count - 1]?.startedAt ?? recap.endedAt;
  const dated = !sameDay(first, last);
  if (scope.kind === "range") {
    return renderSummaryRecap(recap, account, {
      kind: t("Récap de période", "Period recap"),
      title: spanLabel(scope.first, scope.last),
      span: plural(dayCount(scope.first, scope.last), t("jour", "day"), t("jours", "days")),
      dated,
    });
  }
  return renderSummaryRecap(recap, account, {
    kind: t("Récap de sélection", "Selection recap"),
    title: t(`Sélection de ${plural(count, "partie", "parties")}`, `Selection of ${plural(count, "match", "matches")}`),
    span: spanLabel(first, last),
    dated,
  });
}
