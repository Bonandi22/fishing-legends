interface Props {
  price: number;
  className?: string;
}

/** A coin price, e.g. under a shop item. Free items render nothing. */
export default function PriceTag({ price, className = '' }: Props) {
  if (price <= 0) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold tabular-nums text-muted-foreground ${className}`}>
      <span aria-hidden="true">💰</span>
      {price.toLocaleString()}
    </span>
  );
}
