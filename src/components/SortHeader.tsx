import "../styles/sort.css";
import type { CSSProperties, ReactNode } from "react";
import type { Sorter } from "../lib/sort";

type Props = {
  table: Sorter;
  column: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export function SortHeader({ table, column, children, className, style }: Props) {
  const dir = table.sort.key === column ? table.sort.dir : null;
  return (
    <span role="columnheader" aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined} className={className} style={style}>
      <button type="button" className={`sort-button${dir ? " active" : ""}`} onClick={() => table.toggle(column)}>
        {children}
        {dir && (
          <svg className="sort-arrow" width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
            <path d={dir === "asc" ? "M4 1.5L7 6H1Z" : "M4 6.5L1 2H7Z"} fill="currentColor" />
          </svg>
        )}
      </button>
    </span>
  );
}
