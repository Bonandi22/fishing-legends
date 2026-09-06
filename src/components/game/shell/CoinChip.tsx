interface Props {
  coins: number;
  className?: string;
}

/** The 💰 balance pill shown in screen headers and the menu surface bar. */
export default function CoinChip({ coins, className = '' }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-lure/20 bg-menu-panel/70 px-3 py-1.5 text-sm font-bold tabular-nums text-foreground ${className}`}
    >
      <span aria-hidden="true">💰</span>
      {coins.toLocaleString()}
    </span>
  );
}
