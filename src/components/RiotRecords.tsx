import "../styles/ranked.css";
import { accoladeHasValue, accoladeLabel, accoladeValue, type Accolades, type MatchAccolade } from "../lib/career";
import { t } from "../lib/i18n";

export function RiotRecords({ accolades }: { accolades: Accolades | undefined }) {
  const stats = (accolades?.available ? accolades.allTime : []).filter((stat) => accoladeLabel(stat.kind) !== null && stat.count > 0);
  if (stats.length === 0) return null;
  return (
    <section className="stack" style={{ gap: 12 }}>
      <div className="section-head">
        <h2 className="section-title">{t("Records Riot", "Riot records")}</h2>
        <span className="faint">{t("Distinctions de fin de match, depuis la création du compte", "End-of-match accolades, since the account was created")}</span>
      </div>
      <div className="riot-records">
        {stats.map((stat) => (
          <div className="riot-record" key={stat.id}>
            <span className="label">{accoladeLabel(stat.kind)}</span>
            {accoladeHasValue(stat.kind) ? (
              <>
                <strong>{accoladeValue(stat.kind, stat.best)}</strong>
                <span className="faint">{t(`meilleur score, obtenu ${stat.count} fois`, `best value, earned ${stat.count} ${stat.count === 1 ? "time" : "times"}`)}</span>
              </>
            ) : (
              <>
                <strong>{stat.count}</strong>
                <span className="faint">{t("nombre de fois obtenu", stat.count === 1 ? "time earned" : "times earned")}</span>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export function MatchAccolades({ accolades }: { accolades: MatchAccolade[] | undefined }) {
  const known = (accolades ?? []).filter((accolade) => accoladeLabel(accolade.kind) !== null);
  if (known.length === 0) return null;
  return (
    <section className="rr-detail" aria-label={t("Records Riot du match", "Riot records in this match")}>
      <span className="rr-detail-summary">{t("Records Riot", "Riot records")}</span>
      <ul className="rr-facts">
        {known.map((accolade) => (
          <li key={accolade.id} className="rr-fact">
            {accoladeHasValue(accolade.kind) ? (
              <>
                <strong className={accolade.actRecord ? "gold" : ""}>{accoladeValue(accolade.kind, accolade.value)}</strong>
                <span className="muted">
                  {accoladeLabel(accolade.kind)}
                  {accolade.actRecord ? t(", record de l'acte", ", act record") : ""}
                </span>
              </>
            ) : (
              <strong>{accoladeLabel(accolade.kind)}</strong>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
