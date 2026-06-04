import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { PlayerState, AQUARIUM_REWARDS, AQUARIUM_SECTORS, CaughtFish } from '@/game/types';
import { FISH_IMAGES } from '@/game/fishImages';
import { useI18n, getRarityLabel } from '@/game/i18n';

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
  const [selectedFish, setSelectedFish] = useState<CaughtFish | null>(null);

  const sectors = player.aquariumSectors || { 1: [], 2: [], 3: [], 4: [], 5: [] };
  const warehouse = player.aquariumWarehouse || [];
  const currentFish = sectors[activeSector] || [];

  return (
    <div
      className="min-h-screen relative overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, #0c4a6e 0%, #075985 35%, #0369a1 70%, #0c4a6e 100%)',
      }}
    >
      {/* Water texture overlay */}
      <div
        className="absolute inset-0 opacity-30 pointer-events-none"
        style={{
          backgroundImage: `
            radial-gradient(ellipse at 20% 30%, rgba(255,255,255,0.15), transparent 40%),
            radial-gradient(ellipse at 80% 60%, rgba(125,211,252,0.2), transparent 50%),
            repeating-linear-gradient(110deg, transparent 0 12px, rgba(255,255,255,0.04) 12px 13px),
            repeating-linear-gradient(70deg, transparent 0 18px, rgba(255,255,255,0.03) 18px 19px)
          `,
        }}
      />
      {/* Moving caustics */}
      {[...Array(6)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full bg-cyan-200/10 blur-3xl pointer-events-none"
          style={{
            width: 200 + i * 40,
            height: 80 + i * 20,
            top: `${(i * 17) % 80}%`,
            left: `${(i * 23) % 80}%`,
          }}
          animate={{ x: [0, 40, 0], y: [0, -20, 0], opacity: [0.2, 0.5, 0.2] }}
          transition={{ duration: 6 + i, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}

      {/* People silhouettes at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-44 pointer-events-none">
        <svg viewBox="0 0 1200 200" preserveAspectRatio="xMidYMax slice" className="w-full h-full">
          <defs>
            <linearGradient id="silG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#000" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#000" stopOpacity="0.85" />
            </linearGradient>
          </defs>
          {/* Crowd of people silhouettes */}
          {[
            { x: 60, h: 130, w: 38 },
            { x: 130, h: 150, w: 42 },
            { x: 210, h: 110, w: 30 }, // child
            { x: 270, h: 140, w: 40 },
            { x: 350, h: 155, w: 44 },
            { x: 440, h: 100, w: 28 }, // child
            { x: 500, h: 145, w: 42 },
            { x: 580, h: 135, w: 38 },
            { x: 650, h: 150, w: 44 },
            { x: 730, h: 115, w: 32 },
            { x: 800, h: 145, w: 40 },
            { x: 880, h: 155, w: 46 },
            { x: 970, h: 120, w: 34 },
            { x: 1040, h: 140, w: 40 },
            { x: 1120, h: 130, w: 38 },
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

      {/* Header bar */}
      <div className="relative z-10 flex items-center justify-between p-4">
        <Button variant="outline" onClick={onBack} className="bg-background/80 backdrop-blur">
          {t('loc.back')}
        </Button>
        <h1 className="text-3xl md:text-4xl font-black text-white drop-shadow-lg">
          🐠 {t('aquarium.title')}
        </h1>
        <Button
          onClick={() => { setView(view === 'tank' ? 'storage' : 'tank'); setSelectedFish(null); }}
          className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold shadow-lg"
        >
          {view === 'tank' ? `📦 ${t('aquarium.storage')} (${warehouse.length})` : `🐠 ${t('aquarium.tank')}`}
        </Button>
      </div>

      {view === 'tank' && (
        <>
          {/* Sector tabs top-left */}
          <div className="relative z-10 px-4 flex flex-wrap gap-2">
            {AQUARIUM_SECTORS.map(s => (
              <Button
                key={s}
                size="sm"
                variant={activeSector === s ? 'default' : 'outline'}
                onClick={() => setActiveSector(s)}
                className={activeSector === s ? 'bg-primary text-primary-foreground font-bold' : 'bg-background/80 backdrop-blur'}
              >
                {t('aquarium.sector')} {s} ({(sectors[s] || []).length})
              </Button>
            ))}
          </div>

          {/* Tank with swimming fish */}
          <div className="relative z-0 mt-6 mx-4 h-[60vh] rounded-2xl border-4 border-cyan-300/40 bg-cyan-900/30 backdrop-blur-sm overflow-hidden shadow-2xl">
            {currentFish.length === 0 ? (
              <div className="flex items-center justify-center h-full text-cyan-100/80 text-center px-6">
                <div>
                  <div className="text-6xl mb-3">🌊</div>
                  <p className="text-lg font-semibold">{t('aquarium.emptySector')}</p>
                  <p className="text-sm opacity-80 mt-1">{t('aquarium.emptySectorMsg')}</p>
                </div>
              </div>
            ) : (
              currentFish.map((c, i) => {
                const img = FISH_IMAGES[c.fish.id];
                const top = ((i * 53) % 80) + 5;
                const dur = 12 + ((i * 7) % 10);
                return (
                  <motion.div
                    key={c.timestamp + '-' + i}
                    className="absolute"
                    style={{ top: `${top}%`, left: '-15%' }}
                    animate={{ x: ['0%', '850%'] }}
                    transition={{ duration: dur, repeat: Infinity, ease: 'linear', delay: i * 0.5 }}
                  >
                    <motion.div
                      animate={{ y: [0, -6, 0, 6, 0] }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                    >
                      {img ? (
                        <img src={img} alt={c.fish.name} className="w-20 h-20 object-contain drop-shadow-xl" />
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
        <div className="relative z-10 px-4 pb-8">
          <div className="bg-background/90 backdrop-blur rounded-2xl p-4 max-w-5xl mx-auto">
            <h2 className="text-xl font-bold text-foreground mb-3">
              📦 {t('aquarium.storage')} ({warehouse.length})
            </h2>
            {warehouse.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <div className="text-5xl mb-2">📭</div>
                <p>{t('aquarium.storageEmpty')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {warehouse.map((c, i) => (
                  <button
                    key={c.timestamp + '-' + i}
                    onClick={() => setSelectedFish(c)}
                    className={`rounded-lg border-2 border-rarity-${c.fish.rarity} bg-card p-2 text-center hover:scale-105 transition-transform`}
                  >
                    {FISH_IMAGES[c.fish.id] ? (
                      <img src={FISH_IMAGES[c.fish.id]} alt={c.fish.name} className="w-16 h-16 object-contain mx-auto" />
                    ) : (
                      <div className="text-3xl">{c.fish.emoji}</div>
                    )}
                    <p className="text-sm font-bold text-foreground truncate">{c.fish.name}</p>
                    <p className={`text-xs font-semibold text-rarity-${c.fish.rarity}`}>
                      {getRarityLabel(c.fish.rarity, lang)}
                    </p>
                    <p className="text-xs text-muted-foreground">{c.weight} kg</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sector picker modal */}
      <AnimatePresence>
        {selectedFish && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setSelectedFish(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              onClick={e => e.stopPropagation()}
              className="bg-card border-2 border-primary rounded-2xl p-6 max-w-md w-full shadow-2xl"
            >
              <div className="text-center mb-4">
                {FISH_IMAGES[selectedFish.fish.id] ? (
                  <img src={FISH_IMAGES[selectedFish.fish.id]} alt={selectedFish.fish.name} className="w-24 h-24 object-contain mx-auto" />
                ) : (
                  <div className="text-5xl">{selectedFish.fish.emoji}</div>
                )}
                <h3 className="text-xl font-bold text-foreground mt-2">{selectedFish.fish.name}</h3>
                <p className={`text-sm font-semibold text-rarity-${selectedFish.fish.rarity}`}>
                  {getRarityLabel(selectedFish.fish.rarity, lang)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  💰 +{AQUARIUM_REWARDS[selectedFish.fish.rarity].coins} • ⭐ +{AQUARIUM_REWARDS[selectedFish.fish.rarity].xp} XP
                </p>
              </div>
              <p className="text-sm text-foreground text-center mb-3 font-semibold">
                {t('aquarium.pickSector')}
              </p>
              <div className="grid grid-cols-5 gap-2">
                {AQUARIUM_SECTORS.map(s => (
                  <Button
                    key={s}
                    onClick={() => {
                      onMoveToSector(selectedFish.timestamp, s);
                      setSelectedFish(null);
                    }}
                    className="bg-primary text-primary-foreground font-bold"
                  >
                    {s}
                  </Button>
                ))}
              </div>
              <Button variant="outline" onClick={() => setSelectedFish(null)} className="w-full mt-3">
                {t('loc.back')}
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
