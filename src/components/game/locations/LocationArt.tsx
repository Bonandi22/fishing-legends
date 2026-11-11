import { useId } from 'react';

interface Props {
  name: string;
  img?: string;
  emoji: string;
  waterColor: string;
  /** true → the "uncharted" survey treatment instead of the photo */
  uncharted: boolean;
}

/**
 * The plate at the top of a location card. A charted water shows its treated
 * photo (or, where no photo exists, depth soundings in the water's own colour);
 * an uncharted water shows only the soundings behind a survey haze.
 */
export default function LocationArt({ name, img, emoji, waterColor, uncharted }: Props) {
  const gid = useId();
  const showPhoto = img && !uncharted;

  return (
    <div className="relative aspect-16/10 overflow-hidden bg-menu-raised">
      {showPhoto ? (
        <img
          src={img}
          alt={name}
          loading="lazy"
          width={768}
          height={480}
          className="absolute inset-0 h-full w-full object-cover saturate-[0.9] transition-transform duration-500 ease-out group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
      ) : (
        <>
          <svg
            viewBox="0 0 160 100"
            preserveAspectRatio="xMidYMid slice"
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            <defs>
              <radialGradient id={gid} cx="50%" cy="46%" r="72%">
                <stop offset="0%" stopColor={waterColor} stopOpacity="0.85" />
                <stop offset="60%" stopColor={waterColor} stopOpacity="0.35" />
                <stop offset="100%" stopColor={waterColor} stopOpacity="0.1" />
              </radialGradient>
            </defs>
            <rect width="160" height="100" fill="hsl(var(--menu-raised))" />
            <rect width="160" height="100" fill={`url(#${gid})`} />
            <g fill="none" stroke="hsl(var(--lure))" strokeOpacity="0.4" strokeWidth="0.75">
              <ellipse cx="80" cy="50" rx="16" ry="10" />
              <ellipse cx="80" cy="50" rx="30" ry="19" />
              <ellipse cx="80" cy="50" rx="46" ry="30" />
              <ellipse cx="80" cy="50" rx="64" ry="42" />
            </g>
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-4xl drop-shadow-[0_2px_8px_rgba(0,0,0,0.55)]">
            {emoji}
          </span>
        </>
      )}

      {/* legibility grade + faint keyline, consistent across every plate */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, hsl(205 60% 8% / 0.2) 0%, transparent 34%, transparent 52%, hsl(205 62% 6% / 0.9) 100%)',
        }}
      />
      <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-lure/15" />

      {uncharted && <div className="pointer-events-none absolute inset-0 bg-abyss/35 backdrop-blur-[1px]" />}
    </div>
  );
}
