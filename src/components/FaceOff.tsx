import "../styles/faceoff.css";
import type { FaceOffLine } from "../lib/api";
import { agentIcon } from "../lib/assets";
import { fmt } from "../lib/format";
import { t } from "../lib/i18n";
import { useSort, type SortColumns } from "../lib/sort";
import { fadeIn } from "./GameArt";
import { SortHeader } from "./SortHeader";

const COLUMNS: SortColumns<FaceOffLine> = {
  name: { value: (line) => line.name },
  kills: { value: (line) => line.kills },
  deaths: { value: (line) => line.deaths },
  balance: { value: (line) => line.kills - line.deaths },
  dealt: { value: (line) => line.damageDealt },
  received: { value: (line) => line.damageReceived },
};

export function FaceOff({ lines }: { lines: FaceOffLine[] }) {
  const table = useSort("face-off", lines, COLUMNS, { key: "balance", dir: "desc" });
  if (lines.length === 0) return null;
  return (
    <section className="stack" style={{ gap: 10 }}>
      <div className="section-head">
        <h2 className="section-title">{t("Face à face", "Head to head")}</h2>
        <span className="faint" style={{ fontSize: 13 }}>
          {t("Tes kills sur chaque adversaire, ses kills sur toi et les dégâts échangés", "Your kills on each opponent, their kills on you and the damage traded")}
        </span>
      </div>
      <div className="list-scroll">
        <div>
          <div className="faceoff-row head">
            <span />
            <SortHeader table={table} column="name">{t("Adversaire", "Opponent")}</SortHeader>
            <SortHeader table={table} column="kills">{t("Tu l'as tué", "You killed")}</SortHeader>
            <SortHeader table={table} column="balance">{t("Bilan", "Balance")}</SortHeader>
            <SortHeader table={table} column="deaths">{t("Il t'a tué", "Killed you")}</SortHeader>
            <SortHeader table={table} column="dealt">{t("Dégâts donnés", "Damage dealt")}</SortHeader>
            <SortHeader table={table} column="received">{t("Dégâts reçus", "Damage taken")}</SortHeader>
          </div>
          {table.rows.map((line) => {
            const total = line.kills + line.deaths;
            const share = total > 0 ? (line.kills / total) * 100 : 0;
            return (
              <div className="faceoff-row" key={line.puuid}>
                {agentIcon(line.agentId) ? (
                  <img src={agentIcon(line.agentId)} alt={line.agentName ?? ""} width={30} height={30} loading="lazy" decoding="async" {...fadeIn} />
                ) : (
                  <span />
                )}
                <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                  <strong className="ellipsis">{line.name}</strong>
                  <span className="faint ellipsis" style={{ fontSize: 12 }}>
                    {line.agentName ?? ""}
                  </span>
                </span>
                <strong className={line.kills > 0 ? "good" : "faint"}>{line.kills}</strong>
                <span
                  className="faceoff-split"
                  role="img"
                  aria-label={t(`${line.kills} kills sur lui, ${line.deaths} morts face à lui`, `${line.kills} kills on them, ${line.deaths} deaths to them`)}
                >
                  {total === 0 ? (
                    <span className="faceoff-empty" />
                  ) : (
                    <>
                      {line.kills > 0 && <span className="faceoff-win" style={{ width: `${share}%` }} />}
                      {line.deaths > 0 && <span className="faceoff-loss" style={{ width: `${100 - share}%` }} />}
                    </>
                  )}
                </span>
                <strong className={line.deaths > 0 ? "bad" : "faint"}>{line.deaths}</strong>
                <span className="muted">{fmt(line.damageDealt)}</span>
                <span className="muted">{fmt(line.damageReceived)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
