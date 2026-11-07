import "../styles/ranked.css";
import { tierLabel } from "../lib/assets";
import { t } from "../lib/i18n";
import { rrFacts, tierFromName, type RrDetail, type RrFact } from "../lib/ranked";
import { RankBadge } from "./RankBadge";

export function FactList({ facts, label }: { facts: RrFact[]; label: string }) {
  if (facts.length === 0) return null;
  return (
    <ul className="rr-facts" aria-label={label}>
      {facts.map((fact) => (
        <li key={fact.key} className="rr-fact">
          <strong className={fact.tone}>{fact.value}</strong>
          <span className="muted">{fact.label}</span>
        </li>
      ))}
    </ul>
  );
}

export function MatchRrDetail({ detail }: { detail: RrDetail | null }) {
  if (!detail) return null;
  const facts = rrFacts(detail);
  const tierChanged = detail.tierBefore !== null && detail.tierAfter !== null && detail.tierBefore !== detail.tierAfter;
  if (facts.length === 0 && !tierChanged) return null;
  return (
    <section className="rr-detail" aria-label={t("Détail du RR", "RR breakdown")}>
      {tierChanged && (
        <div className="rr-detail-head">
          <span className="rr-detail-tiers">
            <RankBadge tier={tierFromName(detail.tierBeforeName) ?? detail.tierBefore} size={28} label={tierLabel(detail.tierBeforeName)} />
            <span className="faint">{t("vers", "to")}</span>
            <RankBadge tier={tierFromName(detail.tierAfterName) ?? detail.tierAfter} size={28} label={tierLabel(detail.tierAfterName)} />
            <strong>{tierLabel(detail.tierAfterName)}</strong>
          </span>
        </div>
      )}
      <FactList facts={facts} label={t("Ajustements de RR", "RR adjustments")} />
    </section>
  );
}
