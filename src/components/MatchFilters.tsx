import type { OverviewFilters, Party } from "../lib/api";
import { agentIcon } from "../lib/assets";
import { roleLabel } from "../lib/format";
import { t } from "../lib/i18n";
import { useQuery } from "../lib/query";
import { queries } from "../lib/queries";
import { FilterPill, type PillOption } from "./FilterPill";
import { Icon } from "./Icon";

export type ExtraFilters = Omit<OverviewFilters, "season">;

export const NO_EXTRA: ExtraFilters = { mapId: null, agentId: null, role: null, days: null, party: null };

export const hasExtra = (extra: ExtraFilters) => Object.values(extra).some((value) => value !== null);

const PERIODS = (): PillOption<number>[] => [
  { value: 7, label: t("7 derniers jours", "Last 7 days") },
  { value: 30, label: t("30 derniers jours", "Last 30 days") },
];

const PARTIES = (): PillOption<Party>[] => [
  { value: "solo", label: t("Solo", "Solo") },
  { value: "group", label: t("En groupe", "In a group") },
];

type Props = {
  puuid: string;
  value: ExtraFilters;
  onChange: (value: ExtraFilters) => void;
};

export function MatchFilters({ puuid, value, onChange }: Props) {
  const options = useQuery(queries.filterOptions(puuid)).data ?? null;

  return (
    <div className="chips" role="group" aria-label={t("Filtres", "Filters")}>
      {(options?.maps.length ?? 0) > 1 && (
        <FilterPill
          label={t("Map", "Map")}
          allLabel={t("Toutes les maps", "All maps")}
          value={value.mapId}
          options={options!.maps.map((map) => ({ value: map.id, label: map.name, count: map.matches }))}
          onChange={(mapId) => onChange({ ...value, mapId })}
        />
      )}
      {(options?.agents.length ?? 0) > 1 && (
        <FilterPill
          label={t("Agent", "Agent")}
          allLabel={t("Tous les agents", "All agents")}
          value={value.agentId}
          options={options!.agents.map((agent) => ({
            value: agent.id,
            label: agent.name,
            count: agent.matches,
            image: agentIcon(agent.id),
          }))}
          onChange={(agentId) => onChange({ ...value, agentId })}
        />
      )}
      {(options?.roles.length ?? 0) > 1 && (
        <FilterPill
          label={t("Rôle", "Role")}
          allLabel={t("Tous les rôles", "All roles")}
          value={value.role}
          options={options!.roles.map((role) => ({ value: role.id, label: roleLabel(role.id), count: role.matches }))}
          onChange={(role) => onChange({ ...value, role })}
        />
      )}
      <FilterPill
        label={t("Période", "Period")}
        allLabel={t("Tout", "All")}
        value={value.days}
        options={PERIODS()}
        onChange={(days) => onChange({ ...value, days })}
      />
      <FilterPill
        label={t("Solo ou en groupe", "Solo or group")}
        allLabel={t("Solo et en groupe", "Solo and group")}
        value={value.party}
        options={PARTIES()}
        onChange={(party) => onChange({ ...value, party })}
      />
      {hasExtra(value) && (
        <button type="button" className="chip filter-reset" onClick={() => onChange(NO_EXTRA)}>
          <Icon name="close" size={14} strokeWidth={2} />
          {t("Réinitialiser", "Reset")}
        </button>
      )}
    </div>
  );
}
