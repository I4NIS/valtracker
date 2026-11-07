import "../styles/ranked.css";
import { t } from "../lib/i18n";
import { rankStateFacts, type RankState } from "../lib/ranked";

const MAX_SHIELDS = 5;

function Shield() {
  return (
    <svg width="14" height="16" viewBox="0 0 14 16" aria-hidden="true" className="rank-shield">
      <path d="M7 0.8 13 3v4.6c0 3.7-2.5 6.3-6 7.6C3.5 13.9 1 11.3 1 7.6V3z" />
    </svg>
  );
}

export function RankProtection({ state }: { state: RankState | null | undefined }) {
  const shields = Math.max(0, state?.shields ?? 0);
  const facts = rankStateFacts(state);
  if (shields === 0 && facts.length === 0) return null;
  return (
    <span className="rank-protection">
      {shields > 0 && (
        <span
          className="rank-shields"
          role="img"
          aria-label={t(`${shields} ${shields > 1 ? "boucliers" : "bouclier"} de protection de rang`, `${shields} rank protection ${shields === 1 ? "shield" : "shields"}`)}
          title={t(`${shields} ${shields > 1 ? "boucliers" : "bouclier"} de protection de rang`, `${shields} rank protection ${shields === 1 ? "shield" : "shields"}`)}
        >
          {Array.from({ length: Math.min(shields, MAX_SHIELDS) }, (_, index) => (
            <Shield key={index} />
          ))}
          {shields > MAX_SHIELDS && <span className="faint">+{shields - MAX_SHIELDS}</span>}
        </span>
      )}
      {facts.map((fact) => (
        <span key={fact} className="rank-protection-fact">
          {fact}
        </span>
      ))}
    </span>
  );
}
