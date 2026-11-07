import "../styles/game.css";
import { useState, type ReactNode } from "react";
import { findAbility, MELEE_ID, weaponArt, type Ability, type Catalog } from "../lib/gameAssets";
import { t } from "../lib/i18n";

type ArtProps = {
  src: string | undefined;
  width: number;
  height: number;
  alt: string;
  className?: string;
  mono?: boolean;
  eager?: boolean;
  title?: string;
  fallback?: ReactNode;
};

export function Art({ src, width, height, alt, className, mono, eager, title, fallback }: ArtProps) {
  const [failed, setFailed] = useState<string | null>(null);
  const classes = ["art", mono ? "art-mono" : "", className ?? ""].filter(Boolean).join(" ");
  if (!src || failed === src) {
    return fallback === undefined ? <span className={`${classes} art-empty`} style={{ width, height }} aria-hidden="true" /> : <>{fallback}</>;
  }
  return (
    <img
      src={src}
      width={width}
      height={height}
      alt={alt}
      title={title}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className={classes}
      onError={() => setFailed(src)}
    />
  );
}

export function AbilityArt({ ability, size, className }: { ability: Ability | null; size: number; className?: string }) {
  return (
    <Art
      src={ability?.icon ?? undefined}
      width={size}
      height={size}
      alt={ability?.label ?? ""}
      title={ability?.label}
      mono
      className={className}
    />
  );
}

export function SpikeGlyph({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg className={`spike-glyph${className ? ` ${className}` : ""}`} width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Spike">
      <path d="M12 2 19 6v12l-7 4-7-4V6z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 7v10M8.5 9.5 12 7l3.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type KillProps = {
  weaponId?: string | null;
  weaponName?: string | null;
  weaponKind?: string | null;
  agentId?: string | null;
  catalog: Catalog | null;
  height?: number;
  bare?: boolean;
};

export function meansLabel(weaponName: string | null | undefined, weaponKind: string | null | undefined): string {
  if (weaponName) return weaponName;
  switch (weaponKind?.toLowerCase()) {
    case "melee":
      return t("Couteau", "Knife");
    case "bomb":
      return "Spike";
    case "fall":
      return t("Chute", "Fall");
    case undefined:
    case "":
      return t("Arme inconnue", "Unknown weapon");
    default:
      return t("Capacité", "Ability");
  }
}

export function KillMeans({ weaponId, weaponName, weaponKind, agentId, catalog, height = 22, bare }: KillProps) {
  const kind = weaponKind?.toLowerCase() ?? (weaponId ? "weapon" : null);
  const label = bare ? null : <span className="kill-means-text">{meansLabel(weaponName, kind)}</span>;

  if (kind === "bomb") {
    return (
      <span className="kill-means" title={t("Explosion du spike", "Spike explosion")}>
        <SpikeGlyph size={height} />
      </span>
    );
  }
  if (kind === "ability") {
    const ability = findAbility(catalog, weaponName, agentId);
    if (!ability?.icon && !label) return null;
    return (
      <span className="kill-means" title={ability?.label ?? meansLabel(weaponName, kind)}>
        {ability?.icon ? <AbilityArt ability={ability} size={height} /> : label}
      </span>
    );
  }
  const id = kind === "melee" ? MELEE_ID : weaponId;
  if (!id) return label && <span className="kill-means">{label}</span>;
  return (
    <span className="kill-means" title={meansLabel(weaponName, kind)}>
      <Art
        src={weaponArt(id, "killstreamicon")}
        width={Math.round(height * 3.4)}
        height={height}
        alt={meansLabel(weaponName, kind)}
        mono
        className="kill-means-weapon"
        fallback={label}
      />
    </span>
  );
}
