import "../styles/crosshairs.css";
import { useState, type FormEvent } from "react";
import { errorMessage } from "../lib/api";
import { cleanCode, crosshairs, localDay, type Crosshair, type CrosshairPeriod } from "../lib/crosshairs";
import { fmt, formatDate, pct, signed } from "../lib/format";
import { t } from "../lib/i18n";
import { invalidate, useQuery } from "../lib/query";
import { queries } from "../lib/queries";
import { Icon } from "./Icon";
import { repeat, SkeletonBlock, SkeletonGroup, SkeletonLine } from "./Skeleton";

const SMALL_SAMPLE = 3;
const MAX_LABEL = 40;
const LONG_DAY: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" };

const matchCount = (count: number) => t(`${count} ${count > 1 ? "matchs" : "match"}`, `${count} ${count === 1 ? "match" : "matches"}`);
const dayLabel = (day: string) => formatDate(new Date(`${day}T00:00:00`), LONG_DAY);
const points = (value: number) => t(`${signed(value, 1)} pts`, `${signed(value, 1)} pts`);

export function CrosshairJournal({ puuid }: { puuid: string }) {
  const query = useQuery(queries.crosshairs(puuid));
  const report = query.data ?? null;

  const cards = (report?.crosshairs ?? [])
    .map((crosshair, index) => {
      const period = report?.periods[index + 1];
      const previous = report?.periods.slice(0, index + 1).reverse().find((item) => item.matches > 0) ?? null;
      return { crosshair, period, previous };
    })
    .reverse();
  const before = report?.periods[0];

  return (
    <section className="stack" style={{ gap: 24 }}>
      <CrosshairForm puuid={puuid} />

      {query.error && !report && <p className="form-error">{query.error}</p>}

      {report === null ? (
        query.error ? null : <CrosshairSkeleton />
      ) : report.crosshairs.length === 0 ? (
        <div className="empty journal-empty">
          <strong>{t("Aucun viseur enregistré", "No crosshair saved")}</strong>
          <span>
            {t(
              "Ajoute le code de ton viseur et la date depuis laquelle tu l'utilises. Tes matchs compétitifs sont ensuite regroupés entre chaque changement de viseur.",
              "Add your crosshair code and the date you started using it. Your competitive matches are then grouped between each crosshair change.",
            )}
          </span>
        </div>
      ) : (
        <div className="stack" style={{ gap: 16 }}>
          <div className="row between wrap">
            <h2 className="section-title">{t("Tes viseurs", "Your crosshairs")}</h2>
            <span className="faint" style={{ fontSize: 13 }}>
              {t("Écarts comparés à la période précédente", "Differences compared to the previous period")}
            </span>
          </div>
          <div className="xhair-list">
            {cards.map(({ crosshair, period, previous }, index) => (
              <CrosshairCard key={crosshair.id} puuid={puuid} crosshair={crosshair} period={period ?? null} previous={previous} current={index === 0} />
            ))}
            {before && before.matches > 0 && (
              <article className="xhair-card">
                <div className="xhair-head">
                  <span className="xhair-image empty" aria-hidden="true" />
                  <div className="stack xhair-title">
                    <strong>{t("Avant ton premier viseur", "Before your first crosshair")}</strong>
                    <span className="faint">{matchCount(before.matches)}</span>
                  </div>
                </div>
                <PeriodStats period={before} previous={null} />
              </article>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function CrosshairForm({ puuid }: { puuid: string }) {
  const today = localDay();
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [day, setDay] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const clean = cleanCode(code);
    if (!clean) {
      setError(
        t(
          "Ce code n'a pas un format valide. Il commence par 0; et se copie depuis les paramètres du réticule dans le jeu.",
          "This code does not have a valid format. It starts with 0; and is copied from the crosshair settings in the game.",
        ),
      );
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > today) {
      setError(t("Choisis une date passée ou celle d'aujourd'hui.", "Pick a past date or today."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await crosshairs.add(puuid, clean, label, day);
      setCode("");
      setLabel("");
      setDay(today);
      invalidate("journal|crosshairs|");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="panel xhair-form" onSubmit={submit}>
      <div className="xhair-fields">
        <div className="field xhair-field-code">
          <label htmlFor="xhair-code">{t("Code du viseur", "Crosshair code")}</label>
          <input
            id="xhair-code"
            className="input xhair-code-input"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="0;P;c;5;h;0;0l;4;0o;2;0a;1;0f;0;1b;0"
            spellCheck={false}
            autoComplete="off"
            disabled={busy}
          />
        </div>
        <div className="field">
          <label htmlFor="xhair-label">{t("Nom, facultatif", "Name, optional")}</label>
          <input id="xhair-label" className="input" value={label} maxLength={MAX_LABEL} onChange={(event) => setLabel(event.target.value)} disabled={busy} />
        </div>
        <div className="field">
          <label htmlFor="xhair-day">{t("Utilisé depuis le", "Used since")}</label>
          <input id="xhair-day" className="input" type="date" value={day} max={today} onChange={(event) => setDay(event.target.value)} disabled={busy} />
        </div>
        <button type="submit" className="btn btn-primary xhair-submit" disabled={busy || code.trim() === ""}>
          <Icon name="plus" size={16} strokeWidth={2.2} />
          {busy ? t("Ajout", "Adding") : t("Ajouter", "Add")}
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
      <span className="hint">
        {t(
          "Dans le jeu : Paramètres, Réticule, puis l'icône d'export du profil. L'image du viseur est récupérée une seule fois puis gardée sur ton PC.",
          "In game: Settings, Crosshair, then the profile export icon. The crosshair image is fetched once and then kept on your PC.",
        )}
      </span>
    </form>
  );
}

function CrosshairCard({
  puuid,
  crosshair,
  period,
  previous,
  current,
}: {
  puuid: string;
  crosshair: Crosshair;
  period: CrosshairPeriod | null;
  previous: CrosshairPeriod | null;
  current: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = period?.matches ?? 0;

  const remove = async () => {
    setBusy(true);
    try {
      await crosshairs.remove(puuid, crosshair.id);
      invalidate("journal|crosshairs|");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <article className="xhair-card">
      <div className="xhair-head">
        {crosshair.image ? (
          <img className="xhair-image" src={crosshair.image} alt={t("Aperçu du viseur", "Crosshair preview")} width={88} height={88} />
        ) : (
          <span className="xhair-image empty" title={t("Image indisponible", "Image unavailable")}>
            <Icon name="image" size={20} />
          </span>
        )}
        <div className="stack xhair-title">
          <div className="row wrap" style={{ gap: 8 }}>
            <strong className="ellipsis">{crosshair.label || t(`Viseur du ${dayLabel(crosshair.sinceDate)}`, `Crosshair from ${dayLabel(crosshair.sinceDate)}`)}</strong>
            {current && <span className="xhair-badge">{t("Actuel", "Current")}</span>}
            {matches > 0 && matches < SMALL_SAMPLE && <span className="journal-sample">{t("Peu de matchs", "Few matches")}</span>}
          </div>
          <span className="faint">
            {t(`Depuis le ${dayLabel(crosshair.sinceDate)}`, `Since ${dayLabel(crosshair.sinceDate)}`)}, {matchCount(matches)}
          </span>
          <code className="xhair-code" title={crosshair.code}>
            {crosshair.code}
          </code>
        </div>
        <div className="xhair-actions">
          {confirming ? (
            <>
              <button type="button" className="chip" onClick={() => setConfirming(false)} disabled={busy}>
                {t("Annuler", "Cancel")}
              </button>
              <button type="button" className="chip xhair-delete" onClick={remove} disabled={busy}>
                {t("Supprimer", "Delete")}
              </button>
            </>
          ) : (
            <button type="button" className="icon-btn" aria-label={t("Supprimer ce viseur", "Delete this crosshair")} onClick={() => setConfirming(true)}>
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
      {period && period.matches > 0 ? (
        <PeriodStats period={period} previous={previous} />
      ) : (
        <span className="hint">{t("Aucun match compétitif joué avec ce viseur.", "No competitive match played with this crosshair.")}</span>
      )}
    </article>
  );
}

function PeriodStats({ period, previous }: { period: CrosshairPeriod; previous: CrosshairPeriod | null }) {
  const diff = (value: number | null, before: number | null | undefined) => (value !== null && before !== null && before !== undefined ? value - before : null);
  return (
    <div className="xhair-stats">
      <Stat label="HS" value={period.hsPct !== null ? pct(period.hsPct) : "-"} delta={diff(period.hsPct, previous?.hsPct)} format={points} />
      <Stat label="K/D" value={period.kd !== null ? fmt(period.kd, 2) : "-"} delta={diff(period.kd, previous?.kd)} format={(value) => signed(value, 2)} />
      <Stat
        label={t("Premiers duels gagnés", "First duels won")}
        value={period.firstDuelsWonPct !== null ? pct(period.firstDuelsWonPct, 0) : "-"}
        sub={period.firstDuels > 0 ? t(`sur ${fmt(period.firstDuels)}`, `of ${fmt(period.firstDuels)}`) : undefined}
        delta={diff(period.firstDuelsWonPct, previous?.firstDuelsWonPct)}
        format={points}
      />
      <Stat label="ACS" value={period.acs !== null ? fmt(period.acs) : "-"} delta={diff(period.acs, previous?.acs)} format={(value) => signed(value, 0)} />
    </div>
  );
}

function Stat({ label, value, sub, delta, format }: { label: string; value: string; sub?: string; delta: number | null; format: (value: number) => string }) {
  return (
    <div className="xhair-stat">
      <span className="label">{label}</span>
      <strong>
        {value}
        {sub && <small className="faint"> {sub}</small>}
      </strong>
      {delta !== null && <span className={delta > 0 ? "good" : delta < 0 ? "bad" : "faint"}>{format(delta)}</span>}
    </div>
  );
}

function CrosshairSkeleton() {
  return (
    <SkeletonGroup className="xhair-list" label={t("Chargement des viseurs", "Loading crosshairs")}>
      {repeat(2, (index) => (
        <div className="xhair-card" key={index} aria-hidden="true">
          <div className="xhair-head">
            <SkeletonBlock width={88} height={88} radius={12} />
            <div className="stack xhair-title">
              <SkeletonLine width={index ? "34%" : "42%"} size={15} />
              <SkeletonLine width="30%" size={13} />
              <SkeletonLine width="60%" size={12} />
            </div>
          </div>
          <div className="xhair-stats">
            {repeat(4, (cell) => (
              <div className="xhair-stat" key={cell}>
                <SkeletonLine width={60} size={12} />
                <SkeletonLine width={70} size={20} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </SkeletonGroup>
  );
}
