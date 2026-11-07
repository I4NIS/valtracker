type Props = {
  size?: number;
  mono?: boolean;
};

export function Logo({ size = 22, mono = false }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M6 10H19L32 40V56Z" fill={mono ? "#FFFFFF" : "var(--accent)"} />
      <path d="M58 10H45L32 40V56Z" fill={mono ? "#FFFFFF" : "var(--accent-2)"} fillOpacity={mono ? 0.68 : 1} />
    </svg>
  );
}
