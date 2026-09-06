import { BoatSkin } from '@/game/types';

/** A small rendering of a boat skin using its own colours. */
export default function BoatPreview({ skin }: { skin: BoatSkin }) {
  return (
    <div
      className="relative flex h-full w-full items-end justify-center overflow-hidden"
      style={{ background: `linear-gradient(to bottom, ${skin.hull[0]}, ${skin.hull[2]})` }}
    >
      <div
        className="h-12 w-[88%] rounded-t-2xl"
        style={{ background: `linear-gradient(to bottom, ${skin.deck[0]}, ${skin.deck[2]}, ${skin.deck[4]})` }}
      />
      <div
        className="absolute left-[6%] right-[6%] h-1.5 rounded-full"
        style={{ bottom: '46px', background: `linear-gradient(to bottom, ${skin.rail[0]}, ${skin.rail[2]})` }}
      />
      <span className="absolute right-1 top-1 text-base" style={{ color: skin.rail[1] }}>{skin.emoji}</span>
    </div>
  );
}
