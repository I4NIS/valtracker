import "../styles/ranked.css";
import { t } from "../lib/i18n";
import { breakdownFacts, type RrBreakdown } from "../lib/ranked";
import { FactList } from "./MatchRrDetail";

export function RrBreakdownFacts({ breakdown }: { breakdown: RrBreakdown | undefined }) {
  const facts = breakdown ? breakdownFacts(breakdown) : [];
  if (facts.length === 0) return null;
  return (
    <div className="rr-breakdown">
      <span className="label">{t("Ajustements de RR sur la période", "RR adjustments in this period")}</span>
      <FactList facts={facts} label={t("Ajustements de RR sur la période", "RR adjustments in this period")} />
    </div>
  );
}
