const PATHS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  matches: "M4 6h16M4 12h16M4 18h10",
  progress: "M3 17l6-6 4 4 8-8M15 7h6v6",
  agents: "M8 8a4 4 0 1 0 8 0a4 4 0 1 0-8 0M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6",
  maps: "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14",
  weapons: "M4 12a8 8 0 1 0 16 0a8 8 0 1 0-16 0M12 2v5M12 17v5M2 12h5M17 12h5",
  duels: "M5 5l14 14M19 5 5 19M3 8l5-5M16 21l5-5M21 8l-5-5M3 16l5 5",
  heatmaps: "M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 .3 2 1.5 3 2.5 3 0-3-1-5 0-8z",
  journal: "M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11",
  settings: "M4 7h10M18 7h2M4 17h4M12 17h8M14 7a2 2 0 1 0 4 0a2 2 0 1 0-4 0M8 17a2 2 0 1 0 4 0a2 2 0 1 0-4 0",
  sync: "M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4",
  sun: "M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
  check: "M5 12l5 5 9-10",
  running: "M12 4a8 8 0 1 0 8 8",
  wait: "M8 12h8",
  external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  close: "M6 6l12 12M18 6 6 18",
  minus: "M6 12h12",
  plus: "M12 6v12M6 12h12",
  chevron: "M7 10l5 5 5-5",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  star: "M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.8L12 16.85l-5.25 2.75 1-5.8L3.5 9.7l5.9-.9z",
  image: "M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 16l4.5-4.5 3.5 3.5 2.5-2.5L20 18M14 9a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0",
};

export type IconName = keyof typeof PATHS;

type Props = {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  filled?: boolean;
};

export function Icon({ name, size = 18, strokeWidth = 1.9, className, filled }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
