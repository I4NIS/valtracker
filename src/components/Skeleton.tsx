import "../styles/skeleton.css";
import type { CSSProperties, ReactNode } from "react";
import { t } from "../lib/i18n";

type Size = number | string;

type BlockProps = {
  width?: Size;
  height?: Size;
  radius?: Size;
  className?: string;
  style?: CSSProperties;
};

export function SkeletonBlock({ width = "100%", height = 16, radius, className, style }: BlockProps) {
  return (
    <span
      className={className ? `sk ${className}` : "sk"}
      style={{ width, height, borderRadius: radius, ...style }}
      aria-hidden="true"
    />
  );
}

type LineProps = { width?: Size; size?: number; lineHeight?: number; className?: string; style?: CSSProperties };

export function SkeletonLine({ width = "100%", size = 14, lineHeight = 1.21, className, style }: LineProps) {
  return (
    <span className={className ? `sk-text ${className}` : "sk-text"} style={{ width, height: Math.round(size * lineHeight), ...style }} aria-hidden="true">
      <SkeletonBlock width="100%" height={Math.max(6, Math.round(size * 0.72))} radius={Math.max(4, Math.round(size * 0.3))} />
    </span>
  );
}

export function SkeletonCircle({ size, className }: { size: number; className?: string }) {
  return <SkeletonBlock width={size} height={size} radius="50%" className={className} />;
}

export function SkeletonRow({ icon = 40, lines = 2, widths = ["42%", "26%"], className }: { icon?: number; lines?: number; widths?: Size[]; className?: string }) {
  return (
    <span className={className ? `sk-row ${className}` : "sk-row"} aria-hidden="true">
      {icon > 0 && <SkeletonBlock width={icon} height={icon} radius={8} />}
      <span className="sk-row-lines">
        {Array.from({ length: lines }, (_, index) => (
          <SkeletonLine key={index} width={widths[index] ?? widths[widths.length - 1]} size={index === 0 ? 15 : 12} />
        ))}
      </span>
    </span>
  );
}

export function SkeletonGroup({ className, style, label, children }: { className?: string; style?: CSSProperties; label?: string; children: ReactNode }) {
  return (
    <div className={className} style={style} role="status" aria-busy="true" aria-label={label ?? t("Chargement", "Loading")}>
      {children}
    </div>
  );
}

export function repeat<T>(count: number, render: (index: number) => T): T[] {
  return Array.from({ length: count }, (_, index) => render(index));
}
