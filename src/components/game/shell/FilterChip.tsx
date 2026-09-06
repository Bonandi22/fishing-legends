import type { ReactNode } from 'react';

interface Props {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}

/** A small toggle chip used for rarity / sector filters across screens. */
export default function FilterChip({ active, onClick, children }: Props) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active ? 'bg-lure text-lure-foreground' : 'menu-row text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}
