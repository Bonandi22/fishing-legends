import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { PlayerState, AQUARIUM_REWARDS, AQUARIUM_SECTORS } from '@/game/types';
import { FISH_IMAGES } from '@/game/fishImages';
import { useI18n, getRarityLabel } from '@/game/i18n';
import FilterChip from './shell/FilterChip';
import { rarityColor } from './locations/rarity';

interface Props {
  player: PlayerState;
  onMoveToSector: (timestamp: number, sector: number) => void;
  onBack: () => void;
}

type View = 'tank' | 'storage';

export default function Aquarium({ player, onMoveToSector, onBack }: Props) {
  const { lang, t } = useI18n();
  const [view, setView] = useState<View>('tank');
  const [activeSector, setActiveSector] = useState<number>(1);
  const [targetSector, setTargetSector] = useState<number | null>(null);

  const sectors = player.aquariumSectors || { 1: [], 2: [], 3: [], 4: [], 5: [] };
  const warehouse = player.aquariumWarehouse || [];
  const currentFish = sectors[activeSector] || [];

  return (
    <div
      className="screen-shell relative overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #0c4a6e 0%, #075985 35%, #0369a1 70%, #0c4a6e 100%)' }}
    >
      {/* Water texture + caustics */}
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage: `
            radial-gradient(ellipse at 20% 30%, rgba(255,255,255,0.15), transparent 40%),
            radial-gradient(ellipse at 80% 60%, rgba(125,211,252,0.2), transparent 50%),
            repeating-linear-gradient(110deg, transparent 0 12px, rgba(255,255,255,0.04) 12px 13px),
            repeating-linear-gradient(70deg, transparent 0 18px, rgba(255,255,255,0.03) 18px 19px)
          `,
        }}
      />
      {[...Array(6)].map((_, i) => (
        <motion.div
          key={i}
          className="pointer-events-none absolute rounded-full bg-cyan-200/10 blur-3xl"
          style={{ width: 200 + i * 40, height: 80 + i * 20, top: `${(i * 17) % 80}%`, left: `${(i * 23) % 80}%` }}
          animate={{ x: [0, 40, 0], y: [0, -20, 0], opacity: [0.2, 0.5, 0.2] }}
          transition={{ duration: 6 + i, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}

      {/* Crowd silhouettes along the bottom */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-44">
        <svg viewBox="0 0 1200 200" preserveAspectRatio="xMidYMax slice" className="h-full w-full">
          <defs>
            <linearGradient id="silG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#000" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#000" stopOpacity="0.85" />
            </linearGradient>
          </defs>
          {[
            { x: 60, h: 130, w: 38 }, { x: 130, h: 150, w: 42 }, { x: 210, h: 110, w: 30 },
            { x: 270, h: 140, w: 40 }, { x: 350, h: 155, w: 44 }, { x: 440, h: 100, w: 28 },
            { x: 500, h: 145, w: 42 }, { x: 580, h: 135, w: 38 }, { x: 650, h: 150, w: 44 },
            { x: 730, h: 115, w: 32 }, { x: 800, h: 145, w: 40 }, { x: 880, h: 155, w: 46 },
            { x: 970, h: 120, w: 34 }, { x: 1040, h: 140, w: 40 }, { x: 1120, h: 130, w: 38 },
          ].map((p, i) => {
            const cy = 200 - p.h;
            const headR = p.w * 0.35;
            return (
              <g key={i} fill="url(#silG)">
                <circle cx={p.x} cy={cy} r={headR} />
                <path d={`M ${p.x - p.w / 2} 200 Q ${p.x - p.w / 2} ${cy + headR + 5} ${p.x} ${cy + headR + 5} Q ${p.x + p.w / 2} ${cy + headR + 5} ${p.x + p.w / 2} 200 Z`} />
              </g>
            );
          })}
        </svg>
      </div>

      {/* Header */}
      <div className="relative z-10 mb-4 flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onBack}
          className="shrink-0 border-lure/25 bg-menu-panel/70 backdrop-blur-sm"
        >
          {t('loc.back')}
        </Button>
        <h1 className="font-display text-2xl font-black uppercase tracking-wide text-white drop-shadow-sm sm:text-3xl">
          {t('aquarium.title')}
        </h1>
        <Button
          size="sm"
          onClick={() => setView(view === 'tank' ? 'storage' : 'tank')}
          className="shrink-0 bg-lure font-semibold text-lure-foreground hover:bg-lure/90"
        >
          {view === 'tank' ? `${t('aquarium.storage')} (${warehouse.length})` : t('aquarium.tank')}
        </Button>
      </div>

      {view === 'tank' && (
        <>
          <div className="relative z-10 flex flex-wrap gap-1.5">
            {AQUARIUM_SECTORS.map(s => (
              <FilterChip key={s} active={activeSector === s} onClick={() => setActiveSector(s)}>
                {t('aquarium.sector')} {s} ({(sectors[s] || []).length})
              </FilterChip>
            ))}
          </div>

          <div className="relative z-0 mt-5 h-[58vh] overflow-hidden rounded-2xl border border-lure/25 bg-cyan-950/30 shadow-2xl backdrop-blur-xs">
            {currentFish.length === 0 ? (
              <div className="flex h-full items-center justify-center px-6 text-center text-cyan-50/80">
                <div>
                  <div className="mb-3 text-5xl">🌊</div>
                  <p className="text-lg font-semibold">{t('aquarium.emptySector')}</p>
                  <p className="mt-1 text-sm opacity-80">{t('aquarium.emptySectorMsg')}</p>
                </div>
              </div>
            ) : (
              currentFish.map((c, i) => {
                const img = FISH_IMAGES[c.fish.id];
                const seed = (c.timestamp + i * 131) % 10000;
                const rand = (n: number) => {
                  const v = Math.sin(seed * (n + 1) * 12.9898) * 43758.5453;
                  return v - Math.floor(v);
                };
                const xs = [rand(1), rand(2), rand(3), rand(4), rand(5), rand(1)].map(v => `${4 + v * 86}%`);
                const ys = [rand(6), rand(7), rand(8), rand(9), rand(10), rand(6)].map(v => `${4 + v * 82}%`);
                const dur = 22 + (seed % 18);
                const flip = rand(11) > 0.5;
                return (
                  <motion.div
                    key={c.timestamp + '-' + i}
                    className="absolute"
                    style={{ top: 0, left: 0 }}
                    animate={{ left: xs, top: ys }}
                    transition={{ duration: dur, repeat: Infinity, ease: 'easeInOut', times: [0, 0.2, 0.4, 0.6, 0.8, 1] }}
                  >
                    <motion.div
                      animate={{ y: [0, -6, 0, 6, 0], rotate: [-3, 3, -3] }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                      style={{ transform: flip ? 'scaleX(-1)' : undefined }}
                    >
                      {img ? (
                        <img src={img} alt={c.fish.name} className="h-20 w-20 object-contain drop-shadow-xl" />
                      ) : (
                        <div className="text-5xl">{c.fish.emoji}</div>
                      )}
                    </motion.div>
                  </motion.div>
                );
              })
            )}
          </div>
        </>
      )}

      {view === 'storage' && (
        <div className="relative z-10 pb-8">
          <div className="menu-panel mx-auto max-w-5xl rounded-2xl p-4">
            <h2 className="mb-3 font-display text-xl font-bold tracking-wide text-foreground">
              {t('aquarium.storage')} ({warehouse.length})
            </h2>

            <div className="mb-3 flex flex-wrap gap-1.5">
              {AQUARIUM_SECTORS.map(s => (
                <FilterChip
                  key={s}
                  active={targetSector === s}
                  onClick={() => setTargetSector(targetSector === s ? null : s)}
                >
                  {t('aquarium.sector')} {s} ({(sectors[s] || []).length})
                </FilterChip>
              ))}
            </div>
            <p className="mb-3 text-sm text-muted-foreground">
              {targetSector
                ? t('aquarium.sectorSelected').replace('{n}', String(targetSector))
                : t('aquarium.pickSectorFirst')}
            </p>

            {warehouse.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <div className="mb-2 text-4xl">📭</div>
                <p>{t('aquarium.storageEmpty')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
                {warehouse.map((c, i) => {
                  const tint = rarityColor(c.fish.rarity);
                  return (
                    <button
                      key={c.timestamp + '-' + i}
                      disabled={!targetSector}
                      onClick={() => targetSector && onMoveToSector(c.timestamp, targetSector)}
                      style={{ borderColor: tint }}
                      className="menu-panel flex flex-col items-center gap-1 rounded-xl p-3 text-center transition-transform enabled:hover:scale-[1.03] disabled:opacity-50"
                    >
                      {FISH_IMAGES[c.fish.id] ? (
                        <img src={FISH_IMAGES[c.fish.id]} alt={c.fish.name} className="h-14 w-14 object-contain" />
                      ) : (
                        <div className="text-3xl">{c.fish.emoji}</div>
                      )}
                      <p className="w-full truncate text-sm font-semibold text-foreground">{c.fish.name}</p>
                      <span className="text-[0.7rem] font-medium" style={{ color: tint }}>
                        {getRarityLabel(c.fish.rarity, lang)}
                      </span>
                      <p className="text-xs tabular-nums text-muted-foreground">{c.weight} kg</p>
                      <p className="text-[0.7rem] tabular-nums">
                        <span className="text-lure">💰 +{AQUARIUM_REWARDS[c.fish.rarity].coins}</span>{' '}
                        <span className="text-biolume">⭐ +{AQUARIUM_REWARDS[c.fish.rarity].xp}</span>
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
