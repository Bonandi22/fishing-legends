import { ChevronRight } from 'lucide-react';

export interface HubItem {
  label: string;
  meta?: string;
  onClick: () => void;
}

interface Props {
  title: string;
  items: HubItem[];
}

export default function HubList({ title, items }: Props) {
  return (
    <section className="w-full">
      <h2 className="font-body mb-2 px-1 text-sm font-medium normal-case tracking-normal text-muted-foreground">{title}</h2>
      <ul className="overflow-hidden rounded-2xl border border-border/60">
        {items.map((item, i) => (
          <li key={item.label + i}>
            <button
              type="button"
              onClick={item.onClick}
              className={`menu-row flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-foreground transition-colors ${
                i > 0 ? 'border-t border-border/50' : ''
              }`}
            >
              <span className="flex-1 truncate">{item.label}</span>
              {item.meta && (
                <span className="shrink-0 tabular-nums text-xs text-muted-foreground">{item.meta}</span>
              )}
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
