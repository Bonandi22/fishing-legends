import { RodSkin } from '@/game/types';

/** A small rendering of a rod skin using its own colours. */
export default function RodPreview({ skin }: { skin: RodSkin }) {
  return (
    <div
      className="relative flex h-full w-full items-center justify-center"
      style={{ background: `linear-gradient(135deg, ${skin.color}22, ${skin.color}11)` }}
    >
      <div className="relative h-3 w-[78%] rotate-[-28deg]">
        <div
          className="absolute left-0 top-0 h-full w-[28%] rounded-l-full"
          style={{ background: `linear-gradient(to bottom, ${skin.gripColor}, ${skin.rodColor})` }}
        />
        <div
          className="absolute left-[24%] -top-1 h-5 w-3 rounded-full border"
          style={{ background: skin.reelColor, borderColor: skin.accentColor }}
        />
        <div
          className="absolute right-0 top-[35%] h-[30%] w-[72%] rounded-r-full"
          style={{
            background: `linear-gradient(to right, ${skin.rodColor}, ${skin.accentColor})`,
            boxShadow: skin.emissive ? `0 0 8px ${skin.emissive}` : undefined,
          }}
        />
        <div className="absolute right-[18%] top-[30%] h-[40%] w-[2px]" style={{ background: skin.accentColor }} />
        <div className="absolute right-[42%] top-[30%] h-[40%] w-[2px]" style={{ background: skin.accentColor }} />
      </div>
      <span className="absolute right-1 top-0.5 text-sm">{skin.emoji}</span>
    </div>
  );
}
