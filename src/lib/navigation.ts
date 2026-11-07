import { createContext, useContext, useEffect } from "react";

export const PageVisible = createContext(true);

export const usePageVisible = () => useContext(PageVisible);

let label: string | null = null;

export function useBackLabel(value: string | null) {
  useEffect(() => {
    label = value;
    return () => {
      if (label === value) label = null;
    };
  }, [value]);
}

export const currentBackLabel = () => label;
