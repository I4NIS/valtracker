import { lazy, Suspense, useState } from "react";
import type { Account } from "../lib/api";
import { t } from "../lib/i18n";
import { Icon } from "./Icon";

export type ExportMode = "match" | "matches" | "range" | "act" | "session";

export type ExportPreset = { mode: ExportMode; matchId?: string | null; season?: string | null };

type Common = { account: Account; label?: string; className?: string };

type Props =
  | (Common & { kind: "match"; matchId: string })
  | (Common & { kind: "session" })
  | (Common & { kind: "act"; season: string | null });

type DialogProps = { account: Account; preset?: ExportPreset; onClose: () => void };

export const loadExportDialog = () => import("./ExportDialog");

const LazyDialog = lazy(() => loadExportDialog().then((module) => ({ default: module.ExportDialog })));

export function ExportDialog(props: DialogProps) {
  return (
    <Suspense fallback={null}>
      <LazyDialog {...props} />
    </Suspense>
  );
}

export function ExportRecapButton(props: Props) {
  const [open, setOpen] = useState(false);
  const preset: ExportPreset =
    props.kind === "match"
      ? { mode: "match", matchId: props.matchId }
      : props.kind === "act"
        ? { mode: "act", season: props.season }
        : { mode: "session" };

  return (
    <>
      <button
        type="button"
        className={props.className ? `btn btn-secondary ${props.className}` : "btn btn-secondary"}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        title={props.label ?? t("Exporter l'image", "Export image")}
      >
        <Icon name="image" size={16} />
        <span className="btn-label">{props.label ?? t("Exporter l'image", "Export image")}</span>
      </button>
      {open && <ExportDialog account={props.account} preset={preset} onClose={() => setOpen(false)} />}
    </>
  );
}
