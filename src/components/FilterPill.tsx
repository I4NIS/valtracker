import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

export type PillOption<T> = {
  value: T;
  label: string;
  count?: number;
  image?: string | null;
};

type Props<T> = {
  label: string;
  allLabel: string;
  value: T | null;
  options: PillOption<T>[];
  onChange: (value: T | null) => void;
};

export function useMenu() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return { open, setOpen, root };
}

export function FilterPill<T extends string | number>({ label, allLabel, value, options, onChange }: Props<T>) {
  const { open, setOpen, root } = useMenu();
  const selected = value === null ? null : (options.find((option) => option.value === value) ?? null);

  const pick = (next: T | null) => {
    setOpen(false);
    if (next !== value) onChange(next);
  };

  return (
    <div className="filter-pill" ref={root}>
      <button
        type="button"
        className={`chip${value !== null ? " active" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {selected?.image && <img src={selected.image} alt="" width={20} height={20} decoding="async" />}
        {selected ? selected.label : label}
        <Icon name="chevron" size={14} strokeWidth={2} />
      </button>
      {open && (
        <div className="filter-menu" role="listbox" aria-label={label}>
          <button type="button" role="option" aria-selected={value === null} onClick={() => pick(null)}>
            <span className="filter-menu-name">{allLabel}</span>
          </button>
          {options.map((option) => (
            <button
              key={String(option.value)}
              type="button"
              role="option"
              aria-selected={option.value === value}
              onClick={() => pick(option.value)}
            >
              <span className="filter-menu-name">
                {option.image && <img src={option.image} alt="" width={20} height={20} loading="lazy" decoding="async" />}
                {option.label}
              </span>
              {option.count !== undefined && <span className="faint">{option.count}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
